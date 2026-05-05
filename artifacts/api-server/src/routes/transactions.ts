import { Router } from "express";
import { getDb } from "@workspace/db";
import { ObjectId } from "mongodb";
import { routeEdiDocument } from "../edi/router";
import {
  ListTransactionsQueryParams,
  GetTransactionParams,
  ProcessTransactionParams,
} from "@workspace/api-zod";

const router = Router();

function docToTransaction(doc: Record<string, unknown>) {
  const { _id, ...rest } = doc;
  return { ...rest, id: (_id as ObjectId).toHexString() };
}

router.get("/transactions", async (req, res) => {
  const queryResult = ListTransactionsQueryParams.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid query params" });
  }

  const { limit = 50, offset = 0, partnerId, transactionType, status } = queryResult.data;

  const filter: Record<string, unknown> = {};
  if (partnerId) filter.partnerId = partnerId;
  if (transactionType) filter.transactionType = transactionType;
  if (status) filter.status = status;

  const db = await getDb();
  const col = db.collection("transactions");

  const [transactions, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return res.json({
    transactions: transactions.map(docToTransaction),
    total,
  });
});

router.get("/transactions/:id", async (req, res) => {
  const paramsResult = GetTransactionParams.safeParse({ id: Number(req.params.id) });

  const db = await getDb();
  const col = db.collection("transactions");

  let doc;
  if (ObjectId.isValid(req.params.id)) {
    doc = await col.findOne({ _id: new ObjectId(req.params.id) });
  }

  if (!doc) {
    return res.status(404).json({ error: "not_found", message: "Transaction not found" });
  }

  return res.json(docToTransaction(doc as Record<string, unknown>));
});

router.post("/transactions/:id/process", async (req, res) => {
  const db = await getDb();
  const col = db.collection("transactions");

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "bad_request", message: "Invalid transaction ID" });
  }

  const doc = await col.findOne({ _id: new ObjectId(req.params.id) });

  if (!doc) {
    return res.status(404).json({ error: "not_found", message: "Transaction not found" });
  }

  if (doc.status !== "pending") {
    return res.json({
      success: false,
      transactionId: req.params.id,
      transactionType: doc.transactionType,
      partnerId: doc.partnerId,
      message: `Transaction is already in status: ${doc.status}`,
    });
  }

  if (!doc.rawEdi) {
    return res.status(400).json({ error: "bad_request", message: "Transaction has no raw EDI to process" });
  }

  const result = await routeEdiDocument(doc.rawEdi as string);
  return res.json(result);
});

export default router;
