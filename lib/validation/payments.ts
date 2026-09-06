import { z } from "zod";
import { PAYMENT_MODES } from "@/lib/constants/payments";
import { objectId, optionalTrimmed, rupeesToMinorUnits, fillMissingCsvColumns } from "@/lib/validation/shared";

/** An unlinked/advance payment recorded from a Customer/Vendor's Ledger — see
 * recordPartyPayment in lib/db/queries/payments.ts. */
export const partyPaymentSchema = z.object({
  direction: z.enum(["in", "out"]),
  amountMinor: rupeesToMinorUnits,
  mode: z.enum(PAYMENT_MODES),
  bankAccountId: objectId,
  paymentDate: z.string().trim().min(1, "Payment date is required"),
  referenceNote: optionalTrimmed(200),
});
export type PartyPaymentInput = z.infer<typeof partyPaymentSchema>;

/** Settling some or all of an existing advance payment against an Invoice/Purchase — see
 * applyAdvancePayment in lib/db/queries/payments.ts. */
export const applyAdvanceSchema = z.object({
  paymentId: objectId,
  amountMinor: rupeesToMinorUnits,
});
export type ApplyAdvanceInput = z.infer<typeof applyAdvanceSchema>;

/** Editing an existing payment's amount/mode/bank account/date/reference note — see updatePayment
 * in lib/db/queries/payments.ts. Party and direction are fixed at creation, so unlike
 * partyPaymentSchema this has no `direction` field. */
export const editPaymentSchema = z.object({
  amountMinor: rupeesToMinorUnits,
  mode: z.enum(PAYMENT_MODES),
  bankAccountId: objectId,
  paymentDate: z.string().trim().min(1, "Payment date is required"),
  referenceNote: optionalTrimmed(200),
});
export type EditPaymentInput = z.infer<typeof editPaymentSchema>;

/** A handful of common non-canonical spellings for payment mode seen in real exports (e.g.
 * "Net Banking") that don't just case-fold onto a PAYMENT_MODES value the way "Cash"/"UPI" do. */
const PAYMENT_MODE_ALIASES: Record<string, (typeof PAYMENT_MODES)[number]> = {
  "net banking": "bank_transfer",
  netbanking: "bank_transfer",
  neft: "bank_transfer",
  rtgs: "bank_transfer",
  imps: "bank_transfer",
};

/**
 * One row of the standalone-payments bulk-upload format — no grouping needed, and no `docNumber`
 * to match against: unlike Invoice/Purchase, a bulk-imported Payment here is never linked to a
 * specific document (see importStandalonePayment in lib/db/queries/payments.ts's doc-comment for
 * why) — it's recorded as an unlinked/advance payment, optionally against a customer or vendor by
 * name. `voucherNumber` becomes the Payment's own receipt number.
 */
const PAYMENT_IMPORT_OPTIONAL_CSV_COLUMNS = [
  "partyType",
  "partyName",
  "bankAccountNumber",
  "bankIfsc",
  "bankName",
  "referenceNote",
] as const;

export const paymentImportRowSchema = z.preprocess(
  (row) =>
    row && typeof row === "object"
      ? fillMissingCsvColumns(row as Record<string, string>, PAYMENT_IMPORT_OPTIONAL_CSV_COLUMNS)
      : row,
  z
    .object({
      voucherNumber: z.string().trim().min(1, "Voucher number is required").max(100),
      direction: z.preprocess(
        (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
        z.enum(["in", "out"]),
      ),
      partyType: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        z.enum(["customer", "vendor"]).optional(),
      ),
      partyName: optionalTrimmed(200),
      amountMinor: rupeesToMinorUnits,
      mode: z.preprocess((v) => {
        if (typeof v !== "string") return v;
        const normalized = v.trim().toLowerCase();
        return PAYMENT_MODE_ALIASES[normalized] ?? normalized;
      }, z.enum(PAYMENT_MODES)),
      paymentDate: z.string().trim().min(1, "Payment date is required"),
      bankAccountNumber: optionalTrimmed(50),
      bankIfsc: optionalTrimmed(20),
      bankName: optionalTrimmed(200),
      referenceNote: optionalTrimmed(200),
    })
    .superRefine((data, ctx) => {
      if (data.partyType && !data.partyName) {
        ctx.addIssue({
          code: "custom",
          message: "Party name is required when partyType is set",
          path: ["partyName"],
        });
      }
    }),
);
export type PaymentImportRowInput = z.infer<typeof paymentImportRowSchema>;
