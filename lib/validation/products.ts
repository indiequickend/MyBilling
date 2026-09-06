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
});
export type ProductVariantInput = z.infer<typeof productVariantSchema>;

export const priceOverrideSchema = z.object({
  priceListId: objectId,
  priceMinor: rupeesToMinorUnits,
});

export const productVariantsSchema = z.array(productVariantSchema).max(200);

export const productBatchSchema = z.object({
  batchNumber: z.string().trim().min(1, "Batch number is required").max(100),
  expiryDate: optionalTrimmed(30),
});
export type ProductBatchInput = z.infer<typeof productBatchSchema>;

export const productBatchesSchema = z.array(productBatchSchema).max(500);

export const productStockTrackingSchema = z
  .object({
    enabled: z.boolean(),
    batchTracked: z.boolean(),
    serialTracked: z.boolean(),
    reorderLevel: z.coerce.number().min(0).optional().or(z.literal("").transform(() => undefined)),
  })
  .superRefine((data, ctx) => {
    if (data.batchTracked && data.serialTracked) {
      ctx.addIssue({
        code: "custom",
        message: "A product can be batch-tracked or serial-tracked, not both",
        path: ["batchTracked"],
      });
    }
  });
export type ProductStockTrackingInput = z.infer<typeof productStockTrackingSchema>;

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
  sellingPriceMinor: optionalRupeesToMinorUnits,
  priceIsTaxInclusive: z.boolean(),
  taxRatePercent: z.coerce.number().min(0).max(100),
  barcode: optionalTrimmed(100),
  variants: productVariantsSchema.default([]),
  priceOverrides: priceOverridesSchema.default([]),
  stockTracking: productStockTrackingSchema.default({ enabled: false, batchTracked: false, serialTracked: false }),
  batches: productBatchesSchema.default([]),
}).superRefine((data, ctx) => {
  // Selling price is only optional when variants supply their own prices instead.
  if (data.variants.length === 0 && data.sellingPriceMinor === undefined) {
    ctx.addIssue({
      code: "custom",
      message: "Selling price is required when there are no variants",
      path: ["sellingPriceMinor"],
    });
  }
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

/**
 * One *grouped* product for the bulk-upload format — the output of `groupProductCsvRows`, not a
 * raw CSV line. Category/group are free-text names (auto-created if new), not raw ids — a
 * spreadsheet author shouldn't have to look up ObjectIds by hand. Selling price is only optional
 * when variants supply their own prices instead, mirroring `productSchema` above.
 */
export const productGroupRowSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    // A spreadsheet author (or another system's export) is just as likely to write "Service" or
    // "PRODUCT" as the exact lowercase enum value, so normalize case before matching.
    type: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
      z.enum(["product", "service"]).default("product"),
    ),
    hsnOrSac: optionalTrimmed(20),
    unit: optionalTrimmed(20),
    categoryName: optionalTrimmed(100),
    groupName: optionalTrimmed(100),
    purchasePriceMinor: optionalRupeesToMinorUnits,
    sellingPriceMinor: optionalRupeesToMinorUnits,
    priceIsTaxInclusive: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => v === "yes" || v === "true")
      .optional()
      .transform((v) => v ?? false),
    taxRatePercent: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.coerce.number({ error: "Tax rate is required" }).min(0).max(100),
    ),
    barcode: optionalTrimmed(100),
    variants: z.array(productVariantSchema).max(200).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.variants.length === 0 && data.sellingPriceMinor === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Selling price is required when there are no variants",
        path: ["sellingPriceMinor"],
      });
    }
    const seen = new Set<string>();
    data.variants.forEach((v, i) => {
      const key = v.name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate variant name "${v.name}"`,
          path: ["variants", i, "name"],
        });
      }
      seen.add(key);
    });
  });
export type ProductGroupRowInput = z.infer<typeof productGroupRowSchema>;

/** Raw (pre-validation) shape of one grouped product, produced by `groupProductCsvRows` and fed
 * into `productGroupRowSchema.safeParse`. Every product-level field is a raw string, "" meaning
 * "no row in this group set it" — the same "empty string means not set" convention `optionalTrimmed`
 * and `optionalRupeesToMinorUnits` already expect, so these merged fields validate exactly like any
 * single CSV cell would. */
export type ProductCsvRawGroup = {
  rowNumber: number;
  name: string;
  type: string;
  hsnOrSac: string;
  unit: string;
  categoryName: string;
  groupName: string;
  purchasePriceMinor: string;
  sellingPriceMinor: string;
  priceIsTaxInclusive: string;
  taxRatePercent: string;
  barcode: string;
  variants: Array<{
    name: string;
    sku: string;
    barcode: string;
    sellingPriceOverrideMinor: string;
    purchasePriceOverrideMinor: string;
  }>;
};

const PRODUCT_LEVEL_CSV_COLUMNS = [
  "type",
  "hsnOrSac",
  "unit",
  "categoryName",
  "groupName",
  "purchasePriceMinor",
  "sellingPriceMinor",
  "priceIsTaxInclusive",
  "taxRatePercent",
  "barcode",
] as const;

/**
 * Groups raw bulk-upload CSV lines into one entry per product, keyed by `name` (trimmed,
 * case-insensitive) — the fix for variants each being imported as a separate product. A line
 * whose `variantName` cell is filled in contributes one variant to its product's group instead
 * of becoming a product of its own; product-level columns (price, tax rate, HSN, etc.) are taken
 * from the first line in the group where that column is non-blank, so a spreadsheet author only
 * has to fill them in once per product rather than repeating them on every variant line.
 *
 * A blank `name` is never grouped with anything (each becomes its own singleton, invalid) so the
 * existing "Name is required" row error still surfaces per bad line instead of silently merging
 * unrelated blank-named rows together.
 */
export function groupProductCsvRows(rows: Record<string, string>[]): ProductCsvRawGroup[] {
  const groups = new Map<string, ProductCsvRawGroup>();
  const filledColumns = new Map<string, Set<string>>();
  const order: string[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const name = (row.name ?? "").trim();
    const key = name ? name.toLowerCase() : `__unnamed_${rowNumber}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        rowNumber,
        name,
        type: "",
        hsnOrSac: "",
        unit: "",
        categoryName: "",
        groupName: "",
        purchasePriceMinor: "",
        sellingPriceMinor: "",
        priceIsTaxInclusive: "",
        taxRatePercent: "",
        barcode: "",
        variants: [],
      };
      groups.set(key, group);
      filledColumns.set(key, new Set());
      order.push(key);
    }
    const filled = filledColumns.get(key)!;

    for (const col of PRODUCT_LEVEL_CSV_COLUMNS) {
      const value = row[col]?.trim();
      if (value && !filled.has(col)) {
        group[col] = value;
        filled.add(col);
      }
    }

    const variantName = row.variantName?.trim();
    if (variantName) {
      group.variants.push({
        name: variantName,
        sku: row.variantSku?.trim() ?? "",
        barcode: row.variantBarcode?.trim() ?? "",
        sellingPriceOverrideMinor: row.variantSellingPriceMinor?.trim() ?? "",
        purchasePriceOverrideMinor: row.variantPurchasePriceMinor?.trim() ?? "",
      });
    }
  });

  return order.map((key) => groups.get(key)!);
}
