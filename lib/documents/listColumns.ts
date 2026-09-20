import { formatDate } from "@/lib/utils/date";
import { minorToRupeesString } from "@/lib/utils/money";

/**
 * Column + search-field registry shared by the six document list pages (Invoices, Proforma
 * Invoices, Quotations, Sales Orders, Purchase Orders, Purchases). Built-in columns are declared
 * once per document type; each business's per-document custom fields are appended as `cf:<key>`
 * columns. A column that has a `searchPath` is also selectable as a search field.
 *
 * Pure, no I/O — importable from both server pages and client components.
 */

export type ListDocType =
  | "invoice"
  | "proforma_invoice"
  | "quotation"
  | "sales_order"
  | "purchase_order"
  | "purchase";

export type ListColumnDef = {
  id: string;
  label: string;
  align?: "right";
  defaultVisible: boolean;
  /** Mongo path searched (case-insensitive substring) when this field is ticked in "Search in". */
  searchPath?: string;
  /** Searched by default when the user hasn't picked search fields. */
  defaultSearch?: boolean;
};

export type CustomFieldDefLike = { key: string; label: string; type?: string };

/** Structural subset of every list document — all optional so any of the six models fits. */
export type ListDocLike = {
  docNumber?: string | null;
  referenceNumber?: string | null;
  vendorInvoiceNumber?: string | null;
  placeOfSupplyState?: string | null;
  reverseCharge?: boolean | null;
  notes?: string | null;
  terms?: string | null;
  customerSnapshot?: { displayName?: string | null; gstin?: string | null } | null;
  vendorSnapshot?: { displayName?: string | null; gstin?: string | null } | null;
  subtotalMinor?: number | null;
  totalTaxMinor?: number | null;
  discountAmountMinor?: number | null;
  roundOffAmountMinor?: number | null;
  grandTotalMinor?: number | null;
  amountPaidMinor?: number | null;
  tcsAmountMinor?: number | null;
  tdsAmountMinor?: number | null;
  createdAt?: Date | string | null;
  customFieldValues?: Record<string, unknown> | null;
};

type Party = "customer" | "vendor";

type DocTypeConfig = {
  party: Party;
  /** Extra built-in columns beyond the common set, in display order (inserted after "date"). */
  dateField: string;
  dateLabel: string;
  extraDates: { id: string; label: string }[];
  hasPaid: boolean;
  hasVendorInvoiceNumber?: boolean;
  hasTcs?: boolean;
  hasTds?: boolean;
  partyLabel: string;
};

const CONFIG: Record<ListDocType, DocTypeConfig> = {
  invoice: {
    party: "customer",
    partyLabel: "Customer",
    dateField: "invoiceDate",
    dateLabel: "Date",
    extraDates: [{ id: "dueDate", label: "Due date" }],
    hasPaid: true,
    hasTcs: true,
  },
  proforma_invoice: {
    party: "customer",
    partyLabel: "Customer",
    dateField: "proformaDate",
    dateLabel: "Date",
    extraDates: [{ id: "dueDate", label: "Due date" }],
    hasPaid: false,
  },
  quotation: {
    party: "customer",
    partyLabel: "Customer",
    dateField: "quotationDate",
    dateLabel: "Date",
    extraDates: [{ id: "validUntil", label: "Valid until" }],
    hasPaid: false,
  },
  sales_order: {
    party: "customer",
    partyLabel: "Customer",
    dateField: "orderDate",
    dateLabel: "Date",
    extraDates: [{ id: "expectedDeliveryDate", label: "Expected delivery" }],
    hasPaid: false,
  },
  purchase_order: {
    party: "vendor",
    partyLabel: "Vendor",
    dateField: "orderDate",
    dateLabel: "Date",
    extraDates: [{ id: "expectedDeliveryDate", label: "Expected delivery" }],
    hasPaid: false,
  },
  purchase: {
    party: "vendor",
    partyLabel: "Vendor",
    dateField: "purchaseDate",
    dateLabel: "Date",
    extraDates: [{ id: "dueDate", label: "Due date" }],
    hasPaid: true,
    hasVendorInvoiceNumber: true,
    hasTcs: true,
    hasTds: true,
  },
};

