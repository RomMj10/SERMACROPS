import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { routeEdiDocument } from "../edi/router";
import {
  ListTransactionsQueryParams,
  GetTransactionParams,
  ProcessTransactionParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/transactions", async (req, res) => {
  const queryResult = ListTransactionsQueryParams.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid query params" });
  }

  const { limit = 50, offset = 0, partnerId, transactionType, status } = queryResult.data;

  const conditions = [];
  if (partnerId) conditions.push(eq(transactionsTable.partnerId, partnerId));
  if (transactionType) conditions.push(eq(transactionsTable.transactionType, transactionType));
  if (status) conditions.push(eq(transactionsTable.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [transactions, countResult] = await Promise.all([
    db.select().from(transactionsTable)
      .where(whereClause)
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(transactionsTable).where(whereClause),
  ]);

  return res.json({
    transactions,
    total: Number(countResult[0]?.count || 0),
  });
});

router.get("/transactions/:id", async (req, res) => {
  const paramsResult = GetTransactionParams.safeParse({ id: Number(req.params.id) });
  if (!paramsResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid transaction ID" });
  }

  const [transaction] = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.id, paramsResult.data.id))
    .limit(1);

  if (!transaction) {
    return res.status(404).json({ error: "not_found", message: "Transaction not found" });
  }

  return res.json(transaction);
});

router.post("/transactions/:id/process", async (req, res) => {
  const paramsResult = ProcessTransactionParams.safeParse({ id: Number(req.params.id) });
  if (!paramsResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid transaction ID" });
  }

  const [transaction] = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.id, paramsResult.data.id))
    .limit(1);

  if (!transaction) {
    return res.status(404).json({ error: "not_found", message: "Transaction not found" });
  }

  if (transaction.status !== "pending") {
    return res.json({
      success: false,
      transactionId: transaction.id,
      transactionType: transaction.transactionType,
      partnerId: transaction.partnerId,
      message: `Transaction is already in status: ${transaction.status}`,
    });
  }

  if (!transaction.rawEdi) {
    return res.status(400).json({ error: "bad_request", message: "Transaction has no raw EDI to process" });
  }

  const result = await routeEdiDocument(transaction.rawEdi);
  return res.json(result);
});

export default router;
