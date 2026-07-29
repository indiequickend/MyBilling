import { z } from "zod";
import { DISCOUNT_TARGETS } from "@/lib/constants/invoices";
import { PAYMENT_MODES } from "@/lib/constants/payments";
import { objectId, optionalTrimmed, rupeesToMinorUnits } from "@/lib/validation/shared";

const optionalObjectId = objectId.optional().or(z.literal("").transform(() => undefined));

/**
 * `discountValue`'s meaning depends on the sibling `discountType`: minor units (paise) when
 * "amount", a raw 0-100 percent when "percentage" — matching lib/documents/calc.ts and the
 * DocumentLineItem/Invoice schema comments. A raw string/number is accepted since a form submits
 * one text input regardless of which discount type is selected; this normalizes it to a number
 * or reports a Zod issue at `discountValue`.
 */
function normalizeDiscountValue(
  discountType: "amount" | "percentage",
  rawValue: string | number,
  ctx: z.RefinementCtx,
): number | typeof z.NEVER {
  if (discountType === "percentage") {
    const pct = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a discount percentage between 0 and 100",
        path: ["discountValue"],
      });
      return z.NEVER;
    }
    return pct;
  }
  const parsed = rupeesToMinorUnits.safeParse(rawValue);
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Enter a valid discount amount", path: ["discountValue"] });
    return z.NEVER;
  }
  return parsed.data;
}

const rawInvoiceLineItemSchema = z.object({
  productId: optionalObjectId,
  variantId: optionalObjectId,
  description: z.string().trim().min(1, "Description is required").max(500),
  hsnOrSac: optionalTrimmed(20),
  unit: optionalTrimmed(20),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unitPriceMinor: rupeesToMinorUnits,
  discountType: z.enum(["amount", "percentage"]),
  discountValue: z.union([z.string(), z.number()]),
  taxRatePercent: z.coerce.number().min(0).max(100),
});

export const invoiceLineItemSchema = rawInvoiceLineItemSchema.transform((val, ctx) => ({
  ...val,
  discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
}));
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>;

export const invoiceLineItemsSchema = z.array(invoiceLineItemSchema).min(1, "Add at least one line item");

const rawInvoiceDiscountSchema = z.object({
  discountType: z.enum(["amount", "percentage"]),
  discountValue: z.union([z.string(), z.number()]),
  discountTarget: z.enum(DISCOUNT_TARGETS),
});

export const invoiceDiscountSchema = rawInvoiceDiscountSchema.transform((val, ctx) => ({
  ...val,
  discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
}));
export type InvoiceDiscountInput = z.infer<typeof invoiceDiscountSchema>;

export const invoiceHeaderSchema = z.object({
  customerId: objectId,
  invoiceDate: z.string().trim().min(1, "Invoice date is required"),
  dueDate: optionalTrimmed(30),
  referenceNumber: optionalTrimmed(100),
  placeOfSupplyState: z.string().trim().min(1, "Place of supply is required").max(100),
  reverseCharge: z.boolean(),
  roundOff: z.boolean(),
  notes: optionalTrimmed(2000),
  terms: optionalTrimmed(2000),
  noteTemplateId: optionalObjectId,
  termTemplateId: optionalObjectId,
  signatureId: optionalObjectId,
  bankAccountId: optionalObjectId,
});
export type InvoiceHeaderInput = z.infer<typeof invoiceHeaderSchema>;

export const invoicePaymentSplitSchema = z.object({
  amountMinor: rupeesToMinorUnits,
  mode: z.enum(PAYMENT_MODES),
  bankAccountId: objectId,
  paymentDate: z.string().trim().min(1, "Payment date is required"),
  referenceNote: optionalTrimmed(200),
});
export type InvoicePaymentSplitInput = z.infer<typeof invoicePaymentSplitSchema>;

export function invoicePaymentSplitsSchema(maxTotalMinor: number) {
  return z.array(invoicePaymentSplitSchema).superRefine((splits, ctx) => {
    const sum = splits.reduce((total, s) => total + s.amountMinor, 0);
    if (sum > maxTotalMinor) {
      ctx.addIssue({
        code: "custom",
        message: "Payments recorded exceed the invoice total",
        path: [],
      });
    }
  });
}

export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  customerId: objectId.optional().or(z.literal("").transform(() => undefined)),
  tab: z.enum(["all", "draft", "pending", "partially_paid", "paid", "cancelled", "deleted"]).default("all"),
  dateFrom: optionalTrimmed(30),
  dateTo: optionalTrimmed(30),
  page: z.coerce.number().int().min(1).default(1),
});
