import { z } from "zod";
import { DISCOUNT_TARGETS } from "@/lib/constants/invoices";
import { objectId, optionalTrimmed, rupeesToMinorUnits, normalizeDiscountValue } from "@/lib/validation/shared";

const rawDebitNoteLineItemSchema = z.object({
  productId: objectId.optional().or(z.literal("").transform(() => undefined)),
  variantId: objectId.optional().or(z.literal("").transform(() => undefined)),
  description: z.string().trim().min(1, "Description is required").max(500),
  notes: optionalTrimmed(2000),
  hsnOrSac: optionalTrimmed(20),
  unit: optionalTrimmed(20),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unitPriceMinor: rupeesToMinorUnits,
  discountType: z.enum(["amount", "percentage"]),
  discountValue: z.union([z.string(), z.number()]),
  taxRatePercent: z.coerce.number().min(0).max(100),
});

export const debitNoteLineItemSchema = rawDebitNoteLineItemSchema.transform((val, ctx) => ({
  ...val,
  discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
}));
export type DebitNoteLineItemInput = z.infer<typeof debitNoteLineItemSchema>;

export const debitNoteLineItemsSchema = z.array(debitNoteLineItemSchema).min(1, "Add at least one line item");

const rawDebitNoteDiscountSchema = z.object({
  discountType: z.enum(["amount", "percentage"]),
  discountValue: z.union([z.string(), z.number()]),
  discountTarget: z.enum(DISCOUNT_TARGETS),
});

export const debitNoteDiscountSchema = rawDebitNoteDiscountSchema.transform((val, ctx) => ({
  ...val,
  discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
}));
export type DebitNoteDiscountInput = z.infer<typeof debitNoteDiscountSchema>;

export const debitNoteHeaderSchema = z.object({
  linkedPurchaseId: objectId,
  debitNoteDate: z.string().trim().min(1, "Debit note date is required"),
  reason: optionalTrimmed(500),
  placeOfSupplyState: z.string().trim().min(1, "Place of supply is required").max(100),
  roundOff: z.boolean(),
});
export type DebitNoteHeaderInput = z.infer<typeof debitNoteHeaderSchema>;

export const debitNoteListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  vendorId: objectId.optional().or(z.literal("").transform(() => undefined)),
  tab: z.enum(["all", "draft", "issued", "cancelled", "deleted"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
});
