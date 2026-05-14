import { Router } from "express";
import multer from "multer";
import { ObjectId } from "mongodb";
import { getDb } from "@workspace/db";
import { routeEdiDocument } from "../edi/router";
import { generateEdi, parseEdi } from "../edi/parser";
import {
  parseCsv,
  csvToEdi,
  validateAnsiX12,
  getCsvTemplate,
  inferDocTypeFromCsv,
  DOC_TYPE_SPECS,
  type EdiDocType,
} from "../edi/csvConverter";
import { PARTNERS } from "../edi/config";
import { logger } from "../lib/logger";
import { createAs2Message, sendAs2Message } from "../edi/as2Client";
import {
  SimulateEdiTransactionParams,
  SimulateEdiTransactionBody,
} from "@workspace/api-zod";

const router = Router();
const SERMACROPS_ID = "SERMACROPS";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const KNOWN_DOC_TYPES: EdiDocType[] = ["850", "855", "856", "810", "204", "990", "861"];

// ─── CSV upload (main inbound endpoint) ──────────────────────────────────────

router.post("/edi/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "bad_request",
      message: "No CSV file uploaded. Use multipart field name 'file'.",
    });
  }

  const csvText = req.file.buffer.toString("utf-8");

  // 1. Parse CSV
  let rows;
  try {
    rows = parseCsv(csvText);
  } catch (err) {
    return res.status(422).json({
      error: "csv_parse_error",
      message: err instanceof Error ? err.message : "Failed to parse CSV",
    });
  }

  // 2. Auto-detect doc type from CSV headers
  let docType: EdiDocType;
  try {
    docType = inferDocTypeFromCsv(rows);
  } catch (err) {
    return res.status(422).json({
      error: "doc_type_detection_failed",
      message: err instanceof Error ? err.message : "Could not detect document type",
    });
  }

  // 3. Auto-detect partner from CSV's partner_id column
  const partnerIdFromCsv = (rows[0]?.partner_id || "").trim().toUpperCase();
  const partnerId: string = (req.body?.partnerId || partnerIdFromCsv || "").trim().toUpperCase();
  if (!partnerId) {
    return res.status(400).json({
      error: "bad_request",
      message: "Could not determine partner. Add a 'partner_id' column to your CSV.",
    });
  }

  const partner = PARTNERS[partnerId];
  if (!partner) {
    return res.status(400).json({ error: "bad_request", message: `Unknown partner: ${partnerId}` });
  }

  // 4. Convert CSV → ANSI X12 EDI
  const cn = String(Date.now()).slice(-9);
  let rawEdi: string;
  try {
    rawEdi = csvToEdi(rows, docType, partnerId, "SERMACROPS", cn);
  } catch (err) {
    return res.status(422).json({
      error: "csv_conversion_error",
      message: err instanceof Error ? err.message : "Failed to convert CSV to EDI",
    });
  }

  // 5. Validate ANSI X12 structure
  const validation = validateAnsiX12(rawEdi);
  if (!validation.valid) {
    return res.status(422).json({
      error: "ansi_x12_validation_failed",
      message: "Generated EDI failed ANSI X12 validation.",
      errors: validation.errors,
    });
  }

  // 6. Parse the generated EDI back to structured JSON for the response
  const parsedEdiJson = parseEdi(rawEdi);

  logger.info(
    { partnerId, docType, rowCount: rows.length, cn },
    `CSV uploaded and converted to ANSI X12 EDI ${docType}`
  );

  // ── Special case: 850 from a CLIENT partner → hold for manual acceptance ──
  if (docType === "850" && partner.type === "client") {
    const db = await getDb();
    const now = new Date();

    // Store as pending_acceptance transaction
    const ins = await db.collection("transactions").insertOne({
      transactionType: "850",
      direction: "inbound",
      partnerId,
      partnerName: partner.name,
      controlNumber: cn,
      status: "pending_acceptance",
      integrityStatus: "valid",
      rawEdi,
      parsedJson: {
        ...parsedEdiJson.summary,
        envelope: { senderId: partnerId, receiverId: SERMACROPS_ID },
      },
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    const transactionId = ins.insertedId.toHexString();

    // Build inventory comparison snapshot
    const lineItems = (parsedEdiJson.summary.lineItems as any[]) || [];
    const invCol = db.collection("inventory");
    const inventoryComparison = await Promise.all(
      lineItems.map(async (item: any) => {
        const inv = await invCol.findOne({ productId: item.productId });
        const currentAvailable = inv
          ? Math.max(0, Number(inv.quantityOnHand) - Number(inv.quantityReserved))
          : 0;
        const afterAvailable = currentAvailable - item.quantity;
        return {
          productId: item.productId,
          description: item.description || item.productId,
          orderedQty: item.quantity,
          uom: item.uom || "EA",
          unitPrice: item.unitPrice || 0,
          beforeAvailable: currentAvailable,
          afterAvailable,
          reorderPoint: inv ? Number(inv.reorderPoint) : 0,
          canFulfill: afterAvailable >= 0,
        };
      })
    );

    return res.json({
      success: true,
      pending: true,
      transactionId,
      transactionType: "850",
      partnerId,
      partnerName: partner.name,
      detectedDocType: "850",
      detectedDocLabel: DOC_TYPE_SPECS["850"].label,
      csvRowsProcessed: rows.length,
      generatedEdi: rawEdi,
      parsedEdiJson,
      inventoryComparison,
      message: "EDI 850 parsed and ready for manual acceptance.",
    });
  }

  // 7. Route / process the EDI document (all non-850-client types)
  const result = await routeEdiDocument(rawEdi);

  return res.json({
    ...result,
    detectedDocType: docType,
    detectedDocLabel: DOC_TYPE_SPECS[docType].label,
    csvRowsProcessed: rows.length,
    generatedEdi: rawEdi,
    parsedEdiJson,
  });
});

