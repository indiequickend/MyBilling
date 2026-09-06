import { z } from "zod";
import { DISCOUNT_TARGETS } from "@/lib/constants/invoices";
import { PAYMENT_MODES } from "@/lib/constants/payments";
import {
  objectId,
  optionalTrimmed,
  rupeesToMinorUnits,
  optionalRupeesToMinorUnits,
  normalizeDiscountValue,
  gstinSchema,
} from "@/lib/validation/shared";
import { parseSerialNumbersText } from "@/lib/validation/inventory";

const optionalObjectId = objectId.optional().or(z.literal("").transform(() => undefined));

const rawInvoiceLineItemSchema = z.object({
  productId: optionalObjectId,
  variantId: optionalObjectId,
  description: z.string().trim().min(1, "Description is required").max(500),
  notes: optionalTrimmed(2000),
  hsnOrSac: optionalTrimmed(20),
  unit: optionalTrimmed(20),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unitPriceMinor: rupeesToMinorUnits,
  discountType: z.enum(["amount", "percentage"]),
  discountValue: z.union([z.string(), z.number()]),
  taxRatePercent: z.coerce.number().min(0).max(100),
  // Stock-tracked products only — see lib/db/queries/stockLedger.ts's writeDocumentStockMovements.
  warehouseId: optionalObjectId,
  batchId: optionalObjectId,
  serialNumbersText: optionalTrimmed(5000),
});

export const invoiceLineItemSchema = rawInvoiceLineItemSchema.transform((val, ctx) => {
  const { serialNumbersText, ...rest } = val;
  const serialNumbers = serialNumbersText ? parseSerialNumbersText(serialNumbersText) : undefined;
  return {
    ...rest,
    discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
    serialNumbers,
  };
});
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>;

export const invoiceLineItemsSchema = z.array(invoiceLineItemSchema).min(1, "Add at least one line item");

const rawInvoiceDiscountSchema = z.object({
  discountType: z.enum(["amount", "percentage"]),
  discountValue: z.union([z.string(), z.number()]),
  discountTarget: z.enum(DISCOUNT_TARGETS),
});

export const invoiceDiscountSchema = rawInvoiceDiscountSchema.transform((val, ctx) => ({
  ...val,
  discountValue: normalizeDiscountValue(val.discountType, val.discountValue, ctx),
}));
export type InvoiceDiscountInput = z.infer<typeof invoiceDiscountSchema>;

const rawInvoiceHeaderSchema = z.object({
  customerId: objectId,
  invoiceDate: z.string().trim().min(1, "Invoice date is required"),
  dueDate: optionalTrimmed(30),
  referenceNumber: optionalTrimmed(100),
  placeOfSupplyState: z.string().trim().min(1, "Place of supply is required").max(100),
  reverseCharge: z.boolean(),
  roundOff: z.boolean(),
  notes: optionalTrimmed(2000),
  terms: optionalTrimmed(2000),
  noteTemplateId: optionalObjectId,
  termTemplateId: optionalObjectId,
  signatureId: optionalObjectId,
  bankAccountId: optionalObjectId,
  projectId: optionalObjectId,
  // TCS (Tax Collected at Source) this invoice collects from the customer — informational/report
  // field only, never added into the invoice's grandTotalMinor. See Invoice.ts's doc-comment.
  tcsApplicable: z.boolean(),
  tcsSectionCode: optionalTrimmed(30),
  tcsRatePercent: z.coerce.number().min(0).max(100).optional(),
  tcsAmountMinor: optionalRupeesToMinorUnits,
});

export const invoiceHeaderSchema = rawInvoiceHeaderSchema.superRefine((val, ctx) => {
  if (val.tcsApplicable && !val.tcsAmountMinor) {
    ctx.addIssue({ code: "custom", message: "Enter the TCS amount collected", path: ["tcsAmountMinor"] });
  }
});
export type InvoiceHeaderInput = z.infer<typeof invoiceHeaderSchema>;

