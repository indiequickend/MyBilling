import { z } from "zod";
import { PAYMENT_MODES } from "@/lib/constants/payments";
import {
  objectId,
  optionalTrimmed,
  rupeesToMinorUnits,
  optionalRupeesToMinorUnits,
  gstinSchema,
} from "@/lib/validation/shared";

const optionalObjectId = objectId.optional().or(z.literal("").transform(() => undefined));

const rawExpenseHeaderSchema = z.object({
  categoryId: objectId,
  amountMinor: rupeesToMinorUnits,
  mode: z.enum(PAYMENT_MODES),
  bankAccountId: objectId,
  vendorId: optionalObjectId,
  supplierName: optionalTrimmed(200),
  supplierGstin: gstinSchema,
  projectId: optionalObjectId,
  description: optionalTrimmed(500),
  expenseDate: z.string().trim().min(1, "Expense date is required"),
  // TDS deducted from this supplier's payment, and TCS they collected on this expense — both
  // payable-side, informational/report fields only. See Expense.ts's doc-comment.
  tdsApplicable: z.boolean(),
  tdsSectionCode: optionalTrimmed(30),
  tdsRatePercent: z.coerce.number().min(0).max(100).optional(),
  tdsAmountMinor: optionalRupeesToMinorUnits,
  tcsApplicable: z.boolean(),
  tcsSectionCode: optionalTrimmed(30),
  tcsRatePercent: z.coerce.number().min(0).max(100).optional(),
  tcsAmountMinor: optionalRupeesToMinorUnits,
});

export const expenseHeaderSchema = rawExpenseHeaderSchema.superRefine((val, ctx) => {
  if (val.tdsApplicable && !val.tdsAmountMinor) {
    ctx.addIssue({ code: "custom", message: "Enter the TDS amount deducted", path: ["tdsAmountMinor"] });
  }
  if (val.tcsApplicable && !val.tcsAmountMinor) {
    ctx.addIssue({ code: "custom", message: "Enter the TCS amount collected", path: ["tcsAmountMinor"] });
  }
});
export type ExpenseHeaderInput = z.infer<typeof expenseHeaderSchema>;

export const expenseListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  categoryId: objectId.optional().or(z.literal("").transform(() => undefined)),
  projectId: objectId.optional().or(z.literal("").transform(() => undefined)),
  tab: z.enum(["all", "recorded", "cancelled", "deleted"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
});

/** One CSV row of the bulk-upload format. Category and bank account are free-text names (matched
 * against existing records — category is auto-created if new, bank account must already exist),
 * not raw ids — a spreadsheet author shouldn't have to look up ObjectIds by hand. */
export const expenseRowSchema = z.object({
  categoryName: z.string().trim().min(1, "Category is required").max(100),
  amountMinor: rupeesToMinorUnits,
  mode: z.enum(PAYMENT_MODES),
  bankAccountName: z.string().trim().min(1, "Bank/cash account is required").max(200),
  supplierName: optionalTrimmed(200),
  supplierGstin: gstinSchema,
  description: optionalTrimmed(500),
  expenseDate: z.string().trim().min(1, "Expense date is required"),
});
export type ExpenseRowInput = z.infer<typeof expenseRowSchema>;

/** Documented, enforced ceiling for a single bulk-upload request — this app has no background
 * job infrastructure, so an upload is validated and inserted synchronously in one request. */
export const EXPENSE_BULK_UPLOAD_MAX_ROWS = 500;
