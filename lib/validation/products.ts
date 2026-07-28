import { z } from "zod";
import {
  objectId,
  optionalRupeesToMinorUnits,
  optionalTrimmed,
  rupeesToMinorUnits,
} from "@/lib/validation/shared";

export const productVariantSchema = z.object({
  name: z.string().trim().min(1, "Variant name is required").max(100),
  sku: optionalTrimmed(100),
  barcode: optionalTrimmed(100),
  sellingPriceOverrideMinor: optionalRupeesToMinorUnits,
  purchasePriceOverrideMinor: optionalRupeesToMinorUnits,
  hsnOrSacOverride: optionalTrimmed(20),
});
export type ProductVariantInput = z.infer<typeof productVariantSchema>;

export const priceOverrideSchema = z.object({
  priceListId: objectId,
  priceMinor: rupeesToMinorUnits,
});

export const productVariantsSchema = z.array(productVariantSchema).max(200);

export const priceOverridesSchema = z.array(priceOverrideSchema).superRefine((overrides, ctx) => {
  const seen = new Set<string>();
  for (const [i, o] of overrides.entries()) {
    if (seen.has(o.priceListId)) {
      ctx.addIssue({
        code: "custom",
        message: "Duplicate price list",
        path: [i, "priceListId"],
      });
    }
    seen.add(o.priceListId);
  }
});

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(["product", "service"]),
  hsnOrSac: optionalTrimmed(20),
  unit: optionalTrimmed(20),
  categoryId: objectId.optional().or(z.literal("").transform(() => undefined)),
  groupId: objectId.optional().or(z.literal("").transform(() => undefined)),
  purchasePriceMinor: optionalRupeesToMinorUnits,
  sellingPriceMinor: rupeesToMinorUnits,
  priceIsTaxInclusive: z.boolean(),
  taxRatePercent: z.coerce.number().min(0).max(100),
  barcode: optionalTrimmed(100),
  variants: productVariantsSchema.default([]),
  priceOverrides: priceOverridesSchema.default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

export const productListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  categoryId: objectId.optional().or(z.literal("").transform(() => undefined)),
  groupId: objectId.optional().or(z.literal("").transform(() => undefined)),
  type: z.enum(["product", "service"]).optional(),
  tab: z.enum(["active", "deleted"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
});
