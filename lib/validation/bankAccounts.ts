import { z } from "zod";
import { BANK_ACCOUNT_TYPES } from "@/lib/constants/payments";
import { optionalRupeesToMinorUnits, optionalTrimmed } from "@/lib/validation/shared";

export const bankAccountSchema = z.object({
  type: z.enum(BANK_ACCOUNT_TYPES),
  name: z.string().trim().min(1, "Name is required").max(100),
  accountHolderName: optionalTrimmed(200),
  accountNumber: optionalTrimmed(30),
  ifsc: optionalTrimmed(11),
  upiId: optionalTrimmed(100),
  openingBalanceMinor: optionalRupeesToMinorUnits,
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

export const bankAccountListQuerySchema = z.object({
  tab: z.enum(["active", "deleted"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
});
