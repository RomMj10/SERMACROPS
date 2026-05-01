import { Router } from "express";
import { db } from "@workspace/db";
import { inventoryTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  GetInventoryItemParams,
  UpdateInventoryItemParams,
  UpdateInventoryItemBody,
} from "@workspace/api-zod";

const router = Router();

router.get("/inventory", async (req, res) => {
  const [inventory, countResult] = await Promise.all([
    db.select().from(inventoryTable).orderBy(inventoryTable.productName),
    db.select({ count: sql<number>`count(*)` }).from(inventoryTable),
  ]);

  const enriched = inventory.map((item) => ({
    ...item,
    quantityAvailable: (Number(item.quantityOnHand) - Number(item.quantityReserved)).toFixed(3),
    quantityOnHand: Number(item.quantityOnHand),
    quantityReserved: Number(item.quantityReserved),
    reorderPoint: Number(item.reorderPoint),
    unitCost: item.unitCost ? Number(item.unitCost) : null,
  }));

  return res.json({ inventory: enriched, total: Number(countResult[0]?.count || 0) });
});

router.get("/inventory/:id", async (req, res) => {
  const paramsResult = GetInventoryItemParams.safeParse({ id: Number(req.params.id) });
  if (!paramsResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid ID" });
  }

  const [item] = await db.select().from(inventoryTable)
    .where(eq(inventoryTable.id, paramsResult.data.id))
    .limit(1);

  if (!item) {
    return res.status(404).json({ error: "not_found", message: "Inventory item not found" });
  }

  return res.json({
    ...item,
    quantityAvailable: (Number(item.quantityOnHand) - Number(item.quantityReserved)).toFixed(3),
    quantityOnHand: Number(item.quantityOnHand),
    quantityReserved: Number(item.quantityReserved),
    reorderPoint: Number(item.reorderPoint),
    unitCost: item.unitCost ? Number(item.unitCost) : null,
  });
});

router.patch("/inventory/:id", async (req, res) => {
  const paramsResult = UpdateInventoryItemParams.safeParse({ id: Number(req.params.id) });
  if (!paramsResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid ID" });
  }

  const bodyResult = UpdateInventoryItemBody.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid body" });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (bodyResult.data.quantityOnHand !== undefined) updates.quantityOnHand = String(bodyResult.data.quantityOnHand);
  if (bodyResult.data.quantityReserved !== undefined) updates.quantityReserved = String(bodyResult.data.quantityReserved);

  const [updated] = await db.update(inventoryTable)
    .set(updates)
    .where(eq(inventoryTable.id, paramsResult.data.id))
    .returning();

  if (!updated) {
    return res.status(404).json({ error: "not_found", message: "Inventory item not found" });
  }

  return res.json({
    ...updated,
    quantityAvailable: (Number(updated.quantityOnHand) - Number(updated.quantityReserved)).toFixed(3),
    quantityOnHand: Number(updated.quantityOnHand),
    quantityReserved: Number(updated.quantityReserved),
    reorderPoint: Number(updated.reorderPoint),
    unitCost: updated.unitCost ? Number(updated.unitCost) : null,
  });
});

export default router;
