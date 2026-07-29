import { z } from "zod";
import { DISCOUNT_TARGETS } from "@/lib/constants/invoices";
import { objectId, optionalTrimmed, rupeesToMinorUnits, normalizeDiscountValue } from "@/lib/validation/shared";

const optionalObjectId = objectId.optional().or(z.literal("").transform(() => undefined));

const rawPurchaseOrderLineItemSchema = z.object({
  productId: optionalObjectId,
  variantId: optionalObjectId,
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

export const purchaseOrderLineItemSchema = rawPurchaseOrderLineItemSchema.transform((val, ctx) => ({
  ...val,
  discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
}));
export type PurchaseOrderLineItemInput = z.infer<typeof purchaseOrderLineItemSchema>;

export const purchaseOrderLineItemsSchema = z
  .array(purchaseOrderLineItemSchema)
  .min(1, "Add at least one line item");

const rawPurchaseOrderDiscountSchema = z.object({
  discountType: z.enum(["amount", "percentage"]),
  discountValue: z.union([z.string(), z.number()]),
  discountTarget: z.enum(DISCOUNT_TARGETS),
});

export const purchaseOrderDiscountSchema = rawPurchaseOrderDiscountSchema.transform((val, ctx) => ({
  ...val,
  discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
}));
export type PurchaseOrderDiscountInput = z.infer<typeof purchaseOrderDiscountSchema>;

export const purchaseOrderHeaderSchema = z.object({
  vendorId: objectId,
  orderDate: z.string().trim().min(1, "Order date is required"),
  expectedDeliveryDate: optionalTrimmed(30),
  referenceNumber: optionalTrimmed(100),
  placeOfSupplyState: z.string().trim().min(1, "Place of supply is required").max(100),
  reverseCharge: z.boolean(),
  roundOff: z.boolean(),
  notes: optionalTrimmed(2000),
  terms: optionalTrimmed(2000),
  noteTemplateId: optionalObjectId,
  termTemplateId: optionalObjectId,
});
export type PurchaseOrderHeaderInput = z.infer<typeof purchaseOrderHeaderSchema>;

export const purchaseOrderListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  vendorId: objectId.optional().or(z.literal("").transform(() => undefined)),
  tab: z.enum(["all", "draft", "open", "closed", "cancelled", "deleted"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
});
