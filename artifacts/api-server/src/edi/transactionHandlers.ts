import { db } from "@workspace/db";
import { transactionsTable, purchaseOrdersTable, inventoryTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { generateEdi } from "./parser";
import { createAs2Message, sendAs2Message } from "./as2Client";
import { logger } from "../lib/logger";
import { PARTNERS } from "./config";
import type { ParsedEdiDocument } from "./parser";

const SERMACROPS_ID = "SERMACROPS";

async function recordOutbound(
  transactionType: string,
  partnerId: string,
  partnerName: string,
  controlNumber: string,
  rawEdi: string,
  parsedJson: Record<string, unknown>
): Promise<void> {
  await db.insert(transactionsTable).values({
    transactionType,
    direction: "outbound",
    partnerId,
    partnerName,
    controlNumber,
    status: "processed",
    integrityStatus: "valid",
    rawEdi,
    parsedJson,
  });
}

async function sendToParter(
  transactionType: string,
  partnerId: string,
  rawEdi: string
): Promise<void> {
  const partner = PARTNERS[partnerId];
  if (!partner) {
    logger.warn({ partnerId }, "Partner not found for outbound send");
    return;
  }
  const as2Msg = createAs2Message(SERMACROPS_ID, partner.as2Id, rawEdi, transactionType);
  const result = await sendAs2Message(partner.endpointUrl, as2Msg);
  if (!result.success) {
    logger.error({ partnerId, error: result.error }, "AS2 send failed");
  }
}

export async function handle850(parsed: ParsedEdiDocument, transactionId: number): Promise<void> {
  const log = logger.child({ handler: "850", transactionId });
  const summary = parsed.summary as {
    purchaseOrderNumber?: string;
    lineItems?: Array<{ productId: string; description: string; quantity: number; unitPrice: number; uom: string }>;
    totalAmount?: string;
  };

  const cn = String(transactionId + 1000).padStart(9, "0");

  await db.insert(purchaseOrdersTable).values({
    poNumber: summary.purchaseOrderNumber || `PO${cn}`,
    direction: "inbound",
    partnerId: parsed.senderId,
    partnerName: PARTNERS[parsed.senderId]?.name || parsed.senderId,
    status: "pending",
    totalAmount: summary.totalAmount || "0",
    currency: "USD",
    items: summary.lineItems || [],
  }).onConflictDoNothing();

  await db.update(transactionsTable)
    .set({ status: "processed", updatedAt: new Date() })
    .where(eq(transactionsTable.id, transactionId));

  log.info("EDI 850 processed — PO created");

  const edi855 = generateEdi("855", SERMACROPS_ID, parsed.senderId, cn, {
    purchaseOrderNumber: summary.purchaseOrderNumber,
    acknowledgeCode: "AC",
  });

  await recordOutbound("855", parsed.senderId, PARTNERS[parsed.senderId]?.name || parsed.senderId, cn, edi855, {
    purchaseOrderNumber: summary.purchaseOrderNumber,
    acknowledgeCode: "AC",
  });

  await sendToParter("855", parsed.senderId, edi855);

  const rawMaterialsPartner = Object.values(PARTNERS).find((p) => p.type === "supplier");
  if (rawMaterialsPartner) {
    const cn850 = String(transactionId + 2000).padStart(9, "0");
    const edi850Out = generateEdi("850", SERMACROPS_ID, rawMaterialsPartner.ediId, cn850, {
      poNumber: `SPO${cn}`,
      items: summary.lineItems?.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity * 1.05,
        unitPrice: 0,
      })) || [],
    });

    await db.insert(purchaseOrdersTable).values({
      poNumber: `SPO${cn}`,
      direction: "outbound",
      partnerId: rawMaterialsPartner.id,
      partnerName: rawMaterialsPartner.name,
      status: "pending",
      totalAmount: "0",
      currency: "USD",
      items: summary.lineItems || [],
    }).onConflictDoNothing();

    await recordOutbound("850", rawMaterialsPartner.id, rawMaterialsPartner.name, cn850, edi850Out, {
      poNumber: `SPO${cn}`,
    });
    await sendToParter("850", rawMaterialsPartner.id, edi850Out);

    log.info("EDI 850 sent to raw materials supplier");
  }
}

