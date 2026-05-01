import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { routeEdiDocument } from "../edi/router";
import { generateEdi } from "../edi/parser";
import { PARTNERS } from "../edi/config";
import {
  ReceiveEdiDocumentResponse,
  SimulateEdiTransactionParams,
  SimulateEdiTransactionBody,
  SimulateEdiTransactionResponse,
} from "@workspace/api-zod";

const router = Router();

router.post("/edi", async (req, res) => {
  const rawEdi = typeof req.body === "string" ? req.body : req.body?.rawEdi || "";

  if (!rawEdi) {
    return res.status(400).json({ error: "bad_request", message: "Request body must contain raw EDI text" });
  }

  const result = await routeEdiDocument(rawEdi);

  const parsed = ReceiveEdiDocumentResponse.safeParse(result);
  if (!parsed.success) {
    return res.status(500).json({ error: "internal_error", message: "Response validation failed" });
  }

  return res.json(result);
});

router.post("/edi/simulate/:transactionType", async (req, res) => {
  const paramsResult = SimulateEdiTransactionParams.safeParse(req.params);
  if (!paramsResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid transaction type" });
  }

  const bodyResult = SimulateEdiTransactionBody.safeParse(req.body);
  if (!bodyResult.success) {
    return res.status(400).json({ error: "bad_request", message: "Invalid request body" });
  }

  const { transactionType } = paramsResult.data;
  const { partnerId, items } = bodyResult.data;

  const partner = PARTNERS[partnerId];
  if (!partner) {
    return res.status(400).json({ error: "bad_request", message: `Unknown partner: ${partnerId}` });
  }

  const cn = String(Date.now()).slice(-9);
  const payload: Record<string, unknown> = {
    poNumber: `PO${cn}`,
    purchaseOrderNumber: `PO${cn}`,
    invoiceNumber: `INV${cn}`,
    shipmentId: `SHP${cn}`,
    totalAmount: items?.reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0) || 0,
    items: items || [{ lineNumber: 1, productId: "COFFEE001", description: "Coffee Beans", quantity: 500, unitPrice: 5.0, uom: "LB" }],
  };

  const simulatedEdi = generateEdi(transactionType, partner.ediId, "SERMACROPS", cn, payload);
  const result = await routeEdiDocument(simulatedEdi);

  const parsed = SimulateEdiTransactionResponse.safeParse({ ...result, responseEdi: simulatedEdi });
  return res.json({ ...result, responseEdi: simulatedEdi });
});

export default router;
