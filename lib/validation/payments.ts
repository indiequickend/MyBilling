import { z } from "zod";
import { PAYMENT_MODES } from "@/lib/constants/payments";
import { objectId, optionalTrimmed, rupeesToMinorUnits } from "@/lib/validation/shared";

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