export async function handle855(parsed: ParsedEdiDocument, transactionId: number): Promise<void> {
  const log = logger.child({ handler: "855", transactionId });
  const summary = parsed.summary as { purchaseOrderNumber?: string; acknowledgeCode?: string };

  if (summary.purchaseOrderNumber) {
    await db.update(purchaseOrdersTable)
      .set({ status: "acknowledged", updatedAt: new Date() })
      .where(eq(purchaseOrdersTable.poNumber, summary.purchaseOrderNumber));
  }

  await db.update(transactionsTable)
    .set({ status: "acknowledged", updatedAt: new Date() })
    .where(eq(transactionsTable.id, transactionId));

  log.info({ poNumber: summary.purchaseOrderNumber }, "EDI 855 processed — PO acknowledged");
}

export async function handle856(parsed: ParsedEdiDocument, transactionId: number): Promise<void> {
  const log = logger.child({ handler: "856", transactionId });
  const cn = String(transactionId + 3000).padStart(9, "0");

  await db.update(transactionsTable)
    .set({ status: "processed", updatedAt: new Date() })
    .where(eq(transactionsTable.id, transactionId));

  const partner = Object.values(PARTNERS).find((p) => p.type === "logistics");
  if (partner) {
    const edi204 = generateEdi("204", SERMACROPS_ID, partner.ediId, cn, {
      shipmentId: `SHP${cn}`,
    });

    await recordOutbound("204", partner.id, partner.name, cn, edi204, { shipmentId: `SHP${cn}` });
    await sendToParter("204", partner.id, edi204);
    log.info("EDI 204 sent to logistics provider");
  }
}

export async function handle810(parsed: ParsedEdiDocument, transactionId: number): Promise<void> {
  const log = logger.child({ handler: "810", transactionId });
  const summary = parsed.summary as { purchaseOrderNumber?: string; invoiceNumber?: string; totalAmount?: string };

  if (summary.purchaseOrderNumber) {
    await db.update(purchaseOrdersTable)
      .set({ status: "invoiced", updatedAt: new Date() })
      .where(eq(purchaseOrdersTable.poNumber, summary.purchaseOrderNumber));
  }

  await db.update(transactionsTable)
    .set({ status: "processed", updatedAt: new Date() })
    .where(eq(transactionsTable.id, transactionId));

  log.info({ invoiceNumber: summary.invoiceNumber }, "EDI 810 processed — invoice recorded");
}

export async function handle204(parsed: ParsedEdiDocument, transactionId: number): Promise<void> {
  const log = logger.child({ handler: "204", transactionId });
  await db.update(transactionsTable)
    .set({ status: "processed", updatedAt: new Date() })
    .where(eq(transactionsTable.id, transactionId));
  log.info("EDI 204 processed — load tender sent");
}

export async function handle990(parsed: ParsedEdiDocument, transactionId: number): Promise<void> {
  const log = logger.child({ handler: "990", transactionId });
  const cn = String(transactionId + 4000).padStart(9, "0");

  await db.update(transactionsTable)
    .set({ status: "acknowledged", updatedAt: new Date() })
    .where(eq(transactionsTable.id, transactionId));

  const clientPartner = Object.values(PARTNERS).find((p) => p.type === "client");
  if (clientPartner) {
    const edi856 = generateEdi("856", SERMACROPS_ID, clientPartner.ediId, cn, {
      poNumber: "PO001",
      items: [{ productId: "COFFEE001", description: "Coffee Beans", quantity: 500 }],
    });
    const edi810 = generateEdi("810", SERMACROPS_ID, clientPartner.ediId, String(Number(cn) + 1).padStart(9, "0"), {
      poNumber: "PO001",
      invoiceNumber: `INV${cn}`,
      totalAmount: 2500,
      items: [{ productId: "COFFEE001", quantity: 500, unitPrice: 5.0 }],
    });

    await recordOutbound("856", clientPartner.id, clientPartner.name, cn, edi856, {});
    await recordOutbound("810", clientPartner.id, clientPartner.name, String(Number(cn) + 1).padStart(9, "0"), edi810, {});
    await sendToParter("856", clientPartner.id, edi856);
    await sendToParter("810", clientPartner.id, edi810);
    log.info("EDI 856 and 810 sent to Coffee Shop client");
  }
}
