import { z } from "zod";
import { PAYMENT_MODES } from "@/lib/constants/payments";
import { objectId, optionalTrimmed, rupeesToMinorUnits } from "@/lib/validation/shared";

const optionalObjectId = objectId.optional().or(z.literal("").transform(() => undefined));

export const indirectIncomeHeaderSchema = z.object({
  categoryId: objectId,
  amountMinor: rupeesToMinorUnits,
  mode: z.enum(PAYMENT_MODES),
  bankAccountId: objectId,
  customerId: optionalObjectId,
  sourceName: optionalTrimmed(200),
  description: optionalTrimmed(500),
  incomeDate: z.string().trim().min(1, "Date is required"),
});
export type IndirectIncomeHeaderInput = z.infer<typeof indirectIncomeHeaderSchema>;

export const indirectIncomeListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  categoryId: objectId.optional().or(z.literal("").transform(() => undefined)),
  tab: z.enum(["all", "recorded", "cancelled", "deleted"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
});
