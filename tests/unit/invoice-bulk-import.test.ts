import { describe, expect, it } from "vitest";
import { groupInvoiceCsvRows, invoiceGroupRowSchema } from "@/lib/validation/invoices";
import { parseCsvDate } from "@/lib/validation/shared";

describe("parseCsvDate", () => {
  it("parses an unambiguous DD-MM-YYYY date (day > 12)", () => {
    const date = parseCsvDate("21-07-2026");
    expect(date?.toISOString().slice(0, 10)).toBe("2026-07-21");
  });

  it("parses an ambiguous-looking DD-MM-YYYY date (day <= 12) as DD-MM, not MM-DD", () => {
    // Regression: new Date("01-04-2026") parses as April 1 (US-style MM-DD) instead of the
    // intended January 4 — exactly the silent corruption this function exists to prevent.
    const date = parseCsvDate("04-01-2026");
    expect(date?.toISOString().slice(0, 10)).toBe("2026-01-04");
  });

  it("falls back to ISO YYYY-MM-DD", () => {
    const date = parseCsvDate("2026-07-21");
    expect(date?.toISOString().slice(0, 10)).toBe("2026-07-21");
  });

  it("rejects an out-of-range day for its month instead of rolling over", () => {
    expect(parseCsvDate("31-02-2026")).toBeUndefined(); // February has no 31st
    expect(parseCsvDate("32-01-2026")).toBeUndefined();
  });

  it("rejects garbage input", () => {
    expect(parseCsvDate("not-a-date")).toBeUndefined();
    expect(parseCsvDate("")).toBeUndefined();
  });
});

describe("groupInvoiceCsvRows", () => {
  it("combines rows sharing a docNumber into one invoice with one payment per row", () => {
    const rows: Record<string, string>[] = [
      {
        docNumber: "INV/26-27/12",
        invoiceDate: "2026-06-16",
        customerName: "Subhajit Sinha",
        subtotalMinor: "26300.00",
        taxAmountMinor: "1315.00",
        totalAmountMinor: "27600.00",
        discountAmountMinor: "15.00",
        paymentAmountMinor: "2000.00",
        paymentMode: "cash",
        paymentDate: "2026-06-16",
      },
      {
        docNumber: "INV/26-27/12",
        paymentAmountMinor: "5000.00",
        paymentMode: "upi",
        paymentDate: "2026-05-17",
        paymentBankAccountNumber: "43001997989",
        paymentBankIfsc: "SBIN0002078",
      },
      {
        docNumber: "INV/26-27/12",
        paymentAmountMinor: "5600.00",
        paymentMode: "upi",
        paymentDate: "2026-06-19",
        paymentBankAccountNumber: "43001997989",
        paymentBankIfsc: "SBIN0002078",
      },
    ];

    const groups = groupInvoiceCsvRows(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].docNumber).toBe("INV/26-27/12");
    expect(groups[0].totalAmountMinor).toBe("27600.00"); // picked up from the first row that set it
    expect(groups[0].payments).toHaveLength(3);
    expect(groups[0].payments.map((p) => p.amountMinor)).toEqual(["2000.00", "5000.00", "5600.00"]);
  });

  it("keeps rows with different docNumbers as separate invoices", () => {
    const rows: Record<string, string>[] = [
      { docNumber: "INV/1", invoiceDate: "2026-01-01", customerName: "A", subtotalMinor: "100.00", totalAmountMinor: "100.00" },
      { docNumber: "INV/2", invoiceDate: "2026-01-02", customerName: "B", subtotalMinor: "200.00", totalAmountMinor: "200.00" },
    ];

    const groups = groupInvoiceCsvRows(rows);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.docNumber)).toEqual(["INV/1", "INV/2"]);
    expect(groups.every((g) => g.payments.length === 0)).toBe(true);
  });

  it("groups by docNumber case-insensitively and never merges blank-numbered rows", () => {
    const rows: Record<string, string>[] = [
      { docNumber: "inv-1", paymentAmountMinor: "10.00" },
      { docNumber: "INV-1", paymentAmountMinor: "20.00" },
      { docNumber: "", paymentAmountMinor: "" },
      { docNumber: "", paymentAmountMinor: "" },
    ];

    const groups = groupInvoiceCsvRows(rows);

    const inv1 = groups.find((g) => g.docNumber === "inv-1");
    expect(inv1?.payments.map((p) => p.amountMinor)).toEqual(["10.00", "20.00"]);

    const unnumbered = groups.filter((g) => g.docNumber === "");
    expect(unnumbered).toHaveLength(2);
  });
});

describe("groupInvoiceCsvRows -> invoiceGroupRowSchema (end to end)", () => {
  it("a CSV with several payment rows for one invoice validates as a single invoice with all payments, not several invoices", () => {
    const rows: Record<string, string>[] = [
      {
        docNumber: "INV/26-27/12",
        invoiceDate: "2026-06-16",
        customerName: "Subhajit Sinha",
        subtotalMinor: "26300.00",
        taxAmountMinor: "1315.00",
        discountAmountMinor: "15.00",
        totalAmountMinor: "27600.00",
        paymentAmountMinor: "2000.00",
        paymentMode: "Cash",
        paymentDate: "2026-06-16",
      },
      {
        docNumber: "INV/26-27/12",
        paymentAmountMinor: "25600.00",
        paymentMode: "UPI",
        paymentDate: "2026-06-19",
        paymentBankAccountNumber: "43001997989",
      },
    ];

    const groups = groupInvoiceCsvRows(rows);
    expect(groups).toHaveLength(1);

    const parsed = invoiceGroupRowSchema.safeParse(groups[0]);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.docNumber).toBe("INV/26-27/12");
      expect(parsed.data.subtotalMinor).toBe(2630000);
      expect(parsed.data.totalAmountMinor).toBe(2760000);
      expect(parsed.data.payments).toHaveLength(2);
      expect(parsed.data.payments.map((p) => p.mode)).toEqual(["cash", "upi"]);
      expect(parsed.data.payments.map((p) => p.amountMinor)).toEqual([200000, 2560000]);
    }
  });
});

describe("invoiceGroupRowSchema", () => {
  it("rejects an invoice with no docNumber", () => {
    const result = invoiceGroupRowSchema.safeParse({
      docNumber: "",
      invoiceDate: "2026-01-01",
      customerName: "A",
      subtotalMinor: "100.00",
      totalAmountMinor: "100.00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invoice with no customer name", () => {
    const result = invoiceGroupRowSchema.safeParse({
      docNumber: "INV/1",
      invoiceDate: "2026-01-01",
      customerName: "",
      subtotalMinor: "100.00",
      totalAmountMinor: "100.00",
    });
    expect(result.success).toBe(false);
  });

  it("defaults discountAmountMinor and taxAmountMinor to 0 when blank", () => {
    const result = invoiceGroupRowSchema.safeParse({
      docNumber: "INV/1",
      invoiceDate: "2026-01-01",
      customerName: "A",
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

  it("rejects an unrecognized payment mode", () => {
    const result = invoiceGroupRowSchema.safeParse({
      docNumber: "INV/1",
      invoiceDate: "2026-01-01",
      customerName: "A",
      subtotalMinor: "100.00",
      totalAmountMinor: "100.00",
      payments: [{ amountMinor: "100.00", mode: "bitcoin", date: "2026-01-01" }],
    });
    expect(result.success).toBe(false);
  });
});
