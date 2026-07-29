/**
 * Shared payment-status list for payable/receivable document types (Invoice, Purchase, and later
 * Quotation/Sales Order/Proforma Invoice). Invoice's own status list in lib/constants/invoices.ts
 * predates this file and is left as-is to avoid a wide mechanical rename across its existing call
 * sites — this is the home for every document type after it.
 */
export const DOCUMENT_STATUSES = ["draft", "pending", "partially_paid", "paid", "cancelled"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  partially_paid: "Partially Paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const DOCUMENT_STATUS_BADGE_VARIANT: Record<
  DocumentStatus,
  "success" | "warning" | "danger" | "outline"
> = {
  draft: "outline",
  pending: "warning",
  partially_paid: "warning",
  paid: "success",
  cancelled: "danger",
};
