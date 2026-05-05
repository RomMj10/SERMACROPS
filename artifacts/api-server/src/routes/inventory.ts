import { Router } from "express";
import { getDb } from "@workspace/db";
import { ObjectId } from "mongodb";
import {
  GetInventoryItemParams,
  UpdateInventoryItemBody,
} from "@workspace/api-zod";

const router = Router();

function docToItem(doc: Record<string, unknown>) {
  const { _id, ...rest } = doc;
  const base = { ...rest, id: (_id as ObjectId).toHexString() };
  return {
    ...base,
    quantityAvailable: (Number(base.quantityOnHand) - Number(base.quantityReserved)).toFixed(3),
    quantityOnHand: Number(base.quantityOnHand),
    quantityReserved: Number(base.quantityReserved),
    reorderPoint: Number(base.reorderPoint),
    unitCost: base.unitCost != null ? Number(base.unitCost) : null,
  };
}

router.get("/inventory", async (req, res) => {
  const db = await getDb();
  const col = db.collection("inventory");

  const [inventory, total] = await Promise.all([
    col.find({}).sort({ productName: 1 }).toArray(),
    col.countDocuments(),
  ]);

  return res.json({ inventory: inventory.map(docToItem), total });
});

router.get("/inventory/:id", async (req, res) => {
  const db = await getDb();
  const col = db.collection("inventory");

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid ID" });
  }

  const doc = await col.findOne({ _id: new ObjectId(req.params.id) });

  if (!doc) {
    return res.status(404).json({ error: "not_found", message: "Inventory item not found" });
  }

  return res.json(docToItem(doc as Record<string, unknown>));
});

router.patch("/inventory/:id", async (req, res) => {
  const db = await getDb();
  const col = db.collection("inventory");

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid ID" });
  }

  const bodyResult = UpdateInventoryItemBody.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid body" });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (bodyResult.data.quantityOnHand !== undefined) updates.quantityOnHand = String(bodyResult.data.quantityOnHand);
  if (bodyResult.data.quantityReserved !== undefined) updates.quantityReserved = String(bodyResult.data.quantityReserved);

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(req.params.id) },
    { $set: updates },
    { returnDocument: "after" }
  );

  if (!result) {
    return res.status(404).json({ error: "not_found", message: "Inventory item not found" });
  }

  return res.json(docToItem(result as Record<string, unknown>));
});

export default router;
