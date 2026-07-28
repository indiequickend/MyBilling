import { z } from "zod";
import { objectId, optionalTrimmed, rupeesToMinorUnits } from "@/lib/validation/shared";

export const bankTransferSchema = z
  .object({
    fromAccountId: objectId,
    toAccountId: objectId,
    amountMinor: rupeesToMinorUnits,
    transferDate: z.string().trim().min(1, "Date is required"),
    note: optionalTrimmed(500),
  })
  .superRefine((val, ctx) => {
    if (val.fromAccountId === val.toAccountId) {
      ctx.addIssue({
        code: "custom",
        message: "Choose two different accounts",
        path: ["toAccountId"],
      });
    }
    if (val.amountMinor <= 0) {
      ctx.addIssue({ code: "custom", message: "Enter an amount greater than zero", path: ["amountMinor"] });
    }
  });
export type BankTransferInput = z.infer<typeof bankTransferSchema>;
