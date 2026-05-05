import type { ObjectId } from "mongodb";

export interface PartnerDoc {
  _id?: ObjectId;
  id: string;
  name: string;
  type: string;
  ediId: string;
  as2Id: string;
  endpointUrl: string;
  isActive: boolean;
  createdAt: Date;
}

export type Partner = PartnerDoc;
