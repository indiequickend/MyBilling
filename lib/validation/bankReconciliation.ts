import { z } from "zod";
import { optionalTrimmed, rupeesToMinorUnits } from "@/lib/validation/shared";

/** Documented, enforced ceiling for a single import request — this app has no background-job
 * infrastructure, so a statement import is validated and inserted synchronously in one request
 * (same reasoning as EXPENSE_BULK_UPLOAD_MAX_ROWS in lib/validation/expenses.ts). */
export const BANK_STATEMENT_MAX_ROWS = 1000;

export const bankStatementRowSchema = z.object({
  statementDate: z.string().trim().min(1, "Date is required"),
  description: optionalTrimmed(500),
  amountMinor: rupeesToMinorUnits,
  direction: z.enum(["credit", "debit"]),
});
export type BankStatementRowInput = z.infer<typeof bankStatementRowSchema>;
