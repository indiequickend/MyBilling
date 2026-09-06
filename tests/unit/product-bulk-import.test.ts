import { describe, expect, it } from "vitest";
import { groupProductCsvRows, productGroupRowSchema } from "@/lib/validation/products";

describe("groupProductCsvRows", () => {
  it("combines rows sharing a name into one product with one variant per row", () => {
    const rows: Record<string, string>[] = [
      {
        name: "T-Shirt",
        sellingPriceMinor: "",
        taxRatePercent: "18",
        hsnOrSac: "6109",
        variantName: "Red / M",
        variantSku: "TS-RM",
        variantSellingPriceMinor: "499.00",
      },
      {
        name: "T-Shirt",
        sellingPriceMinor: "",
        taxRatePercent: "",
        variantName: "Red / L",
        variantSku: "TS-RL",
        variantSellingPriceMinor: "549.00",
      },
      {
        name: "T-Shirt",
        sellingPriceMinor: "",
        taxRatePercent: "",
        variantName: "Blue / M",
        variantSku: "TS-BM",
        variantSellingPriceMinor: "499.00",
      },
    ];

    const groups = groupProductCsvRows(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("T-Shirt");
    expect(groups[0].taxRatePercent).toBe("18"); // picked up from the first row that set it
    expect(groups[0].hsnOrSac).toBe("6109");
    expect(groups[0].variants).toHaveLength(3);
    expect(groups[0].variants.map((v) => v.name)).toEqual(["Red / M", "Red / L", "Blue / M"]);
  });

  it("keeps rows with different names as separate products", () => {
    const rows = [
      { name: "Mug", sellingPriceMinor: "199.00", taxRatePercent: "18" },
      { name: "Bottle", sellingPriceMinor: "299.00", taxRatePercent: "18" },
    ];

    const groups = groupProductCsvRows(rows);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.name)).toEqual(["Mug", "Bottle"]);
    expect(groups.every((g) => g.variants.length === 0)).toBe(true);
  });

  it("groups by name case-insensitively and never merges blank-named rows", () => {
    const rows: Record<string, string>[] = [
      { name: "Cap", variantName: "Black" },
      { name: "cap", variantName: "White" },
      { name: "", variantName: "" },
      { name: "", variantName: "" },
    ];

    const groups = groupProductCsvRows(rows);

    const cap = groups.find((g) => g.name === "Cap");
    expect(cap?.variants.map((v) => v.name)).toEqual(["Black", "White"]);

    const unnamed = groups.filter((g) => g.name === "");
    expect(unnamed).toHaveLength(2); // each blank-named row stays its own (invalid) group
  });

  it("reports the row number of the first line in the group", () => {
    const rows: Record<string, string>[] = [
      { name: "Other" },
      { name: "T-Shirt", variantName: "Red / M" },
      { name: "T-Shirt", variantName: "Red / L" },
    ];

    const groups = groupProductCsvRows(rows);
    const tshirt = groups.find((g) => g.name === "T-Shirt");
    expect(tshirt?.rowNumber).toBe(3); // CSV row 3 (header is row 1, "Other" is row 2)
  });
});

describe("groupProductCsvRows -> productGroupRowSchema (end to end)", () => {
  it("a CSV with 3 variant rows for one product validates as a single product with 3 variants, not 3 products", () => {
    const rows = [
      {
        name: "T-Shirt",
        sellingPriceMinor: "",
        taxRatePercent: "18",
        variantName: "Red / M",
        variantSellingPriceMinor: "499.00",
      },
      { name: "T-Shirt", sellingPriceMinor: "", taxRatePercent: "", variantName: "Red / L", variantSellingPriceMinor: "549.00" },
      { name: "T-Shirt", sellingPriceMinor: "", taxRatePercent: "", variantName: "Blue / M", variantSellingPriceMinor: "499.00" },
    ];

    const groups = groupProductCsvRows(rows);
    expect(groups).toHaveLength(1);

    const parsed = productGroupRowSchema.safeParse(groups[0]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("T-Shirt");
      expect(parsed.data.taxRatePercent).toBe(18);
      expect(parsed.data.variants).toHaveLength(3);
      expect(parsed.data.variants.map((v) => v.sellingPriceOverrideMinor)).toEqual([49900, 54900, 49900]);
    }
  });
});

describe("productGroupRowSchema", () => {
  it("accepts a variant-only product (no product-level selling price) when variants supply prices", () => {
    const result = productGroupRowSchema.safeParse({
      name: "T-Shirt",
      taxRatePercent: "18",
      sellingPriceMinor: "",
      purchasePriceMinor: "",
      variants: [
        { name: "Red / M", sku: "", barcode: "", sellingPriceOverrideMinor: "499.00", purchasePriceOverrideMinor: "" },
        { name: "Red / L", sku: "", barcode: "", sellingPriceOverrideMinor: "549.00", purchasePriceOverrideMinor: "" },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variants).toHaveLength(2);
      expect(result.data.sellingPriceMinor).toBeUndefined();
    }
  });

  it("rejects a product with no variants and no selling price", () => {
    const result = productGroupRowSchema.safeParse({ name: "Mug", taxRatePercent: "18" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing tax rate", () => {
    const result = productGroupRowSchema.safeParse({ name: "Mug", sellingPriceMinor: "199.00" });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate variant names within the same product", () => {
    const result = productGroupRowSchema.safeParse({
      name: "T-Shirt",
      taxRatePercent: "18",
      variants: [
        { name: "Red / M", sku: "", barcode: "", sellingPriceOverrideMinor: "499.00", purchasePriceOverrideMinor: "" },
        { name: "red / m", sku: "", barcode: "", sellingPriceOverrideMinor: "499.00", purchasePriceOverrideMinor: "" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts type values in any case, e.g. a CSV/export that writes \"Service\" or \"PRODUCT\"", () => {
    const service = productGroupRowSchema.safeParse({
      name: "Airport Transfer",
      type: "Service",
      sellingPriceMinor: "0",
      purchasePriceMinor: "0",
      taxRatePercent: "5",
    });
    expect(service.success).toBe(true);
    if (service.success) expect(service.data.type).toBe("service");

    const product = productGroupRowSchema.safeParse({
      name: "Mug",
      type: "PRODUCT",
      sellingPriceMinor: "199.00",
      purchasePriceMinor: "",
      taxRatePercent: "18",
    });
    expect(product.success).toBe(true);
    if (product.success) expect(product.data.type).toBe("product");
  });
});