export const invoicePaymentSplitSchema = z.object({
  amountMinor: rupeesToMinorUnits,
  mode: z.enum(PAYMENT_MODES),
  bankAccountId: objectId,
  paymentDate: z.string().trim().min(1, "Payment date is required"),
  referenceNote: optionalTrimmed(200),
});
export type InvoicePaymentSplitInput = z.infer<typeof invoicePaymentSplitSchema>;

export function invoicePaymentSplitsSchema(maxTotalMinor: number) {
  return z.array(invoicePaymentSplitSchema).superRefine((splits, ctx) => {
    const sum = splits.reduce((total, s) => total + s.amountMinor, 0);
    if (sum > maxTotalMinor) {
      ctx.addIssue({
        code: "custom",
        message: "Payments recorded exceed the invoice total",
        path: [],
      });
    }
  });
}

export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  customerId: objectId.optional().or(z.literal("").transform(() => undefined)),
  projectId: objectId.optional().or(z.literal("").transform(() => undefined)),
  tab: z.enum(["all", "draft", "pending", "partially_paid", "paid", "cancelled", "deleted"]).default("all"),
  dateFrom: optionalTrimmed(30),
  dateTo: optionalTrimmed(30),
  page: z.coerce.number().int().min(1).default(1),
});

/** One payment entry on a bulk-imported invoice — a raw CSV line's payment columns, already
 * merged into a group by `groupInvoiceCsvRows`. */
export const invoiceImportPaymentRowSchema = z.object({
  amountMinor: rupeesToMinorUnits,
  // Case-insensitive for the same reason lib/validation/products.ts's `type` column is: a
  // spreadsheet/export is just as likely to write "Cash" or "UPI" as the exact lowercase value.
  mode: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.enum(PAYMENT_MODES),
  ),
  date: z.string().trim().min(1, "Payment date is required"),
  bankAccountNumber: optionalTrimmed(50),
  bankIfsc: optionalTrimmed(20),
  bankName: optionalTrimmed(200),
  referenceNote: optionalTrimmed(200),
});
export type InvoiceImportPaymentInput = z.infer<typeof invoiceImportPaymentRowSchema>;

/**
 * One *grouped* invoice for the bulk-upload format — the output of `groupInvoiceCsvRows`, not a
 * raw CSV line (one invoice can span several lines, one per payment; see that function's
 * doc-comment). `subtotalMinor`/`discountAmountMinor`/`totalTaxMinor`/`grandTotalMinor` are stored
 * on the Invoice exactly as given (see importInvoice in lib/db/queries/invoices.ts) rather than
 * recomputed, so a migrated invoice's totals always match the system it came from.
 */
export const invoiceGroupRowSchema = z.object({
  docNumber: z.string().trim().min(1, "Invoice number is required").max(100),
  invoiceDate: z.string().trim().min(1, "Invoice date is required"),
  dueDate: optionalTrimmed(30),
  customerName: z.string().trim().min(1, "Customer name is required").max(200),
  customerPhone: optionalTrimmed(20),
  customerGstin: gstinSchema,
  placeOfSupplyState: optionalTrimmed(100),
  referenceNumber: optionalTrimmed(100),
  notes: optionalTrimmed(2000),
  // A higher ceiling than the manual invoice form's own notes/terms fields (also 2000, see
  // rawInvoiceHeaderSchema above): migrated terms text is typically copied wholesale from
  // whatever system the invoice is coming from, so it's more likely to be long boilerplate than
  // something someone hand-types into a form.
  terms: optionalTrimmed(5000),
  lineItemDescription: optionalTrimmed(500),
  subtotalMinor: rupeesToMinorUnits,
  discountAmountMinor: optionalRupeesToMinorUnits.transform((v) => v ?? 0),
  taxAmountMinor: optionalRupeesToMinorUnits.transform((v) => v ?? 0),
  totalAmountMinor: rupeesToMinorUnits,
  payments: z.array(invoiceImportPaymentRowSchema).max(200).default([]),
});
export type InvoiceGroupRowInput = z.infer<typeof invoiceGroupRowSchema>;

