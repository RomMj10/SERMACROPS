import { Router } from "express";
import { getDb } from "@workspace/db";
import { ObjectId } from "mongodb";
import { routeEdiDocument } from "../edi/router";
import {
  ListTransactionsQueryParams,
  GetTransactionParams,
  ProcessTransactionParams,
} from "@workspace/api-zod";

const router = Router();

// ─── EDI → CSV conversion ────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(headers: string[], rows: (string | number | undefined)[][]): string {
  const lines = [
    headers.join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
  ];
  return lines.join("\n");
}

function toIsoDate(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw);
  // YYYYMMDD → YYYY-MM-DD
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  // Already looks like a date
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 10);
  try { return new Date(s).toISOString().slice(0, 10); } catch { return s; }
}

// EDI segment qualifiers that should NOT be used as product descriptions
const EDI_QUALIFIERS = new Set(["PI", "VP", "MG", "IN", "SK", "EN", "UK", "UP", "UPC", "EAN"]);

function cleanDescription(desc: unknown, fallback: unknown): string {
  const s = String(desc ?? "").trim();
  return s && !EDI_QUALIFIERS.has(s) ? s : String(fallback ?? "");
}

function transactionToCsv(tx: Record<string, unknown>): string {
  const type      = String(tx.transactionType || "");
  const partnerId = String(tx.partnerId || "");
  const parsed    = (tx.parsedJson || {}) as Record<string, unknown>;
  const createdAt = toIsoDate(tx.createdAt);

  // lineItems is used by 850 and 861
  const lineItems = (parsed.lineItems as any[] | undefined) || [];

  switch (type) {
    case "850": {
      const headers = ["po_number", "partner_id", "ship_date", "product_id", "description", "quantity", "unit_price", "uom"];
      const poDate  = toIsoDate(parsed.purchaseOrderDate);
      const rows = lineItems.length > 0
        ? lineItems.map((it: any) => [
            parsed.purchaseOrderNumber, partnerId, poDate,
            it.productId,
            cleanDescription(it.description, it.productId),
            it.quantity, it.unitPrice, it.uom || "EA",
          ])
        : [[parsed.purchaseOrderNumber, partnerId, poDate, "", "", "", "", ""]];
      return buildCsv(headers, rows);
    }

    case "855": {
      const headers = ["po_number", "partner_id", "acknowledge_code", "date"];
      const ackDate = toIsoDate(parsed.date) || createdAt;
      return buildCsv(headers, [[parsed.purchaseOrderNumber, partnerId, parsed.acknowledgeCode || "AC", ackDate]]);
    }

    case "856": {
      // 856 summary stores shipmentId + shipDate but no line items
      const headers = ["shipment_id", "partner_id", "po_number", "ship_date"];
      const shipDate = toIsoDate(parsed.shipDate) || createdAt;
      return buildCsv(headers, [[parsed.shipmentId || "", partnerId, "", shipDate]]);
    }

    case "810": {
      // 810 summary stores invoice header only (no line items in parsedJson)
      const headers = ["invoice_number", "partner_id", "invoice_date", "po_number", "total_amount"];
      const invDate = toIsoDate(parsed.invoiceDate) || createdAt;
      // totalAmount is stored in cents-string (e.g. "0000250000") or decimal string
      const rawTotal = String(parsed.totalAmount || "0");
      const totalFormatted = rawTotal.includes(".") ? rawTotal : (parseInt(rawTotal, 10) / 100).toFixed(2);
      return buildCsv(headers, [[parsed.invoiceNumber, partnerId, invDate, parsed.purchaseOrderNumber, totalFormatted]]);
    }

    case "204": {
      const headers = ["shipment_id", "partner_id", "po_number", "pickup_date", "carrier_code"];
      // parsedJson may come from accept-850 handler (poNumber field)
      // or from the EDI parser (referencePairs array)
      const refPairs = (parsed.referencePairs as any[] | undefined) || [];
      const poNumber = String(parsed.poNumber || parsed.relatedClientPo || "")
        || refPairs.find((p: any) => p.qualifier === "PO")?.ref || "";
      const shipId   = String(parsed.shipmentId || "").trim() || String(parsed.carrierAlpha || "").trim();
      return buildCsv(headers, [[shipId, partnerId, poNumber, createdAt, parsed.carrierAlpha || partnerId]]);
    }

    case "990": {
      const headers = ["shipment_id", "partner_id", "response_code", "date"];
      // b1 segment stores: standardCarrierAlphaCode, shipmentId, date
      const resDate = toIsoDate(parsed.date) || createdAt;
      // response is encoded in the last element of B1 — M=accepted, R=rejected
      const rcCode = String(parsed.standardCarrierAlphaCode || "").slice(-1) === "M" ? "A" : "A";
      return buildCsv(headers, [[parsed.shipmentId, partnerId, rcCode, resDate]]);
    }

    case "861": {
      const headers = ["receipt_number", "partner_id", "po_number", "receipt_date", "product_id", "description", "quantity_received", "uom"];
      const rcvDate = toIsoDate(parsed.receiptDate) || createdAt;
      const rows = lineItems.length > 0
        ? lineItems.map((it: any) => [
            parsed.receiptNumber, partnerId, parsed.purchaseOrderNumber, rcvDate,
            it.productId, cleanDescription(it.description, it.productId), it.quantity, it.uom || "EA",
          ])
        : [[parsed.receiptNumber, partnerId, parsed.purchaseOrderNumber, rcvDate, "", "", "", ""]];
      return buildCsv(headers, rows);
    }

    default: {
      const headers = ["field", "value"];
      const rows = Object.entries(parsed).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v ?? "")]);
      return buildCsv(headers, rows.length > 0 ? rows : [["transactionType", type]]);
    }
  }
}

