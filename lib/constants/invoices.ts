export const INVOICE_STATUSES = ["draft", "pending", "partially_paid", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  partially_paid: "Partially Paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const DISCOUNT_TARGETS = ["unit_price", "price_with_tax", "net_amount", "total"] as const;
export type DiscountTarget = (typeof DISCOUNT_TARGETS)[number];

export const DISCOUNT_TARGET_LABELS: Record<DiscountTarget, string> = {
  unit_price: "Unit Price",
  price_with_tax: "Price With Tax",
  net_amount: "Net Amount",
  total: "Total",
};
