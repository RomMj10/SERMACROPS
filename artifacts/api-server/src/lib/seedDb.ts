import { getDb } from "@workspace/db";
import { PARTNERS } from "../edi/config";
import { logger } from "./logger";

export async function seedDb(): Promise<void> {
  const db = await getDb();
  const partnersCol = db.collection("partners");

  for (const partner of Object.values(PARTNERS)) {
    const existing = await partnersCol.findOne({ id: partner.id });
    if (!existing) {
      await partnersCol.insertOne({
        ...partner,
        createdAt: new Date(),
      });
      logger.info({ partnerId: partner.id }, "Seeded partner");
    }
  }

  await db.collection("inventory").createIndex({ productId: 1 }, { unique: true });
  await db.collection("purchase_orders").createIndex({ poNumber: 1 }, { unique: true });
  await db.collection("transactions").createIndex({ createdAt: -1 });
  await db.collection("transactions").createIndex({ status: 1 });
  await db.collection("transactions").createIndex({ partnerId: 1 });

  const inventoryCount = await db.collection("inventory").countDocuments();
  if (inventoryCount === 0) {
    const now = new Date();
    await db.collection("inventory").insertMany([
      { productId: "COFFEE001", productName: "Arabica Coffee Beans", category: "Raw Materials", quantityOnHand: "5000", quantityReserved: "500", reorderPoint: "1000", unitOfMeasure: "LB", unitCost: "5.00", updatedAt: now },
      { productId: "COFFEE002", productName: "Robusta Coffee Beans", category: "Raw Materials", quantityOnHand: "3000", quantityReserved: "200", reorderPoint: "800", unitOfMeasure: "LB", unitCost: "3.50", updatedAt: now },
      { productId: "PKG001", productName: "Coffee Bags 1kg", category: "Packaging", quantityOnHand: "10000", quantityReserved: "1000", reorderPoint: "2000", unitOfMeasure: "EA", unitCost: "0.45", updatedAt: now },
      { productId: "PKG002", productName: "Coffee Bags 500g", category: "Packaging", quantityOnHand: "8000", quantityReserved: "500", reorderPoint: "1500", unitOfMeasure: "EA", unitCost: "0.30", updatedAt: now },
      { productId: "BLEND001", productName: "Signature Blend Ground", category: "Finished Goods", quantityOnHand: "2000", quantityReserved: "300", reorderPoint: "500", unitOfMeasure: "LB", unitCost: "8.50", updatedAt: now },
    ]);
    logger.info("Seeded initial inventory");
  }
}
