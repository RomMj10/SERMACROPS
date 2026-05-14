import { getDb } from "@workspace/db";
import { parseEdi } from "./parser";
import { PARTNERS } from "./config";
import { handle850, handle855, handle856, handle810, handle204, handle990, handle861 } from "./transactionHandlers";
import { logger } from "../lib/logger";

export interface EdiRouterResult {
  success: boolean;
  transactionId?: string;
  transactionType?: string;
  partnerId?: string;
  message: string;
  responseEdi?: string;
}

export async function routeEdiDocument(rawEdi: string): Promise<EdiRouterResult> {
  let parsed;

  try {
    parsed = parseEdi(rawEdi);
  } catch (err) {
    logger.error({ err }, "EDI parse failed");
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to parse EDI document",
    };
  }

  const partnerName = PARTNERS[parsed.senderId]?.name || parsed.senderId;

  const db = await getDb();
  const col = db.collection("transactions");

  const now = new Date();
  const insertResult = await col.insertOne({
    transactionType: parsed.transactionType,
    direction: "inbound",
    partnerId: parsed.senderId,
    partnerName,
    controlNumber: parsed.controlNumber,
    status: "pending",
    integrityStatus: "valid",
    rawEdi,
    parsedJson: { ...parsed.summary, envelope: { senderId: parsed.senderId, receiverId: parsed.receiverId } },
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  });

  const transactionId = insertResult.insertedId.toHexString();
  logger.info({ transactionId, transactionType: parsed.transactionType, partnerId: parsed.senderId }, "EDI transaction recorded");

  try {
    switch (parsed.transactionType) {
      case "850": await handle850(parsed, transactionId); break;
      case "855": await handle855(parsed, transactionId); break;
      case "856": await handle856(parsed, transactionId); break;
      case "810": await handle810(parsed, transactionId); break;
      case "204": await handle204(parsed, transactionId); break;
      case "990": await handle990(parsed, transactionId); break;
      case "861": await handle861(parsed, transactionId); break;
      default: {
        logger.warn({ transactionType: parsed.transactionType }, "Unknown transaction type");
        await col.updateOne(
          { _id: insertResult.insertedId },
          { $set: { status: "failed", errorMessage: `Unsupported transaction type: ${parsed.transactionType}`, updatedAt: new Date() } }
        );
        return {
          success: false,
          transactionId,
          transactionType: parsed.transactionType,
          partnerId: parsed.senderId,
          message: `Unsupported transaction type: ${parsed.transactionType}`,
        };
      }
    }
  } catch (err) {
    logger.error({ err, transactionId }, "Handler failed");
    return {
      success: false,
      transactionId,
      transactionType: parsed.transactionType,
      partnerId: parsed.senderId,
      message: err instanceof Error ? err.message : "Handler error",
    };
  }

  return {
    success: true,
    transactionId,
    transactionType: parsed.transactionType,
    partnerId: parsed.senderId,
    message: `EDI ${parsed.transactionType} processed successfully`,
  };
}
