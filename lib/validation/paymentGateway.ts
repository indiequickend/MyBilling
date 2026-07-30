import { z } from "zod";
import { objectId, optionalTrimmed } from "@/lib/validation/shared";

export const paymentGatewayAccountSchema = z.object({
  keyId: z.string().trim().min(1, "Key ID is required").max(200),
  keySecret: z.string().trim().min(1, "Key secret is required").max(200),
  webhookSecret: z.string().trim().min(1, "Webhook secret is required").max(200),
  accountId: optionalTrimmed(200),
  settlementBankAccountId: objectId,
});
export type PaymentGatewayAccountInput = z.infer<typeof paymentGatewayAccountSchema>;
