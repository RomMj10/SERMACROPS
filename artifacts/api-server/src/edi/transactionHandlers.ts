import { getDb } from "@workspace/db";
import { ObjectId } from "mongodb";
import { generateEdi } from "./parser";
import { createAs2Message, sendAs2Message } from "./as2Client";
import { logger } from "../lib/logger";
import { PARTNERS } from "./config";
import type { ParsedEdiDocument } from "./parser";

const SERMACROPS_ID = "SERMACROPS";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function enrichTransaction(
  transactionId: string,
  status: string,
  enrichment: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  await db.collection("transactions").updateOne(
    { _id: new ObjectId(transactionId) },
    {
      $set: {
        status,
        updatedAt: new Date(),
        ...Object.fromEntries(
          Object.entries(enrichment).map(([k, v]) => [`parsedJson.${k}`, v])
        ),
      },
    }
  );
}

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

async function sendToPartner(
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

// ─────────────────────────────────────────────────────────────────────────────
// 850 – Purchase Order
// ─────────────────────────────────────────────────────────────────────────────

export async function handle850(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "850", transactionId });
  const summary = parsed.summary as {
    purchaseOrderNumber?: string;
    purchaseOrderDate?: string;
    lineItems?: Array<{ lineNumber?: number; productId: string; description: string; quantity: number; unitPrice: number; uom: string }>;
    totalAmount?: string;
    lineCount?: number;
  };

  const cn  = transactionId.slice(-9).padStart(9, "0");
  const db  = await getDb();
  const now = new Date();
  const poCol  = db.collection("purchase_orders");

  const poNumber    = summary.purchaseOrderNumber || `PO${cn}`;
  const totalAmount = parseFloat(summary.totalAmount || "0") || 0;

  // Create inbound PO record
  const existing = await poCol.findOne({ poNumber });
  let poId: string | undefined;
  if (!existing) {
    const ins = await poCol.insertOne({
      poNumber,
      direction: "inbound",
      partnerId: parsed.senderId,
      partnerName: PARTNERS[parsed.senderId]?.name || parsed.senderId,
      status: "pending",
      totalAmount,
      currency: "USD",
      items: summary.lineItems || [],
      purchaseOrderDate: summary.purchaseOrderDate,
      createdAt: now,
      updatedAt: now,
    });
    poId = ins.insertedId.toHexString();
  } else {
    poId = (existing._id as ObjectId).toHexString();
  }

  // Enrich the inbound transaction with full PO content
  await enrichTransaction(transactionId, "processed", {
    poNumber,
    poId,
    purchaseOrderDate: summary.purchaseOrderDate,
    lineItems: summary.lineItems || [],
    lineCount: summary.lineCount || (summary.lineItems?.length ?? 0),
    totalAmount,
    currency: "USD",
    senderId: parsed.senderId,
    receiverId: parsed.receiverId,
    action: "inbound_po_created",
  });

  log.info({ poNumber, poId }, "EDI 850 processed — inbound PO created");

  // Generate outbound 850 to supplier
  const supplierPartner = Object.values(PARTNERS).find((p) => p.type === "supplier");
  if (supplierPartner) {
    const cn850 = `${transactionId.slice(-6)}2000`.padStart(9, "0");
    const spPoNumber = `SPO${cn}`;

    const outboundItems = summary.lineItems?.map((item) => ({
      productId: item.productId,
      description: item.description,
      quantity: Math.ceil(item.quantity * 1.05), // 5% buffer
      unitPrice: 0,
      uom: item.uom,
    })) || [];

    const edi850Out = generateEdi("850", SERMACROPS_ID, supplierPartner.ediId, cn850, {
      poNumber: spPoNumber,
      items: outboundItems,
    });

    const spExisting = await poCol.findOne({ poNumber: spPoNumber });
    if (!spExisting) {
      await poCol.insertOne({
        poNumber: spPoNumber,
        direction: "outbound",
        partnerId: supplierPartner.id,
        partnerName: supplierPartner.name,
        status: "pending",
        totalAmount: 0,
        currency: "USD",
        items: outboundItems,
        relatedPoNumber: poNumber,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordOutbound("850", supplierPartner.id, supplierPartner.name, cn850, edi850Out, {
      poNumber: spPoNumber,
      relatedInboundPo: poNumber,
      lineItems: outboundItems,
      lineCount: outboundItems.length,
      totalAmount: 0,
      currency: "USD",
      action: "outbound_supplier_po",
    });

    await sendToPartner("850", supplierPartner.id, edi850Out);
    log.info({ spPoNumber }, "Outbound EDI 850 sent to supplier");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 855 – PO Acknowledgment
// ─────────────────────────────────────────────────────────────────────────────

export async function handle855(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "855", transactionId });
  const summary = parsed.summary as {
    purchaseOrderNumber?: string;
    acknowledgeCode?: string;
    date?: string;
  };

  const db  = await getDb();
  const now = new Date();

  const ackCodeLabels: Record<string, string> = {
    AC: "Accepted",
    AW: "Accepted with Changes",
    RD: "Rejected",
    RJ: "Rejected",
  };
  const ackLabel = ackCodeLabels[summary.acknowledgeCode?.toUpperCase() || ""] || summary.acknowledgeCode || "Unknown";

  if (summary.purchaseOrderNumber) {
    await db.collection("purchase_orders").updateOne(
      { poNumber: summary.purchaseOrderNumber },
      { $set: { status: "acknowledged", updatedAt: now } }
    );
  }

  await enrichTransaction(transactionId, "acknowledged", {
    poNumber: summary.purchaseOrderNumber,
    acknowledgeCode: summary.acknowledgeCode,
    acknowledgeLabel: ackLabel,
    date: summary.date,
    senderId: parsed.senderId,
    action: "po_acknowledged",
  });

  log.info({ poNumber: summary.purchaseOrderNumber, ackLabel }, "EDI 855 processed — PO acknowledged");
}

// ─────────────────────────────────────────────────────────────────────────────
// 856 – Advance Ship Notice
// ─────────────────────────────────────────────────────────────────────────────

export async function handle856(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "856", transactionId });
  const summary = parsed.summary as {
    shipmentId?: string;
    shipDate?: string;
    hierarchicalLevels?: number;
  };

  const cn  = transactionId.slice(-6).padStart(9, "0");
  const db  = await getDb();
  const now = new Date();

  await enrichTransaction(transactionId, "processed", {
    shipmentId: summary.shipmentId,
    shipDate: summary.shipDate,
    hierarchicalLevels: summary.hierarchicalLevels,
    senderId: parsed.senderId,
    action: "shipment_noticed",
  });

  // Trigger load tender to logistics partner
  const logisticsPartner = Object.values(PARTNERS).find((p) => p.type === "logistics");
  if (logisticsPartner) {
    const edi204 = generateEdi("204", SERMACROPS_ID, logisticsPartner.ediId, cn, {
      shipmentId: summary.shipmentId || `SHP${cn}`,
    });
    await recordOutbound("204", logisticsPartner.id, logisticsPartner.name, cn, edi204, {
      shipmentId: summary.shipmentId || `SHP${cn}`,
      action: "load_tender_sent",
    });
    await sendToPartner("204", logisticsPartner.id, edi204);
    log.info({ shipmentId: summary.shipmentId }, "EDI 204 sent to logistics provider");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 810 – Invoice
// ─────────────────────────────────────────────────────────────────────────────

export async function handle810(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "810", transactionId });
  const summary = parsed.summary as {
    invoiceNumber?: string;
    invoiceDate?: string;
    purchaseOrderNumber?: string;
    totalAmount?: string;
  };

  const db  = await getDb();
  const now = new Date();
  const totalAmount = parseFloat((summary.totalAmount || "0").replace(/^0+/, "") || "0") / 100;

  if (summary.purchaseOrderNumber) {
    await db.collection("purchase_orders").updateOne(
      { poNumber: summary.purchaseOrderNumber },
      {
        $set: {
          status: "invoiced",
          invoiceNumber: summary.invoiceNumber,
          invoiceDate: summary.invoiceDate,
          invoicedAmount: totalAmount,
          updatedAt: now,
        },
      }
    );
  }

  await enrichTransaction(transactionId, "processed", {
    invoiceNumber: summary.invoiceNumber,
    invoiceDate: summary.invoiceDate,
    poNumber: summary.purchaseOrderNumber,
    totalAmount,
    currency: "USD",
    senderId: parsed.senderId,
    action: "invoice_received",
  });

  log.info({ invoiceNumber: summary.invoiceNumber, totalAmount }, "EDI 810 processed — invoice recorded");
}

