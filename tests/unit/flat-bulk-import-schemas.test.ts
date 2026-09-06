import { describe, expect, it } from "vitest";
import { purchaseOrderRowSchema } from "@/lib/validation/purchaseOrders";
import { proformaInvoiceRowSchema } from "@/lib/validation/proformaInvoices";
import { paymentImportRowSchema } from "@/lib/validation/payments";

describe("purchaseOrderRowSchema", () => {
  it("accepts a row with only the required columns present (optional columns entirely absent)", () => {
    const result = purchaseOrderRowSchema.safeParse({
      docNumber: "PO/2026-27/22",
      orderDate: "19-08-2026",
      vendorName: "Siddhi Tours and Travels",
      subtotalMinor: "6400.00",
      totalAmountMinor: "6400.00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountAmountMinor).toBe(0);
      expect(result.data.taxAmountMinor).toBe(0);
      expect(result.data.expectedDeliveryDate).toBeUndefined();
    }
  });

  it("rejects a missing vendor name", () => {
    const result = purchaseOrderRowSchema.safeParse({
      docNumber: "PO/1",
      orderDate: "19-08-2026",
      vendorName: "",
      subtotalMinor: "100.00",
      totalAmountMinor: "100.00",
    });
    expect(result.success).toBe(false);
  });
});

describe("proformaInvoiceRowSchema", () => {
  it("accepts a row with only the required columns present", () => {
    const result = proformaInvoiceRowSchema.safeParse({
      docNumber: "PRE/26-27/23",
      proformaDate: "24-08-2026",
      customerName: "Sanjay Karmakar",
      subtotalMinor: "64000.00",
      totalAmountMinor: "64000.00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing customer name", () => {
    const result = proformaInvoiceRowSchema.safeParse({
      docNumber: "PRE/1",
      proformaDate: "24-08-2026",
      customerName: "",
      subtotalMinor: "100.00",
      totalAmountMinor: "100.00",
    });
    expect(result.success).toBe(false);
  });
});

describe("paymentImportRowSchema", () => {
  it("accepts a payment with no party (e.g. an expense payment)", () => {
    const result = paymentImportRowSchema.safeParse({
      voucherNumber: "PAY-0001",
      direction: "out",
      amountMinor: "2000.00",
      mode: "UPI",
      paymentDate: "06-09-2026",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("upi");
      expect(result.data.partyType).toBeUndefined();
    }
  });

  it("accepts a party payment and normalizes partyType/direction/mode case", () => {
    const result = paymentImportRowSchema.safeParse({
      voucherNumber: "PAY-0002",
      direction: "OUT",
      partyType: "vendor",
      partyName: "Norden Lepcha",
      amountMinor: "2000.00",
      mode: "Cash",
      paymentDate: "16-06-2026",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.direction).toBe("out");
      expect(result.data.mode).toBe("cash");
    }
  });

  it("maps a 'Net Banking' mode to bank_transfer", () => {
    const result = paymentImportRowSchema.safeParse({
      voucherNumber: "PAY-0003",
      direction: "in",
      amountMinor: "1000.00",
      mode: "Net Banking",
      paymentDate: "06-09-2026",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mode).toBe("bank_transfer");
  });

  it("rejects a party payment missing the party name", () => {
    const result = paymentImportRowSchema.safeParse({
      voucherNumber: "PAY-0004",
      direction: "in",
      partyType: "customer",
      amountMinor: "1000.00",
      mode: "upi",
      paymentDate: "06-09-2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing voucher number", () => {
    const result = paymentImportRowSchema.safeParse({
      voucherNumber: "",
      direction: "in",
      amountMinor: "1000.00",
      mode: "upi",
      paymentDate: "06-09-2026",
    });
    expect(result.success).toBe(false);
  });
});
