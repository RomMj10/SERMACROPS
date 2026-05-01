import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  transactionType: text("transaction_type").notNull(),
  direction: text("direction").notNull(),
  partnerId: text("partner_id").notNull(),
  partnerName: text("partner_name").notNull(),
  controlNumber: text("control_number").notNull(),
  status: text("status").notNull().default("pending"),
  integrityStatus: text("integrity_status").notNull().default("unknown"),
  rawEdi: text("raw_edi"),
  parsedJson: jsonb("parsed_json"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("transactions_partner_id_idx").on(table.partnerId),
  index("transactions_status_idx").on(table.status),
  index("transactions_type_idx").on(table.transactionType),
  index("transactions_created_at_idx").on(table.createdAt),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