// ─────────────────────────────────────────────────────────────────────────────
// 204 – Motor Carrier Load Tender
// ─────────────────────────────────────────────────────────────────────────────

export async function handle204(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "204", transactionId });
  const summary = parsed.summary as {
    shipmentId?: string;
    carrierAlpha?: string;
    referencePairs?: Array<{ ref: string; qualifier: string }>;
  };

  const poRef = summary.referencePairs?.find((p) => p.qualifier === "PO")?.ref;

  await enrichTransaction(transactionId, "processed", {
    shipmentId: summary.shipmentId,
    carrierCode: summary.carrierAlpha,
    poReference: poRef,
    referencePairs: summary.referencePairs || [],
    senderId: parsed.senderId,
    action: "load_tender_sent",
  });

  log.info({ shipmentId: summary.shipmentId }, "EDI 204 processed — load tender");
}

// ─────────────────────────────────────────────────────────────────────────────
// 990 – Response to Load Tender
// ─────────────────────────────────────────────────────────────────────────────

export async function handle990(parsed: ParsedEdiDocument, transactionId: string): Promise<void> {
  const log = logger.child({ handler: "990", transactionId });
  const summary = parsed.summary as {
    standardCarrierAlphaCode?: string;
    shipmentId?: string;
    date?: string;
  };

  const cn  = transactionId.slice(-6).padStart(9, "0");
  const db  = await getDb();
  const now = new Date();

  await enrichTransaction(transactionId, "acknowledged", {
    shipmentId: summary.shipmentId,
    carrierCode: summary.standardCarrierAlphaCode,
    responseDate: summary.date,
    senderId: parsed.senderId,
    action: "load_tender_accepted",
  });

  // Send ASN (856) + Invoice (810) to client
  const clientPartner = Object.values(PARTNERS).find((p) => p.type === "client");
  if (clientPartner) {
    const edi856 = generateEdi("856", SERMACROPS_ID, clientPartner.ediId, cn, {
      poNumber: "PO001",
      items: [{ productId: "COFFEE001", description: "Coffee Beans", quantity: 500 }],
    });
    const cn810 = String(Number(cn) + 1).padStart(9, "0");
    const edi810 = generateEdi("810", SERMACROPS_ID, clientPartner.ediId, cn810, {
      poNumber: "PO001",
      invoiceNumber: `INV${cn}`,
      totalAmount: 2500,
      items: [{ productId: "COFFEE001", quantity: 500, unitPrice: 5.0 }],
    });

    await recordOutbound("856", clientPartner.id, clientPartner.name, cn, edi856, {
      shipmentId: summary.shipmentId,
      action: "asn_sent_to_client",
    });
    await recordOutbound("810", clientPartner.id, clientPartner.name, cn810, edi810, {
      invoiceNumber: `INV${cn}`,
      totalAmount: 2500,
      currency: "USD",
      action: "invoice_sent_to_client",
    });
    await sendToPartner("856", clientPartner.id, edi856);
    await sendToPartner("810", clientPartner.id, edi810);
    log.info("EDI 856 and 810 sent to client after load tender accepted");
  }
}
