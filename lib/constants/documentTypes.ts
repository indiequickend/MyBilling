// Every document type this app will eventually number/template. Only "invoice" is actually
// wired up in Phase 3 — the rest are listed now so DocumentSequence/NoteTermTemplate don't need
// a shape change when Phase 4/5 add Purchases/Quotations/etc.
export const DOCUMENT_TYPES = [
  "invoice",
  "credit_note",
  "purchase",
  "purchase_order",
  "debit_note",
  "quotation",
  "sales_order",
  "proforma_invoice",
  "journal",
  "payment",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice: "Invoice",
  credit_note: "Credit Note",
  purchase: "Purchase",
  purchase_order: "Purchase Order",
  debit_note: "Debit Note",
  quotation: "Quotation",
  sales_order: "Sales Order",
  proforma_invoice: "Proforma Invoice",
  journal: "Journal",
  payment: "Payment Receipt",
};
