import { z } from "zod";
import { DISCOUNT_TARGETS } from "@/lib/constants/invoices";
import {
  objectId,
  optionalTrimmed,
  rupeesToMinorUnits,
  optionalRupeesToMinorUnits,
  normalizeDiscountValue,
  gstinSchema,
  fillMissingCsvColumns,
} from "@/lib/validation/shared";

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

/**
 * One row of the purchase-order bulk-upload format — no grouping needed here (unlike
 * invoices/purchases): a Purchase Order never takes payments in this app, so there's no variable
 * sub-item count driving a one-row-per-payment CSV shape — one CSV row is always one purchase
 * order. Totals are stored exactly as given (see importPurchaseOrder in
 * lib/db/queries/purchaseOrders.ts) rather than recomputed.
 */
const PURCHASE_ORDER_OPTIONAL_CSV_COLUMNS = [
  "expectedDeliveryDate",
  "vendorPhone",
  "vendorGstin",
  "placeOfSupplyState",
  "referenceNumber",
  "notes",
  "terms",
  "lineItemDescription",
  "discountAmountMinor",
  "taxAmountMinor",
] as const;

export const purchaseOrderRowSchema = z.preprocess(
  (row) =>
    row && typeof row === "object"
      ? fillMissingCsvColumns(row as Record<string, string>, PURCHASE_ORDER_OPTIONAL_CSV_COLUMNS)
      : row,
  z.object({
    docNumber: z.string().trim().min(1, "Purchase order number is required").max(100),
    orderDate: z.string().trim().min(1, "Order date is required"),
    expectedDeliveryDate: optionalTrimmed(30),
    vendorName: z.string().trim().min(1, "Vendor name is required").max(200),
    vendorPhone: optionalTrimmed(20),
    vendorGstin: gstinSchema,
    placeOfSupplyState: optionalTrimmed(100),
    referenceNumber: optionalTrimmed(100),
    notes: optionalTrimmed(2000),
    terms: optionalTrimmed(5000),
    lineItemDescription: optionalTrimmed(500),
    subtotalMinor: rupeesToMinorUnits,
    discountAmountMinor: optionalRupeesToMinorUnits.transform((v) => v ?? 0),
    taxAmountMinor: optionalRupeesToMinorUnits.transform((v) => v ?? 0),
    totalAmountMinor: rupeesToMinorUnits,
  }),
);
export type PurchaseOrderRowInput = z.infer<typeof purchaseOrderRowSchema>;