export const DOC_NUMBER_LABELS: Record<ListDocType, string> = {
  invoice: "Invoice #",
  proforma_invoice: "Proforma #",
  quotation: "Quotation #",
  sales_order: "Order #",
  purchase_order: "Order #",
  purchase: "Purchase #",
};

/** A custom field key is only ever interpolated into a Mongo path if it matches this — no dots,
 * `$`, or anything else that could address another field or inject an operator. */
const SAFE_CUSTOM_KEY = /^[A-Za-z0-9_-]{1,60}$/;

/** Custom field types stored as strings, i.e. that a regex search can match. */
const SEARCHABLE_CUSTOM_TYPES = new Set(["text", "select", "date", undefined]);

export function getListColumns(docType: ListDocType, customFieldDefs: CustomFieldDefLike[] = []): ListColumnDef[] {
  const cfg = CONFIG[docType];
  const snap = `${cfg.party}Snapshot`;
  const columns: ListColumnDef[] = [
    {
      id: "docNumber",
      label: DOC_NUMBER_LABELS[docType],
      defaultVisible: true,
      searchPath: "docNumber",
      defaultSearch: true,
    },
    { id: "date", label: cfg.dateLabel, defaultVisible: true },
    ...cfg.extraDates.map((d) => ({ id: d.id, label: d.label, defaultVisible: false })),
    {
      id: "party",
      label: cfg.partyLabel,
      defaultVisible: true,
      searchPath: `${snap}.displayName`,
      defaultSearch: true,
    },
    { id: "partyGstin", label: `${cfg.partyLabel} GSTIN`, defaultVisible: false, searchPath: `${snap}.gstin` },
    { id: "status", label: "Status", defaultVisible: true },
    {
      id: "referenceNumber",
      label: "Reference #",
      defaultVisible: false,
      searchPath: "referenceNumber",
      defaultSearch: true,
    },
    ...(cfg.hasVendorInvoiceNumber
      ? [
          {
            id: "vendorInvoiceNumber",
            label: "Vendor invoice #",
            defaultVisible: false,
            searchPath: "vendorInvoiceNumber",
            defaultSearch: true,
          },
        ]
      : []),
    { id: "placeOfSupplyState", label: "Place of supply", defaultVisible: false, searchPath: "placeOfSupplyState" },
    { id: "subtotal", label: "Subtotal", align: "right", defaultVisible: false },
    { id: "discount", label: "Discount", align: "right", defaultVisible: false },
    { id: "tax", label: "Tax", align: "right", defaultVisible: false },
    ...(cfg.hasTcs ? [{ id: "tcs", label: "TCS", align: "right" as const, defaultVisible: false }] : []),
    ...(cfg.hasTds ? [{ id: "tds", label: "TDS", align: "right" as const, defaultVisible: false }] : []),
    { id: "roundOff", label: "Round off", align: "right", defaultVisible: false },
    { id: "total", label: "Total", align: "right", defaultVisible: true },
    ...(cfg.hasPaid
      ? [
          { id: "paid", label: "Paid", align: "right" as const, defaultVisible: docType === "invoice" || docType === "purchase" },
          { id: "balance", label: "Balance", align: "right" as const, defaultVisible: false },
        ]
      : []),
    { id: "reverseCharge", label: "Reverse charge", defaultVisible: false },
    { id: "notes", label: "Notes", defaultVisible: false, searchPath: "notes" },
    { id: "terms", label: "Terms", defaultVisible: false, searchPath: "terms" },
    { id: "createdAt", label: "Created", defaultVisible: false },
  ];

  for (const def of customFieldDefs) {
    if (!SAFE_CUSTOM_KEY.test(def.key)) continue;
    columns.push({
      id: `cf:${def.key}`,
      label: def.label,
      defaultVisible: false,
      searchPath: SEARCHABLE_CUSTOM_TYPES.has(def.type) ? `customFieldValues.${def.key}` : undefined,
    });
  }
  return columns;
}

export function defaultVisibleColumnIds(columns: ListColumnDef[]): string[] {
  return columns.filter((c) => c.defaultVisible).map((c) => c.id);
}

