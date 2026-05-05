import { Router } from "express";
import { getDb } from "@workspace/db";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const db = await getDb();
  const transactions = db.collection("transactions");
  const purchaseOrders = db.collection("purchase_orders");
  const inventory = db.collection("inventory");
  const partners = db.collection("partners");

  const [
    totalTransactions,
    pendingTransactions,
    pendingPurchaseOrders,
    totalInventoryItems,
    activePartners,
    transactionsToday,
    failedTransactions,
    allInventory,
  ] = await Promise.all([
    transactions.countDocuments(),
    transactions.countDocuments({ status: "pending" }),
    purchaseOrders.countDocuments({ status: "pending" }),
    inventory.countDocuments(),
    partners.countDocuments({ isActive: true }),
    transactions.countDocuments({ createdAt: { $gte: today } }),
    transactions.countDocuments({ status: "failed" }),
    inventory.find({}).toArray(),
  ]);

  const lowStockItems = allInventory.filter((item) => {
    const available = Number(item.quantityOnHand) - Number(item.quantityReserved);
    return available <= Number(item.reorderPoint);
  }).length;

  return res.json({
    totalTransactions,
    pendingTransactions,
    pendingPurchaseOrders,
    totalInventoryItems,
    lowStockItems,
    activePartners,
    transactionsToday,
    failedTransactions,
  });
});

router.get("/dashboard/transaction-stats", async (req, res) => {
  const db = await getDb();
  const col = db.collection("transactions");

  const [byTypeRaw, byStatusRaw, byPartnerRaw] = await Promise.all([
    col.aggregate([{ $group: { _id: "$transactionType", count: { $sum: 1 } } }]).toArray(),
    col.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    col.aggregate([
      { $group: { _id: { partnerId: "$partnerId", partnerName: "$partnerName" }, count: { $sum: 1 } } },
    ]).toArray(),
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
      type: r._id,
      count: r.count,
      label: typeLabels[r._id] || r._id,
    })),
    byStatus: byStatusRaw.map((r) => ({
      status: r._id,
      count: r.count,
    })),
    byPartner: byPartnerRaw.map((r) => ({
      partnerId: r._id.partnerId,
      partnerName: r._id.partnerName,
      count: r.count,
    })),
  });
});

router.get("/dashboard/recent-activity", async (req, res) => {
  const db = await getDb();
  const col = db.collection("transactions");

  const activities = await col
    .find({}, {
      projection: {
        transactionType: 1,
        direction: 1,
        partnerName: 1,
        status: 1,
        controlNumber: 1,
        createdAt: 1,
      },
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  return res.json({
    activities: activities.map(({ _id, ...rest }) => ({
      ...rest,
      id: _id.toHexString(),
    })),
  });
});

export default router;
