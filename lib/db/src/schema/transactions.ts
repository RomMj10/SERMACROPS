import type { ObjectId } from "mongodb";

export interface TransactionDoc {
  _id?: ObjectId;
  transactionType: string;
  direction: string;
  partnerId: string;
  partnerName: string;
  controlNumber: string;
  status: string;
  integrityStatus: string;
  rawEdi?: string | null;
  parsedJson?: unknown;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction extends TransactionDoc {
  id: string;
}
