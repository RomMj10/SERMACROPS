import type { ObjectId } from "mongodb";

export interface PurchaseOrderDoc {
  _id?: ObjectId;
  poNumber: string;
  direction: string;
  partnerId: string;
  partnerName: string;
  status: string;
  totalAmount?: string | null;
  currency: string;
  shipDate?: Date | null;
  items?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrder extends PurchaseOrderDoc {
  id: string;
}
