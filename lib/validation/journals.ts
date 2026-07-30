import { z } from "zod";
import { objectId, optionalTrimmed, rupeesToMinorUnits } from "@/lib/validation/shared";

const rawJournalLineSchema = z
  .object({
    accountType: z.enum(["bank_account", "customer", "vendor", "other"]),
    accountRefId: objectId.optional().or(z.literal("").transform(() => undefined)),
    accountLabel: optionalTrimmed(200),
    side: z.enum(["debit", "credit"]),
    amountMinor: rupeesToMinorUnits,
    note: optionalTrimmed(500),
  })
  .superRefine((data, ctx) => {
    if (data.accountType === "other" && !data.accountLabel) {
      ctx.addIssue({ code: "custom", message: "Label is required", path: ["accountLabel"] });
    }
    if (data.accountType !== "other" && !data.accountRefId) {
      ctx.addIssue({ code: "custom", message: "Select an account", path: ["accountRefId"] });
    }
  });

/** UI collects a single amount + debit/credit side per line (simpler than two amount fields where
 * exactly one must be zero); the query layer's JournalLineWriteInput still wants debitMinor/
 * creditMinor, so this transform does that split. */
export const journalLineSchema = rawJournalLineSchema.transform((val) => ({
  accountType: val.accountType,
  accountRefId: val.accountRefId,
  accountLabel: val.accountLabel,
  debitMinor: val.side === "debit" ? val.amountMinor : 0,
  creditMinor: val.side === "credit" ? val.amountMinor : 0,
  note: val.note,
}));
export type JournalLineInput = z.infer<typeof journalLineSchema>;

export const journalLinesSchema = z
  .array(journalLineSchema)
  .min(2, "A journal needs at least two lines")
  .superRefine((lines, ctx) => {
    const totalDebitMinor = lines.reduce((s, l) => s + l.debitMinor, 0);
    const totalCreditMinor = lines.reduce((s, l) => s + l.creditMinor, 0);
    if (totalDebitMinor !== totalCreditMinor) {
      ctx.addIssue({ code: "custom", message: "Debits and credits must balance", path: [] });
    }
    if (totalDebitMinor === 0) {
      ctx.addIssue({ code: "custom", message: "Enter at least one amount", path: [] });
    }
  });

export const journalHeaderSchema = z.object({
  journalDate: z.string().trim().min(1, "Journal date is required"),
  narration: z.string().trim().min(1, "Narration is required").max(1000),
});
export type JournalHeaderInput = z.infer<typeof journalHeaderSchema>;

export const journalListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tab: z.enum(["active", "deleted"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
});
