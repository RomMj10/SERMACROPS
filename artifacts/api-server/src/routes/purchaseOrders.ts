import { Router } from "express";
import { getDb } from "@workspace/db";
import { ObjectId } from "mongodb";
import { generateEdi } from "../edi/parser";
import { generateSupplierPoCsv } from "../edi/csvConverter";
import { PARTNERS } from "../edi/config";
import { createAs2Message, sendAs2Message } from "../edi/as2Client";
import { logger } from "../lib/logger";
import {
  ListPurchaseOrdersQueryParams,
} from "@workspace/api-zod";

const SERMACROPS_ID = "SERMACROPS";

const router = Router();

function docToPo(doc: Record<string, unknown>) {
  const { _id, ...rest } = doc;
  return { ...rest, id: (_id as ObjectId).toHexString() };
}

router.get("/purchase-orders", async (req, res) => {
  const queryResult = ListPurchaseOrdersQueryParams.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid query params" });
  }

  const { status, partnerId } = queryResult.data;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (partnerId) filter.partnerId = partnerId;

  const db = await getDb();
  const col = db.collection("purchase_orders");

  const [purchaseOrders, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).toArray(),
    col.countDocuments(filter),
  ]);

  return res.json({
    purchaseOrders: purchaseOrders.map(docToPo),
    total,
  });
});

router.get("/purchase-orders/:id", async (req, res) => {
  const db = await getDb();
  const col = db.collection("purchase_orders");

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid ID" });
  }

  const doc = await col.findOne({ _id: new ObjectId(req.params.id) });

  if (!doc) {
    return res.status(404).json({ error: "not_found", message: "Purchase order not found" });
  }

  return res.json(docToPo(doc as Record<string, unknown>));
});

// ─── Download CSV for an outbound supplier PO ────────────────────────────────

router.get("/purchase-orders/:id/csv", async (req, res) => {
  const db = await getDb();
  const col = db.collection("purchase_orders");

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid ID" });
  }

  const po = await col.findOne({ _id: new ObjectId(req.params.id) });

  if (!po) {
    return res.status(404).json({ error: "not_found", message: "Purchase order not found" });
  }

  if (po.direction !== "outbound") {
    return res.status(400).json({ error: "bad_request", message: "CSV export is only available for outbound purchase orders." });
  }

  const items = (po.items as Array<Record<string, unknown>> | undefined) || [];
  const csvData = generateSupplierPoCsv({
    poNumber: po.poNumber as string,
    supplierId: po.partnerId as string,
    supplierName: po.partnerName as string,
    currency: (po.currency as string) || "USD",
    requestedDate: new Date().toISOString().slice(0, 10),
    items: items.map((item) => ({
      productId: String(item.productId || ""),
      description: String(item.description || item.productId || ""),
      quantity: Number(item.quantity || 0),
      uom: String(item.uom || "EA"),
      unitPrice: Number(item.unitPrice || 0),
    })),
  });

  const filename = `${po.poNumber}_supplier_po.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csvData);
});

// ─── Download EDI 855 acknowledgment as CSV ──────────────────────────────────

router.get("/purchase-orders/:id/855-csv", async (req, res) => {
  const db = await getDb();
  const poCol = db.collection("purchase_orders");
  const txCol = db.collection("transactions");

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid ID" });
  }

  const po = await poCol.findOne({ _id: new ObjectId(req.params.id) });
  if (!po) return res.status(404).json({ error: "not_found", message: "Purchase order not found" });

  if (po.status !== "acknowledged") {
    return res.status(400).json({ error: "bad_request", message: "Purchase order has not been acknowledged yet." });
  }

  // Find the 855 transaction associated with this PO
  const tx = await txCol.findOne({
    transactionType: "855",
    "parsedJson.purchaseOrderNumber": po.poNumber,
  });

  const acknowledgeCode = (tx?.parsedJson as any)?.acknowledgeCode || "AC";
  const controlNumber = (tx?.controlNumber as string) || "";
  const ackDate = tx ? new Date(tx.createdAt as Date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const items: Array<Record<string, unknown>> = (po.items as any[]) || [];

  const header = [
    "po_number",
    "acknowledge_code",
    "partner_id",
    "partner_name",
    "control_number",
    "acknowledgment_date",
    "transaction_type",
    "product_id",
    "description",
    "quantity_ordered",
    "uom",
    "unit_price",
  ].join(",");

  const rows = items.length > 0
    ? items.map((item) =>
        [
          po.poNumber,
          acknowledgeCode,
          po.partnerId,
          po.partnerName || "",
          controlNumber,
          ackDate,
          "855",
          item.productId || "",
          `"${String(item.description || item.productId || "").replace(/"/g, '""')}"`,
          item.quantity || 0,
          item.uom || "EA",
          item.unitPrice || 0,
        ].join(",")
      )
    : [
        [
          po.poNumber,
          acknowledgeCode,
          po.partnerId,
          po.partnerName || "",
          controlNumber,
          ackDate,
          "855",
          "", "", "", "", "",
        ].join(","),
      ];

  const csv = [header, ...rows].join("\n");
  const filename = `${po.poNumber}_855_acknowledgment.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(csv);
});

// ─── Acknowledge an inbound PO (send EDI 855) ────────────────────────────────

router.post("/purchase-orders/:id/acknowledge", async (req, res) => {
  const db = await getDb();
  const poCol = db.collection("purchase_orders");
  const txCol = db.collection("transactions");

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid ID" });
  }

  const po = await poCol.findOne({ _id: new ObjectId(req.params.id) });

  if (!po) {
    return res.status(404).json({ error: "not_found", message: "Purchase order not found" });
  }

  if (po.direction !== "inbound") {
    return res.status(400).json({ error: "bad_request", message: "Only inbound purchase orders can be acknowledged" });
  }

  if (po.status !== "pending") {
    return res.status(400).json({
      error: "bad_request",
      message: `Purchase order is already in status: ${po.status}`,
    });
  }

  const partnerId = po.partnerId as string;
  const partner = PARTNERS[partnerId];
  const partnerName = partner?.name || partnerId;
  const cn = req.params.id.slice(-9).padStart(9, "0");
  const now = new Date();

  const edi855 = generateEdi("855", SERMACROPS_ID, partnerId, cn, {
    purchaseOrderNumber: po.poNumber,
    acknowledgeCode: "AC",
  });

  await txCol.insertOne({
    transactionType: "855",
    direction: "outbound",
    partnerId,
    partnerName,
    controlNumber: cn,
    status: "processed",
    integrityStatus: "valid",
    rawEdi: edi855,
    parsedJson: { purchaseOrderNumber: po.poNumber, acknowledgeCode: "AC" },
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  });

  await poCol.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status: "acknowledged", updatedAt: now } }
  );

  if (partner) {
    try {
      const as2Msg = createAs2Message(SERMACROPS_ID, partner.as2Id, edi855, "855");
      const result = await sendAs2Message(partner.endpointUrl, as2Msg);
      if (!result.success) {
        logger.warn({ partnerId, error: result.error }, "AS2 send failed for 855");
      }
    } catch (err) {
      logger.warn({ err, partnerId }, "AS2 send error for 855 (non-fatal)");
    }
  }

  logger.info({ poId: req.params.id, poNumber: po.poNumber, partnerId }, "Purchase order acknowledged — EDI 855 sent");

  return res.json({
    success: true,
    message: `Purchase order ${po.poNumber} acknowledged successfully`,
    poNumber: po.poNumber,
    partnerId,
  });
});

export default router;
