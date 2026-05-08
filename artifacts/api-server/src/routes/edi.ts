import { Router } from "express";
import multer from "multer";
import { routeEdiDocument } from "../edi/router";
import { generateEdi } from "../edi/parser";
import {
  parseCsv,
  csvToEdi,
  validateAnsiX12,
  getCsvTemplate,
  DOC_TYPE_SPECS,
  type EdiDocType,
} from "../edi/csvConverter";
import { PARTNERS } from "../edi/config";
import { logger } from "../lib/logger";
import {
  SimulateEdiTransactionParams,
  SimulateEdiTransactionBody,
} from "@workspace/api-zod";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const KNOWN_DOC_TYPES: EdiDocType[] = ["850", "855", "856", "810", "204", "990"];

// ─── CSV upload (main inbound endpoint) ──────────────────────────────────────

router.post("/edi/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "bad_request",
      message: "No CSV file uploaded. Use multipart field name 'file'.",
    });
  }

  const partnerId: string = (req.body?.partnerId || "").trim();
  if (!partnerId) {
    return res.status(400).json({ error: "bad_request", message: "partnerId is required." });
  }

  const docType = (req.body?.transactionType || "850").trim() as EdiDocType;
  if (!KNOWN_DOC_TYPES.includes(docType)) {
    return res.status(400).json({
      error: "bad_request",
      message: `Unknown transaction type "${docType}". Supported: ${KNOWN_DOC_TYPES.join(", ")}`,
    });
  }

  const partner = PARTNERS[partnerId];
  if (!partner) {
    return res.status(400).json({ error: "bad_request", message: `Unknown partner: ${partnerId}` });
  }

  const csvText = req.file.buffer.toString("utf-8");

  let rows;
  try {
    rows = parseCsv(csvText);
  } catch (err) {
    return res.status(422).json({
      error: "csv_parse_error",
      message: err instanceof Error ? err.message : "Failed to parse CSV",
    });
  }

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

  const validation = validateAnsiX12(rawEdi);
  if (!validation.valid) {
    return res.status(422).json({
      error: "ansi_x12_validation_failed",
      message: "Generated EDI failed ANSI X12 validation.",
      errors: validation.errors,
    });
  }

  logger.info(
    { partnerId, docType, rowCount: rows.length, cn },
    `CSV uploaded and converted to ANSI X12 EDI ${docType}`
  );

  const result = await routeEdiDocument(rawEdi);

  return res.json({
    ...result,
    csvRowsProcessed: rows.length,
    generatedEdi: rawEdi,
    validation: { valid: true },
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
