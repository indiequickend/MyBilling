import { z } from "zod";

// Booleans here are `z.boolean()`, not `z.coerce.boolean()` — coercion treats any
// non-empty string (including "false") as truthy, which is wrong for HTML
// checkboxes. Callers convert `formData.get(name) === "on"` to a real boolean
// before parsing (see the parseCheckbox helper used by the preferences actions).

export const documentPreferencesSchema = z.object({
  roundOff: z.boolean(),
  defaultDiscountType: z.enum(["amount", "percentage"]),
  showHeaderFieldSuggestions: z.boolean(),
  defaultDueDateDays: z.coerce.number().int().min(0).max(365),
});
export type DocumentPreferencesInput = z.infer<typeof documentPreferencesSchema>;

export const documentPreferencesFormSchema = z.object({
  sales: documentPreferencesSchema,
  purchases: documentPreferencesSchema,
  conversions: documentPreferencesSchema,
});
export type DocumentPreferencesFormInput = z.infer<typeof documentPreferencesFormSchema>;

export const productPreferencesSchema = z.object({
  defaultItemType: z.enum(["product", "service"]),
  defaultPriceInclusiveOfTax: z.boolean(),
  maxDiscountPercent: z.coerce.number().min(0).max(100),
  defaultUnit: z.string().trim().min(1).max(20),
  defaultTaxRatePercent: z.coerce.number().min(0).max(100),
});

export const inventoryPreferencesSchema = z.object({
  trackInventory: z.boolean(),
  defaultWarehouseId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const batchPreferencesSchema = z.object({
  batchTrackingEnabledByDefault: z.boolean(),
  expiryTrackingEnabledByDefault: z.boolean(),
});

export const productsInventoryPreferencesFormSchema = z.object({
  product: productPreferencesSchema,
  inventory: inventoryPreferencesSchema,
  batch: batchPreferencesSchema,
});
export type ProductsInventoryPreferencesFormInput = z.infer<
  typeof productsInventoryPreferencesFormSchema
>;
