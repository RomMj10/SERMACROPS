import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, purchaseOrdersTable, inventoryTable, partnersTable } from "@workspace/db";
import { sql, lt, gte, eq } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalTransactions,
    pendingTransactions,
    pendingPurchaseOrders,
    totalInventoryItems,
    lowStockItems,
    activePartners,
    transactionsToday,
    failedTransactions,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(transactionsTable),
    db.select({ count: sql<number>`count(*)` }).from(transactionsTable).where(eq(transactionsTable.status, "pending")),
    db.select({ count: sql<number>`count(*)` }).from(purchaseOrdersTable).where(eq(purchaseOrdersTable.status, "pending")),
    db.select({ count: sql<number>`count(*)` }).from(inventoryTable),
    db.select({ count: sql<number>`count(*)` }).from(inventoryTable).where(
      sql`${inventoryTable.quantityOnHand} - ${inventoryTable.quantityReserved} <= ${inventoryTable.reorderPoint}`
    ),
    db.select({ count: sql<number>`count(*)` }).from(partnersTable).where(eq(partnersTable.isActive, true)),
    db.select({ count: sql<number>`count(*)` }).from(transactionsTable).where(gte(transactionsTable.createdAt, today)),
    db.select({ count: sql<number>`count(*)` }).from(transactionsTable).where(eq(transactionsTable.status, "failed")),
  ]);

  return res.json({
    totalTransactions: Number(totalTransactions[0]?.count || 0),
    pendingTransactions: Number(pendingTransactions[0]?.count || 0),
    pendingPurchaseOrders: Number(pendingPurchaseOrders[0]?.count || 0),
    totalInventoryItems: Number(totalInventoryItems[0]?.count || 0),
    lowStockItems: Number(lowStockItems[0]?.count || 0),
    activePartners: Number(activePartners[0]?.count || 0),
    transactionsToday: Number(transactionsToday[0]?.count || 0),
    failedTransactions: Number(failedTransactions[0]?.count || 0),
  });
});

router.get("/dashboard/transaction-stats", async (req, res) => {
  const [byTypeRaw, byStatusRaw, byPartnerRaw] = await Promise.all([
    db.select({
      type: transactionsTable.transactionType,
      count: sql<number>`count(*)`,
    }).from(transactionsTable).groupBy(transactionsTable.transactionType),
    db.select({
      status: transactionsTable.status,
      count: sql<number>`count(*)`,
    }).from(transactionsTable).groupBy(transactionsTable.status),
    db.select({
      partnerId: transactionsTable.partnerId,
      partnerName: transactionsTable.partnerName,
      count: sql<number>`count(*)`,
    }).from(transactionsTable).groupBy(transactionsTable.partnerId, transactionsTable.partnerName),
  ]);

  const typeLabels: Record<string, string> = {
    "850": "Purchase Order",
    "855": "PO Acknowledgment",
    "856": "Advance Ship Notice",
    "810": "Invoice",
    "204": "Load Tender",
    "990": "Load Tender Response",
  };

  return res.json({
    byType: byTypeRaw.map((r) => ({
      type: r.type,
      count: Number(r.count),
      label: typeLabels[r.type] || r.type,
    })),
    byStatus: byStatusRaw.map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
    byPartner: byPartnerRaw.map((r) => ({
      partnerId: r.partnerId,
      partnerName: r.partnerName,
      count: Number(r.count),
    })),
  });
});

router.get("/dashboard/recent-activity", async (req, res) => {
  const activities = await db.select({
    id: transactionsTable.id,
    transactionType: transactionsTable.transactionType,
    direction: transactionsTable.direction,
    partnerName: transactionsTable.partnerName,
    status: transactionsTable.status,
    controlNumber: transactionsTable.controlNumber,
    createdAt: transactionsTable.createdAt,
  }).from(transactionsTable)
    .orderBy(sql`${transactionsTable.createdAt} DESC`)
    .limit(20);

  return res.json({ activities });
});

export default router;
