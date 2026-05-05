import type { ObjectId } from "mongodb";

export interface InventoryDoc {
  _id?: ObjectId;
  productId: string;
  productName: string;
  category: string;
  quantityOnHand: string;
  quantityReserved: string;
  reorderPoint: string;
  unitOfMeasure: string;
  unitCost?: string | null;
  updatedAt: Date;
}

export interface InventoryItem extends InventoryDoc {
  id: string;
}
