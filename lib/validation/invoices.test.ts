import { describe, expect, it } from "vitest";
import {
  invoiceLineItemSchema,
  invoiceDiscountSchema,
  invoicePaymentSplitsSchema,
} from "@/lib/validation/invoices";

const baseLineItem = {
  description: "Widget",
  quantity: "2",
  unitPriceMinor: "100.00",
  taxRatePercent: "18",
};

describe("invoiceLineItemSchema", () => {
  it("normalizes a percentage discount to a raw 0-100 number", () => {
    const result = invoiceLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "percentage",
      discountValue: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discountValue).toBe(10);
  });

  it("normalizes an amount discount to minor units", () => {
    const result = invoiceLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "amount",
      discountValue: "50.00",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discountValue).toBe(5_000);
  });

  it("rejects a percentage discount over 100", () => {
    const result = invoiceLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "percentage",
      discountValue: "150",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed amount discount", () => {
    const result = invoiceLineItemSchema.safeParse({
      ...baseLineItem,
      discountType: "amount",
      discountValue: "not-a-number",
    });
    expect(result.success).toBe(false);
  });

  it("requires a description and a positive quantity", () => {
    const result = invoiceLineItemSchema.safeParse({
      ...baseLineItem,
      description: "",
      quantity: "0",
      discountType: "percentage",
      discountValue: "0",
    });
    expect(result.success).toBe(false);
  });
});

describe("invoiceDiscountSchema", () => {
  it("parses a document-level percentage discount with its target", () => {
    const result = invoiceDiscountSchema.safeParse({
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

describe("invoicePaymentSplitsSchema", () => {
  const split = (amountMinor: string) => ({
    amountMinor,
    mode: "cash" as const,
    bankAccountId: "507f1f77bcf86cd799439011",
    paymentDate: "2026-01-01",
  });

  it("accepts splits that sum to at most the invoice total", () => {
    const result = invoicePaymentSplitsSchema(10_000).safeParse([split("40.00"), split("60.00")]);
    expect(result.success).toBe(true);
  });

  it("rejects splits that sum to more than the invoice total", () => {
    const result = invoicePaymentSplitsSchema(10_000).safeParse([split("60.00"), split("60.00")]);
    expect(result.success).toBe(false);
  });
});
