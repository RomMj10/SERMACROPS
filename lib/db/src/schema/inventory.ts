import { pgTable, serial, text, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  productId: text("product_id").notNull().unique(),
  productName: text("product_name").notNull(),
  category: text("category").notNull(),
  quantityOnHand: numeric("quantity_on_hand", { precision: 12, scale: 3 }).notNull().default("0"),
  quantityReserved: numeric("quantity_reserved", { precision: 12, scale: 3 }).notNull().default("0"),
  reorderPoint: numeric("reorder_point", { precision: 12, scale: 3 }).notNull().default("0"),
  unitOfMeasure: text("unit_of_measure").notNull().default("EA"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("inventory_product_id_idx").on(table.productId),
  index("inventory_category_idx").on(table.category),
]);

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({ id: true, updatedAt: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type InventoryItem = typeof inventoryTable.$inferSelect;
