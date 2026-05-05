import { getDb } from "@workspace/db";
import { ObjectId } from "mongodb";
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
  const db = await getDb();
  const now = new Date();
  await db.collection("transactions").insertOne({
    transactionType,
    direction: "outbound",
    partnerId,
    partnerName,
    controlNumber,
    status: "processed",
    integrityStatus: "valid",
    rawEdi,
    parsedJson,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
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

export async function handle850(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "850", transactionId });
  const summary = parsed.summary as {
    purchaseOrderNumber?: string;
    lineItems?: Array<{ productId: string; description: string; quantity: number; unitPrice: number; uom: string }>;
    totalAmount?: string;
  };

  const cn = transactionId.slice(-9).padStart(9, "0");

  const db = await getDb();
  const poCol = db.collection("purchase_orders");
  const txCol = db.collection("transactions");
  const now = new Date();

  const poNumber = summary.purchaseOrderNumber || `PO${cn}`;
  const existing = await poCol.findOne({ poNumber });
  if (!existing) {
    await poCol.insertOne({
      poNumber,
      direction: "inbound",
      partnerId: parsed.senderId,
      partnerName: PARTNERS[parsed.senderId]?.name || parsed.senderId,
      status: "pending",
      totalAmount: summary.totalAmount || "0",
      currency: "USD",
      items: summary.lineItems || [],
      createdAt: now,
      updatedAt: now,
    });
  }

  await txCol.updateOne(
    { _id: new ObjectId(transactionId) },
    { $set: { status: "processed", updatedAt: now } }
  );

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

  const supplierPartner = Object.values(PARTNERS).find((p) => p.type === "supplier");
  if (supplierPartner) {
    const cn850 = `${transactionId.slice(-6)}2000`.padStart(9, "0");
    const edi850Out = generateEdi("850", SERMACROPS_ID, supplierPartner.ediId, cn850, {
      poNumber: `SPO${cn}`,
      items: summary.lineItems?.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity * 1.05,
        unitPrice: 0,
      })) || [],
    });

    const spExisting = await poCol.findOne({ poNumber: `SPO${cn}` });
    if (!spExisting) {
      await poCol.insertOne({
        poNumber: `SPO${cn}`,
        direction: "outbound",
        partnerId: supplierPartner.id,
        partnerName: supplierPartner.name,
        status: "pending",
        totalAmount: "0",
        currency: "USD",
        items: summary.lineItems || [],
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordOutbound("850", supplierPartner.id, supplierPartner.name, cn850, edi850Out, {
      poNumber: `SPO${cn}`,
    });
    await sendToParter("850", supplierPartner.id, edi850Out);

    log.info("EDI 850 sent to supplier partner");
  }
}

export async function handle855(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "855", transactionId });
  const summary = parsed.summary as { purchaseOrderNumber?: string; acknowledgeCode?: string };

  const db = await getDb();
  const now = new Date();

  if (summary.purchaseOrderNumber) {
    await db.collection("purchase_orders").updateOne(
      { poNumber: summary.purchaseOrderNumber },
      { $set: { status: "acknowledged", updatedAt: now } }
    );
  }

  await db.collection("transactions").updateOne(
    { _id: new ObjectId(transactionId) },
    { $set: { status: "acknowledged", updatedAt: now } }
  );

  log.info({ poNumber: summary.purchaseOrderNumber }, "EDI 855 processed — PO acknowledged");
}

export async function handle856(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "856", transactionId });
  const cn = transactionId.slice(-6).padStart(9, "0");

  const db = await getDb();
  const now = new Date();

  await db.collection("transactions").updateOne(
    { _id: new ObjectId(transactionId) },
    { $set: { status: "processed", updatedAt: now } }
  );

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

export async function handle810(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "810", transactionId });
  const summary = parsed.summary as { purchaseOrderNumber?: string; invoiceNumber?: string; totalAmount?: string };

  const db = await getDb();
  const now = new Date();

  if (summary.purchaseOrderNumber) {
    await db.collection("purchase_orders").updateOne(
      { poNumber: summary.purchaseOrderNumber },
      { $set: { status: "invoiced", updatedAt: now } }
    );
  }

  await db.collection("transactions").updateOne(
    { _id: new ObjectId(transactionId) },
    { $set: { status: "processed", updatedAt: now } }
  );

  log.info({ invoiceNumber: summary.invoiceNumber }, "EDI 810 processed — invoice recorded");
}

export async function handle204(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "204", transactionId });
  const db = await getDb();
  const now = new Date();

  await db.collection("transactions").updateOne(
    { _id: new ObjectId(transactionId) },
    { $set: { status: "processed", updatedAt: now } }
  );
  log.info("EDI 204 processed — load tender sent");
}

export async function handle990(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "990", transactionId });
  const cn = transactionId.slice(-6).padStart(9, "0");

  const db = await getDb();
  const now = new Date();

  await db.collection("transactions").updateOne(
    { _id: new ObjectId(transactionId) },
    { $set: { status: "acknowledged", updatedAt: now } }
  );

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
