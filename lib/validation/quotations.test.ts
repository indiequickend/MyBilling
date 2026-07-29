import { describe, expect, it } from "vitest";
import { quotationLineItemSchema, quotationDiscountSchema } from "@/lib/validation/quotations";

const baseLineItem = {
  description: "Widget",
  quantity: "2",
  unitPriceMinor: "100.00",
  taxRatePercent: "18",
};

describe("quotationLineItemSchema", () => {
  it("normalizes a percentage discount to a raw 0-100 number", () => {
    const result = quotationLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "percentage",
      discountValue: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discountValue).toBe(10);
  });

  it("normalizes an amount discount to minor units", () => {
    const result = quotationLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "amount",
      discountValue: "50.00",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discountValue).toBe(5_000);
  });

  it("rejects a percentage discount over 100", () => {
    const result = quotationLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "percentage",
      discountValue: "150",
    });
    expect(result.success).toBe(false);
  });

  it("requires a description and a positive quantity", () => {
    const result = quotationLineItemSchema.safeParse({
      ...baseLineItem,
      description: "",
      quantity: "0",
      discountType: "percentage",
      discountValue: "0",
    });
    expect(result.success).toBe(false);
  });
});

describe("quotationDiscountSchema", () => {
  it("parses a document-level percentage discount with its target", () => {
    const result = quotationDiscountSchema.safeParse({
      discountType: "percentage",
      discountValue: "5",
      discountTarget: "net_amount",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountValue).toBe(5);
      expect(result.data.discountTarget).toBe("net_amount");
    }
  });
});
