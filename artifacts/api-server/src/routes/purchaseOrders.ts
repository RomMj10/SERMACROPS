import { Router } from "express";
import { db } from "@workspace/db";
import { purchaseOrdersTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  ListPurchaseOrdersQueryParams,
  GetPurchaseOrderParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/purchase-orders", async (req, res) => {
  const queryResult = ListPurchaseOrdersQueryParams.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid query params" });
  }

  const { status, partnerId } = queryResult.data;
  const conditions = [];
  if (status) conditions.push(eq(purchaseOrdersTable.status, status));
  if (partnerId) conditions.push(eq(purchaseOrdersTable.partnerId, partnerId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [purchaseOrders, countResult] = await Promise.all([
    db.select().from(purchaseOrdersTable)
      .where(whereClause)
      .orderBy(desc(purchaseOrdersTable.createdAt)),
    db.select({ count: sql<number>`count(*)` }).from(purchaseOrdersTable).where(whereClause),
  ]);

  return res.json({
    purchaseOrders,
    total: Number(countResult[0]?.count || 0),
  });
});

router.get("/purchase-orders/:id", async (req, res) => {
  const paramsResult = GetPurchaseOrderParams.safeParse({ id: Number(req.params.id) });
  if (!paramsResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid ID" });
  }

  const [po] = await db.select().from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.id, paramsResult.data.id))
    .limit(1);

  if (!po) {
    return res.status(404).json({ error: "not_found", message: "Purchase order not found" });
  }

  return res.json(po);
});

export default router;
