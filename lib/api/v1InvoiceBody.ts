import { invoiceHeaderSchema, invoiceLineItemsSchema, invoiceDiscountSchema } from "@/lib/validation/invoices";
import type { InvoiceWriteInput } from "@/lib/db/queries/invoices";

/**
 * Validates the invoice header/line-items/discount part of a REST v1 request body — shared by
 * POST /api/v1/invoices (create) and PATCH /api/v1/invoices/:id (edit) so both accept the exact
 * same shape. Payments/finalize are create-only and parsed by the POST handler itself.
 */
export function parseV1InvoiceWriteBody(
  body: unknown,
  businessId: string,
): { ok: true; input: InvoiceWriteInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Invalid input" };

  const headerParsed = invoiceHeaderSchema.safeParse(body);
  if (!headerParsed.success) {
    return { ok: false, error: headerParsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const lineItemsParsed = invoiceLineItemsSchema.safeParse((body as { lineItems?: unknown }).lineItems);
  if (!lineItemsParsed.success) {
    return { ok: false, error: lineItemsParsed.error.issues[0]?.message ?? "Invalid line items" };
  }
  const discountParsed = invoiceDiscountSchema.safeParse(body);
  if (!discountParsed.success) {
    return { ok: false, error: discountParsed.error.issues[0]?.message ?? "Invalid discount" };
  }

  const h = headerParsed.data;
  return {
    ok: true,
    input: {
      businessId,
      customerId: h.customerId,
      invoiceDate: new Date(h.invoiceDate),
      dueDate: h.dueDate ? new Date(h.dueDate) : undefined,
      referenceNumber: h.referenceNumber,
      placeOfSupplyState: h.placeOfSupplyState,
      reverseCharge: h.reverseCharge,
      tcsApplicable: h.tcsApplicable,
      tcsSectionCode: h.tcsSectionCode,
      tcsRatePercent: h.tcsRatePercent,
      tcsAmountMinor: h.tcsAmountMinor,
      lineItems: lineItemsParsed.data,
      discountType: discountParsed.data.discountType,
      discountValue: discountParsed.data.discountValue,
      discountTarget: discountParsed.data.discountTarget,
      roundOff: h.roundOff,
      notes: h.notes,
      terms: h.terms,
      noteTemplateId: h.noteTemplateId,
      termTemplateId: h.termTemplateId,
      signatureId: h.signatureId,
      bankAccountId: h.bankAccountId,
    },
  };
}
