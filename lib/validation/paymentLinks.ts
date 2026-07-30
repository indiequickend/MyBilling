import { z } from "zod";
import { objectId, optionalTrimmed, rupeesToMinorUnits } from "@/lib/validation/shared";

export const PAYMENT_LINK_EXPIRY_OPTIONS = ["1", "3", "7", "30"] as const;

export const paymentLinkSchema = z.object({
  amountMinor: rupeesToMinorUnits,
  linkedInvoiceId: objectId.optional().or(z.literal("").transform(() => undefined)),
  note: optionalTrimmed(500),
  expiresInDays: z.enum(PAYMENT_LINK_EXPIRY_OPTIONS),
});
export type PaymentLinkInput = z.infer<typeof paymentLinkSchema>;