/** Raw (pre-validation) shape of one grouped invoice, produced by `groupInvoiceCsvRows` and fed
 * into `invoiceGroupRowSchema.safeParse`. Every field is a raw string, "" meaning "no row in this
 * group set it" — same convention as lib/validation/products.ts's ProductCsvRawGroup. */
export type InvoiceCsvRawGroup = {
  rowNumber: number;
  docNumber: string;
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  customerPhone: string;
  customerGstin: string;
  placeOfSupplyState: string;
  referenceNumber: string;
  notes: string;
  terms: string;
  lineItemDescription: string;
  subtotalMinor: string;
  discountAmountMinor: string;
  taxAmountMinor: string;
  totalAmountMinor: string;
  payments: Array<{
    amountMinor: string;
    mode: string;
    date: string;
    bankAccountNumber: string;
    bankIfsc: string;
    bankName: string;
    referenceNote: string;
  }>;
};

const INVOICE_LEVEL_CSV_COLUMNS = [
  "invoiceDate",
  "dueDate",
  "customerName",
  "customerPhone",
  "customerGstin",
  "placeOfSupplyState",
  "referenceNumber",
  "notes",
  "terms",
  "lineItemDescription",
  "subtotalMinor",
  "discountAmountMinor",
  "taxAmountMinor",
  "totalAmountMinor",
] as const;

/**
 * Groups raw invoice bulk-upload CSV lines into one entry per invoice, keyed by `docNumber` —
 * the same "shared key groups rows into one record" technique as
 * lib/validation/products.ts's groupProductCsvRows, applied here because one invoice can have
 * several payments (Swipe-style partial-payment history) the same way one product can have
 * several variants. A line with a filled-in `paymentAmountMinor` cell contributes one payment;
 * invoice-level columns are taken from the first line in the group where that column is
 * non-blank, so they only need to be filled in once per invoice.
 */
export function groupInvoiceCsvRows(rows: Record<string, string>[]): InvoiceCsvRawGroup[] {
  const groups = new Map<string, InvoiceCsvRawGroup>();
  const filledColumns = new Map<string, Set<string>>();
  const order: string[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const docNumber = (row.docNumber ?? "").trim();
    const key = docNumber ? docNumber.toLowerCase() : `__unnumbered_${rowNumber}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        rowNumber,
        docNumber,
        invoiceDate: "",
        dueDate: "",
        customerName: "",
        customerPhone: "",
        customerGstin: "",
        placeOfSupplyState: "",
        referenceNumber: "",
        notes: "",
        terms: "",
        lineItemDescription: "",
        subtotalMinor: "",
        discountAmountMinor: "",
        taxAmountMinor: "",
        totalAmountMinor: "",
        payments: [],
      };
      groups.set(key, group);
      filledColumns.set(key, new Set());
      order.push(key);
    }
    const filled = filledColumns.get(key)!;

    for (const col of INVOICE_LEVEL_CSV_COLUMNS) {
      const value = row[col]?.trim();
      if (value && !filled.has(col)) {
        group[col] = value;
        filled.add(col);
      }
    }

    const paymentAmount = row.paymentAmountMinor?.trim();
    if (paymentAmount) {
      group.payments.push({
        amountMinor: paymentAmount,
        mode: row.paymentMode?.trim() ?? "",
        date: row.paymentDate?.trim() ?? "",
        bankAccountNumber: row.paymentBankAccountNumber?.trim() ?? "",
        bankIfsc: row.paymentBankIfsc?.trim() ?? "",
        bankName: row.paymentBankName?.trim() ?? "",
        referenceNote: row.paymentReferenceNote?.trim() ?? "",
      });
    }
  });

  return order.map((key) => groups.get(key)!);
}