/** Parses the repeated `qf` query param, tolerating a lone string, an array or garbage. */
export function parseSearchFieldIds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return list.filter((v): v is string => typeof v === "string" && v.length <= 80).slice(0, 40);
}

/**
 * Turns the requested search-field ids into Mongo paths. Only ids that exist in this business's
 * column registry AND have a searchPath are honoured (so a client-sent `qf` can never address an
 * arbitrary field); an empty/all-invalid request falls back to the default search fields.
 */
export function resolveSearchPaths(columns: ListColumnDef[], requestedIds: string[]): string[] {
  const requested = new Set(requestedIds);
  const chosen = columns.filter((c) => c.searchPath && requested.has(c.id));
  const source = chosen.length > 0 ? chosen : columns.filter((c) => c.searchPath && c.defaultSearch);
  return source.map((c) => c.searchPath as string);
}

export function getSearchOptions(columns: ListColumnDef[]): { id: string; label: string; defaultChecked: boolean }[] {
  return columns
    .filter((c) => c.searchPath)
    .map((c) => ({ id: c.id, label: c.label, defaultChecked: Boolean(c.defaultSearch) }));
}

const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "" : `₹${minorToRupeesString(minor)}`;

/** Reads a document-type-specific date field (invoiceDate, validUntil, ...) by name. */
const rawField = (doc: ListDocLike, field: string): unknown => (doc as Record<string, unknown>)[field];

const dateText = (v: unknown) => (v ? formatDate(v as Date | string) : "");

/** Plain-text cell value for every column except "status" (rendered by the page as a stamp).
 * Returns "" for a column the document type doesn't have. */
export function getCellText(
  docType: ListDocType,
  columnId: string,
  doc: ListDocLike,
  customFieldDefs: CustomFieldDefLike[] = [],
): string {
  const cfg = CONFIG[docType];
  const party = cfg.party === "customer" ? doc.customerSnapshot : doc.vendorSnapshot;
  switch (columnId) {
    case "docNumber":
      return doc.docNumber ?? "Draft";
    case "date":
      return dateText(rawField(doc, cfg.dateField));
    case "party":
      return party?.displayName ?? "";
    case "partyGstin":
      return party?.gstin ?? "";
    case "referenceNumber":
      return doc.referenceNumber ?? "";
    case "vendorInvoiceNumber":
      return doc.vendorInvoiceNumber ?? "";
    case "placeOfSupplyState":
      return doc.placeOfSupplyState ?? "";
    case "subtotal":
      return money(doc.subtotalMinor);
    case "discount":
      return money(doc.discountAmountMinor);
    case "tax":
      return money(doc.totalTaxMinor);
    case "tcs":
      return money(doc.tcsAmountMinor);
    case "tds":
      return money(doc.tdsAmountMinor);
    case "roundOff":
      return money(doc.roundOffAmountMinor);
    case "total":
      return money(doc.grandTotalMinor);
    case "paid":
      return money(doc.amountPaidMinor);
    case "balance":
      return money((doc.grandTotalMinor ?? 0) - (doc.amountPaidMinor ?? 0));
    case "reverseCharge":
      return doc.reverseCharge ? "Yes" : "No";
    case "notes":
      return doc.notes ?? "";
    case "terms":
      return doc.terms ?? "";
    case "createdAt":
      return dateText(doc.createdAt);
    default:
      break;
  }
  if (columnId.startsWith("cf:")) {
    const key = columnId.slice(3);
    const raw = doc.customFieldValues?.[key];
    if (raw === undefined || raw === null || raw === "") return "";
    const def = customFieldDefs.find((d) => d.key === key);
    if (def?.type === "date" && !Number.isNaN(new Date(String(raw)).getTime())) return formatDate(String(raw));
    return String(raw);
  }
  return dateText(rawField(doc, columnId));
}

/** Cell text for every column of a row, keyed by column id (ready to serialize to the client). */
export function buildRowCells(
  docType: ListDocType,
  doc: ListDocLike,
  columns: ListColumnDef[],
  customFieldDefs: CustomFieldDefLike[] = [],
): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const c of columns) cells[c.id] = c.id === "status" ? "" : getCellText(docType, c.id, doc, customFieldDefs);
  return cells;
}
