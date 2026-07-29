import { z } from "zod";
import { DISCOUNT_TARGETS } from "@/lib/constants/invoices";
import { objectId, optionalTrimmed, rupeesToMinorUnits, normalizeDiscountValue } from "@/lib/validation/shared";

const rawCreditNoteLineItemSchema = z.object({
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

export const creditNoteLineItemSchema = rawCreditNoteLineItemSchema.transform((val, ctx) => ({
  ...val,
  discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
}));
export type CreditNoteLineItemInput = z.infer<typeof creditNoteLineItemSchema>;

export const creditNoteLineItemsSchema = z
  .array(creditNoteLineItemSchema)
  .min(1, "Add at least one line item");

const rawCreditNoteDiscountSchema = z.object({
  discountType: z.enum(["amount", "percentage"]),
  discountValue: z.union([z.string(), z.number()]),
  discountTarget: z.enum(DISCOUNT_TARGETS),
});

export const creditNoteDiscountSchema = rawCreditNoteDiscountSchema.transform((val, ctx) => ({
  ...val,
  discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
}));
export type CreditNoteDiscountInput = z.infer<typeof creditNoteDiscountSchema>;

export const creditNoteHeaderSchema = z.object({
  linkedInvoiceId: objectId,
  creditNoteDate: z.string().trim().min(1, "Credit note date is required"),
  reason: optionalTrimmed(500),
  placeOfSupplyState: z.string().trim().min(1, "Place of supply is required").max(100),
  roundOff: z.boolean(),
});
export type CreditNoteHeaderInput = z.infer<typeof creditNoteHeaderSchema>;

export const creditNoteListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  customerId: objectId.optional().or(z.literal("").transform(() => undefined)),
  tab: z.enum(["all", "draft", "issued", "cancelled", "deleted"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
});