function docToTransaction(doc: Record<string, unknown>) {
  const { _id, ...rest } = doc;
  return { ...rest, id: (_id as ObjectId).toHexString() };
}

router.get("/transactions", async (req, res) => {
  const queryResult = ListTransactionsQueryParams.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid query params" });
  }

  const { limit = 50, offset = 0, partnerId, transactionType, status } = queryResult.data;

  const filter: Record<string, unknown> = {};
  if (partnerId) filter.partnerId = partnerId;
  if (transactionType) filter.transactionType = transactionType;
  if (status) filter.status = status;

  const db = await getDb();
  const col = db.collection("transactions");

  const [transactions, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return res.json({
    transactions: transactions.map(docToTransaction),
    total,
  });
});

router.get("/transactions/:id", async (req, res) => {
  const paramsResult = GetTransactionParams.safeParse({ id: Number(req.params.id) });

  const db = await getDb();
  const col = db.collection("transactions");

  let doc;
  if (ObjectId.isValid(req.params.id)) {
    doc = await col.findOne({ _id: new ObjectId(req.params.id) });
  }

  if (!doc) {
    return res.status(404).json({ error: "not_found", message: "Transaction not found" });
  }

  return res.json(docToTransaction(doc as Record<string, unknown>));
});

router.get("/transactions/:id/csv", async (req, res) => {
  const db = await getDb();
  const col = db.collection("transactions");

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid transaction ID" });
  }

  const doc = await col.findOne({ _id: new ObjectId(req.params.id) });
  if (!doc) {
    return res.status(404).json({ error: "not_found", message: "Transaction not found" });
  }

  const tx = docToTransaction(doc as Record<string, unknown>);
  const csv = transactionToCsv(tx as Record<string, unknown>);

  const type = String(doc.transactionType || "edi");
  const cn   = String(doc.controlNumber  || req.params.id);
  const filename = `EDI${type}_${cn}.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csv);
});

router.post("/transactions/:id/process", async (req, res) => {
  const db = await getDb();
  const col = db.collection("transactions");

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid transaction ID" });
  }

  const doc = await col.findOne({ _id: new ObjectId(req.params.id) });

  if (!doc) {
    return res.status(404).json({ error: "not_found", message: "Transaction not found" });
  }

  if (doc.status !== "pending") {
    return res.json({
      success: false,
      transactionId: req.params.id,
      transactionType: doc.transactionType,
      partnerId: doc.partnerId,
      message: `Transaction is already in status: ${doc.status}`,
    });
  }

  if (!doc.rawEdi) {
    return res.status(400).json({ error: "bad_request", message: "Transaction has no raw EDI to process" });
  }

  const result = await routeEdiDocument(doc.rawEdi as string);
  return res.json(result);
});

export default router;
