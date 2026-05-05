import { Router } from "express";
import { getDb } from "@workspace/db";
import { ObjectId } from "mongodb";
import {
  ListPurchaseOrdersQueryParams,
} from "@workspace/api-zod";

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

export default router;
