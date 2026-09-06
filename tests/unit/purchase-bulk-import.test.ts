import { describe, expect, it } from "vitest";
import { groupPurchaseCsvRows, purchaseGroupRowSchema } from "@/lib/validation/purchases";

describe("groupPurchaseCsvRows", () => {
  it("combines rows sharing a docNumber into one purchase with one payment per row", () => {
    const rows: Record<string, string>[] = [
      {
        docNumber: "PUR/2026-27/49",
        purchaseDate: "22-07-2026",
        vendorName: "Siddhi Tours and Travels",
        subtotalMinor: "9000.00",
        totalAmountMinor: "9000.00",
        paymentAmountMinor: "1000.00",
        paymentMode: "upi",
        paymentDate: "13-06-2026",
      },
      {
        docNumber: "PUR/2026-27/49",
        paymentAmountMinor: "8000.00",
        paymentMode: "cash",
        paymentDate: "22-07-2026",
      },
    ];

    const groups = groupPurchaseCsvRows(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].docNumber).toBe("PUR/2026-27/49");
    expect(groups[0].payments).toHaveLength(2);
    expect(groups[0].payments.map((p) => p.mode)).toEqual(["upi", "cash"]);
  });

  it("keeps rows with different docNumbers as separate purchases", () => {
    const rows: Record<string, string>[] = [
      { docNumber: "PUR/1", purchaseDate: "01-01-2026", vendorName: "A", subtotalMinor: "100.00", totalAmountMinor: "100.00" },
      { docNumber: "PUR/2", purchaseDate: "02-01-2026", vendorName: "B", subtotalMinor: "200.00", totalAmountMinor: "200.00" },
    ];

    const groups = groupPurchaseCsvRows(rows);

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.payments.length === 0)).toBe(true);
  });
});

describe("groupPurchaseCsvRows -> purchaseGroupRowSchema (end to end)", () => {
  it("a CSV with several payment rows for one purchase validates as a single purchase with all payments", () => {
    const rows: Record<string, string>[] = [
      {
        docNumber: "PUR/2026-27/43",
        purchaseDate: "12-06-2026",
        vendorName: "Manoj car sikkim",
        subtotalMinor: "51000.00",
        totalAmountMinor: "51000.00",
        paymentAmountMinor: "2000.00",
        paymentMode: "UPI",
        paymentDate: "21-05-2026",
      },
      {
        docNumber: "PUR/2026-27/43",
        paymentAmountMinor: "49000.00",
        paymentMode: "UPI",
        paymentDate: "13-06-2026",
        paymentBankAccountNumber: "43001997989",
      },
    ];

    const groups = groupPurchaseCsvRows(rows);
    expect(groups).toHaveLength(1);

    const parsed = purchaseGroupRowSchema.safeParse(groups[0]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.totalAmountMinor).toBe(5100000);
      expect(parsed.data.payments).toHaveLength(2);
      expect(parsed.data.payments.every((p) => p.mode === "upi")).toBe(true);
    }
  });
});

describe("purchaseGroupRowSchema", () => {
  it("rejects a purchase with no vendor name", () => {
    const result = purchaseGroupRowSchema.safeParse({
      docNumber: "PUR/1",
      purchaseDate: "01-01-2026",
      vendorName: "",
      subtotalMinor: "100.00",
      totalAmountMinor: "100.00",
    });
    expect(result.success).toBe(false);
  });

  it("defaults discountAmountMinor and taxAmountMinor to 0 when blank", () => {
    const result = purchaseGroupRowSchema.safeParse({
      docNumber: "PUR/1",
      purchaseDate: "01-01-2026",
      vendorName: "A",
      subtotalMinor: "100.00",
      totalAmountMinor: "100.00",
      discountAmountMinor: "",
      taxAmountMinor: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountAmountMinor).toBe(0);
      expect(result.data.taxAmountMinor).toBe(0);
    }
  });
});
