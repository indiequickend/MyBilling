export const INVOICE_STATUSES = ["draft", "pending", "partially_paid", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  partially_paid: "Partially Paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const INVOICE_STATUS_BADGE_VARIANT: Record<
  InvoiceStatus,
  "success" | "warning" | "danger" | "outline"
> = {
  draft: "outline",
  pending: "warning",
  partially_paid: "warning",
  paid: "success",
  cancelled: "danger",
};

/**
 * "Overdue" isn't a persisted status — it's computed for display only, so it
 * never touches the stored InvoiceStatus enum/schema. A pending/partially-paid
 * invoice past its due date reads as overdue everywhere its status is shown.
 */
export function resolveInvoiceStatusDisplay(
  status: InvoiceStatus,
  dueDate: Date | string | null | undefined,
): { label: string; variant: "success" | "warning" | "danger" | "outline" } {
  const isOverdue =
    (status === "pending" || status === "partially_paid") &&
    dueDate != null &&
    new Date(dueDate).getTime() < Date.now();

  if (isOverdue) {
    return { label: "Overdue", variant: "danger" };
  }
  return { label: INVOICE_STATUS_LABELS[status], variant: INVOICE_STATUS_BADGE_VARIANT[status] };
}

export const DISCOUNT_TARGETS = ["unit_price", "price_with_tax", "net_amount", "total"] as const;
export type DiscountTarget = (typeof DISCOUNT_TARGETS)[number];

export const DISCOUNT_TARGET_LABELS: Record<DiscountTarget, string> = {
  unit_price: "Unit Price",
  price_with_tax: "Price With Tax",
  net_amount: "Net Amount",
  total: "Total",
};
