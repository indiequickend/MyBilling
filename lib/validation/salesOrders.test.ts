import { describe, expect, it } from "vitest";
import { salesOrderLineItemSchema, salesOrderDiscountSchema } from "@/lib/validation/salesOrders";

const baseLineItem = {
  description: "Widget",
  quantity: "2",
  unitPriceMinor: "100.00",
  taxRatePercent: "18",
};

describe("salesOrderLineItemSchema", () => {
  it("normalizes a percentage discount to a raw 0-100 number", () => {
    const result = salesOrderLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "percentage",
      discountValue: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discountValue).toBe(10);
  });

  it("normalizes an amount discount to minor units", () => {
    const result = salesOrderLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "amount",
      discountValue: "50.00",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discountValue).toBe(5_000);
  });

  it("rejects a percentage discount over 100", () => {
    const result = salesOrderLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "percentage",
      discountValue: "150",
    });
    expect(result.success).toBe(false);
  });

  it("requires a description and a positive quantity", () => {
    const result = salesOrderLineItemSchema.safeParse({
      ...baseLineItem,
      description: "",
      quantity: "0",
      discountType: "percentage",
      discountValue: "0",
    });
    expect(result.success).toBe(false);
  });
});

describe("salesOrderDiscountSchema", () => {
  it("parses a document-level percentage discount with its target", () => {
    const result = salesOrderDiscountSchema.safeParse({
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