// ─── Accept a pending 850 from a client ──────────────────────────────────────

router.post("/edi/accept-850/:txId", async (req, res) => {
  if (!ObjectId.isValid(req.params.txId)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid transaction ID" });
  }

  const db = await getDb();
  const txCol  = db.collection("transactions");
  const poCol  = db.collection("purchase_orders");
  const invCol = db.collection("inventory");
  const now = new Date();

  const tx = await txCol.findOne({ _id: new ObjectId(req.params.txId) });
  if (!tx) return res.status(404).json({ error: "not_found", message: "Transaction not found" });
  if (tx.transactionType !== "850") {
    return res.status(400).json({ error: "bad_request", message: "Only 850 transactions can be accepted here" });
  }
  if (tx.status !== "pending_acceptance") {
    return res.status(400).json({ error: "bad_request", message: `Transaction status is already: ${tx.status}` });
  }

  const partnerId  = tx.partnerId as string;
  const partner    = PARTNERS[partnerId];
  const partnerName = partner?.name || partnerId;
  const parsedJson = tx.parsedJson as any;
  const poNumber   = parsedJson?.purchaseOrderNumber || `PO${req.params.txId.slice(-6)}`;
  const lineItems: any[] = parsedJson?.lineItems || [];
  const totalAmount = lineItems.reduce((s: number, i: any) => s + (i.quantity || 0) * (i.unitPrice || 0), 0);

  // 1. Deduct inventory for each ordered item
  for (const item of lineItems) {
    const inv = await invCol.findOne({ productId: item.productId });
    if (inv) {
      const newOnHand = Math.max(0, Number(inv.quantityOnHand) - Number(item.quantity));
      await invCol.updateOne(
        { productId: item.productId },
        { $set: { quantityOnHand: String(newOnHand), updatedAt: now } }
      );
    }
  }

  // 2. Create inbound PO record
  const existing = await poCol.findOne({ poNumber });
  if (!existing) {
    await poCol.insertOne({
      poNumber,
      direction: "inbound",
      partnerId,
      partnerName,
      status: "acknowledged",
      totalAmount,
      currency: "USD",
      items: lineItems,
      purchaseOrderDate: parsedJson?.purchaseOrderDate,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await poCol.updateOne({ poNumber }, { $set: { status: "acknowledged", updatedAt: now } });
  }

  const cn855 = String(Date.now()).slice(-9);
  const cn810 = String(Number(cn855) + 1).toString().slice(-9);
  const cn204 = String(Number(cn855) + 2).toString().slice(-9);
  const shipmentId = `SHP${cn855}`;

  // 3. Generate EDI 855 Acknowledgment → send to client
  const edi855 = generateEdi("855", SERMACROPS_ID, partnerId, cn855, {
    purchaseOrderNumber: poNumber,
    acknowledgeCode: "AC",
  });

  await txCol.insertOne({
    transactionType: "855",
    direction: "outbound",
    partnerId,
    partnerName,
    controlNumber: cn855,
    status: "processed",
    integrityStatus: "valid",
    rawEdi: edi855,
    parsedJson: { purchaseOrderNumber: poNumber, acknowledgeCode: "AC", action: "po_acknowledged" },
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  });

  // 4. Generate EDI 810 Invoice → send to client
  const invoiceNumber = `INV${cn855}`;
  const edi810 = generateEdi("810", SERMACROPS_ID, partnerId, cn810, {
    poNumber,
    invoiceNumber,
    totalAmount,
    items: lineItems.map((i: any) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice || 0,
    })),
  });

  await txCol.insertOne({
    transactionType: "810",
    direction: "outbound",
    partnerId,
    partnerName,
    controlNumber: cn810,
    status: "processed",
    integrityStatus: "valid",
    rawEdi: edi810,
    parsedJson: { invoiceNumber, purchaseOrderNumber: poNumber, totalAmount, currency: "USD", action: "invoice_sent_to_client" },
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  });

  // 5. Update original 850 transaction → processed
  await txCol.updateOne(
    { _id: new ObjectId(req.params.txId) },
    {
      $set: {
        status: "processed",
        updatedAt: now,
        "parsedJson.action": "inbound_po_accepted",
        "parsedJson.invoiceNumber": invoiceNumber,
        "parsedJson.poId": poNumber,
      },
    }
  );

  // 5b. Generate EDI 204 Load Tender → send to logistics partner
  const logisticsPartner = Object.values(PARTNERS).find((p) => p.type === "logistics");
  let edi204: string | null = null;
  let logisticsPartnerId: string | null = null;
  let logisticsPartnerName: string | null = null;

  if (logisticsPartner) {
    logisticsPartnerId = logisticsPartner.id;
    logisticsPartnerName = logisticsPartner.name;
    edi204 = generateEdi("204", SERMACROPS_ID, logisticsPartner.ediId, cn204, {
      shipmentId,
      poNumber,
    });

    await txCol.insertOne({
      transactionType: "204",
      direction: "outbound",
      partnerId: logisticsPartner.id,
      partnerName: logisticsPartner.name,
      controlNumber: cn204,
      status: "processed",
      integrityStatus: "valid",
      rawEdi: edi204,
      parsedJson: {
        shipmentId,
        poNumber,
        relatedClientPo: poNumber,
        invoiceNumber,
        action: "load_tender_sent",
      },
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 6. Send via AS2 (non-fatal)
  if (partner) {
    try {
      const as2_855 = createAs2Message(SERMACROPS_ID, partner.as2Id, edi855, "855");
      const as2_810 = createAs2Message(SERMACROPS_ID, partner.as2Id, edi810, "810");
      const sends: Promise<unknown>[] = [
        sendAs2Message(partner.endpointUrl, as2_855),
        sendAs2Message(partner.endpointUrl, as2_810),
      ];
      if (logisticsPartner && edi204) {
        const as2_204 = createAs2Message(SERMACROPS_ID, logisticsPartner.as2Id, edi204, "204");
        sends.push(sendAs2Message(logisticsPartner.endpointUrl, as2_204));
      }
      await Promise.allSettled(sends);
    } catch (err) {
      logger.warn({ err, partnerId }, "AS2 send error on accept-850 (non-fatal)");
    }
  }

  logger.info(
    { txId: req.params.txId, poNumber, partnerId, invoiceNumber, shipmentId, logisticsPartnerId },
    "850 accepted — inventory updated, 855 + 810 sent to client, 204 sent to logistics"
  );

  return res.json({
    success: true,
    poNumber,
    invoiceNumber,
    shipmentId,
    partnerId,
    partnerName,
    logisticsPartnerId,
    logisticsPartnerName,
    totalAmount,
    message: `PO ${poNumber} accepted. EDI 855 (ACK) and EDI 810 (Invoice) sent to ${partnerName}. EDI 204 (Load Tender) dispatched to ${logisticsPartnerName}.`,
    edi855,
    edi810,
    edi204,
  });
});

// ─── Per-type CSV template download ──────────────────────────────────────────

router.get("/edi/template/:docType", (req, res) => {
  const docType = req.params.docType as EdiDocType;
  if (!KNOWN_DOC_TYPES.includes(docType)) {
    return res.status(404).json({ error: "not_found", message: `No template for type "${docType}"` });
  }
  const spec = DOC_TYPE_SPECS[docType];
  const csv  = getCsvTemplate(docType);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sermacrops_${docType}_${spec.label.replace(/\s+/g, "_").toLowerCase()}_template.csv"`
  );
  return res.send(csv);
});

// ─── Spec metadata (used by the frontend to render dynamic column hints) ─────

router.get("/edi/specs", (req, res) => {
  return res.json({ specs: DOC_TYPE_SPECS });
});

// ─── Legacy simulate endpoint (kept for dev / testing) ───────────────────────

router.post("/edi/simulate/:transactionType", async (req, res) => {
  const paramsResult = SimulateEdiTransactionParams.safeParse(req.params);
  if (!paramsResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid transaction type" });
  }

  const bodyResult = SimulateEdiTransactionBody.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid request body" });
  }

  const { transactionType } = paramsResult.data;
  const { partnerId, items } = bodyResult.data;

  const partner = PARTNERS[partnerId];
  if (!partner) {
    return res.status(400).json({ error: "bad_request", message: `Unknown partner: ${partnerId}` });
  }

  const cn = String(Date.now()).slice(-9);
  const payload: Record<string, unknown> = {
    poNumber: `PO${cn}`,
    purchaseOrderNumber: `PO${cn}`,
    invoiceNumber: `INV${cn}`,
    shipmentId: `SHP${cn}`,
    totalAmount: items?.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0) || 0,
    items: items || [{ lineNumber: 1, productId: "COFFEE001", description: "Coffee Beans", quantity: 500, unitPrice: 5.0, uom: "LB" }],
  };

  const simulatedEdi = generateEdi(transactionType, partner.ediId, "SERMACROPS", cn, payload);
  const result = await routeEdiDocument(simulatedEdi);

  return res.json({ ...result, responseEdi: simulatedEdi });
});

export default router;
