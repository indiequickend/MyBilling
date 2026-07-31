"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission, can } from "@/lib/rbac/can";
import {
  invoiceHeaderSchema,
  invoiceLineItemsSchema,
  invoiceDiscountSchema,
  invoicePaymentSplitSchema,
} from "@/lib/validation/invoices";
import { applyAdvanceSchema } from "@/lib/validation/payments";
import { buildCustomFieldValuesSchema } from "@/lib/validation/business";
import { parseIndexedRows, parseCheckbox } from "@/lib/validation/shared";
import { findBusinessById } from "@/lib/db/queries/businesses";
import {
  createInvoice,
  updateInvoice,
  finalizeInvoiceDraft,
  recordInvoicePayment,
  cancelInvoice,
  softDeleteInvoice,
  restoreInvoice,
  findInvoiceById,
  type InvoiceWriteInput,
  type InvoiceWriteFailureReason,
  type InvoicePaymentSplitWriteInput,
} from "@/lib/db/queries/invoices";
import { applyAdvancePayment } from "@/lib/db/queries/payments";
// Only the "Convert to Invoice" flow (Quotation/Sales Order features) ever sets these.
import { markQuotationClosed } from "@/lib/db/queries/quotations";
import { markSalesOrderClosed } from "@/lib/db/queries/salesOrders";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type InvoiceFormState = { error?: string; fieldErrors?: Record<string, string> };
export type InvoiceActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<InvoiceWriteFailureReason, string> = {
  customer_not_found: "Select a valid customer.",
  invalid_signature: "Select a valid signature.",
  invalid_bank_account: "Select a valid bank account.",
  invalid_note_template: "Select a valid notes template.",
  invalid_term_template: "Select a valid terms template.",
  invalid_project: "Select a valid project.",
  business_not_found: "Business not found.",
  payments_exceed_total: "Payments recorded exceed the invoice total.",
  not_found: "Invoice not found.",
  not_editable: "This invoice can no longer be edited.",
  not_cancellable: "This invoice can't be cancelled.",
  not_deletable: "Only draft or cancelled invoices can be deleted.",
  not_payable: "This invoice isn't awaiting payment.",
  no_payments: "Enter at least one payment.",
  insufficient_stock: "One of the line items doesn't have enough stock available.",
};

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

function parseLineItemRows(formData: FormData) {
  return parseIndexedRows(formData, "lineItem").map((row) => ({
    productId: row.productId || undefined,
    variantId: row.variantId || undefined,
    description: row.description,
    notes: row.notes || undefined,
    hsnOrSac: row.hsnOrSac || undefined,
    unit: row.unit || undefined,
    quantity: row.quantity,
    unitPriceMinor: row.unitPriceMinor,
    discountType: row.discountType,
    discountValue: row.discountValue,
    taxRatePercent: row.taxRatePercent,
    warehouseId: row.warehouseId || undefined,
    batchId: row.batchId || undefined,
    serialNumbersText: row.serialNumbersText || undefined,
  }));
}

function parsePaymentRows(formData: FormData) {
  return parseIndexedRows(formData, "payment")
    .filter((row) => row.amountMinor && row.bankAccountId)
    .map((row) => ({
      amountMinor: row.amountMinor,
      mode: row.mode,
      bankAccountId: row.bankAccountId,
      paymentDate: row.paymentDate,
      referenceNote: row.referenceNote || undefined,
    }));
}

/**
 * Parses and validates the whole invoice form. Returns either `{ok:false, ...}` (surfaced as
 * form field errors) or the fully-typed `InvoiceWriteInput` + optional payment splits, ready to
 * hand to createInvoice/updateInvoice/finalizeInvoiceDraft.
 */
async function parseInvoiceForm(
  businessId: string,
  formData: FormData,
): Promise<
  | { ok: true; input: InvoiceWriteInput; payments: InvoicePaymentSplitWriteInput[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const headerParsed = invoiceHeaderSchema.safeParse({
    customerId: formData.get("customerId"),
    invoiceDate: formData.get("invoiceDate"),
    dueDate: formData.get("dueDate"),
    referenceNumber: formData.get("referenceNumber"),
    placeOfSupplyState: formData.get("placeOfSupplyState"),
    reverseCharge: parseCheckbox(formData, "reverseCharge"),
    roundOff: parseCheckbox(formData, "roundOff"),
    notes: formData.get("notes"),
    terms: formData.get("terms"),
    noteTemplateId: formData.get("noteTemplateId"),
    termTemplateId: formData.get("termTemplateId"),
    signatureId: formData.get("signatureId"),
    bankAccountId: formData.get("bankAccountId"),
    projectId: formData.get("projectId"),
    tcsApplicable: parseCheckbox(formData, "tcsApplicable"),
    tcsSectionCode: formData.get("tcsSectionCode"),
    tcsRatePercent: formData.get("tcsRatePercent") || undefined,
    tcsAmountMinor: formData.get("tcsAmountMinor") || "",
  });
  if (!headerParsed.success) {
    return {
      ok: false,
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(headerParsed.error),
    };
  }

  const lineItemsParsed = invoiceLineItemsSchema.safeParse(parseLineItemRows(formData));
  if (!lineItemsParsed.success) {
    return { ok: false, error: lineItemsParsed.error.issues[0]?.message ?? "Fix the line items." };
  }

  const discountParsed = invoiceDiscountSchema.safeParse({
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    discountTarget: formData.get("discountTarget"),
  });
  if (!discountParsed.success) {
    return { ok: false, error: discountParsed.error.issues[0]?.message ?? "Fix the discount." };
  }

  const business = await findBusinessById(businessId);
  if (!business) return { ok: false, error: "Business not found." };
  const fieldDefs = business.documentCustomFieldDefs?.invoice ?? [];
  const customFieldSchema = buildCustomFieldValuesSchema(fieldDefs);
  const rawCustomFields: Record<string, unknown> = {};
  for (const def of fieldDefs) rawCustomFields[def.key] = formData.get(def.key);
  const customFieldsParsed = customFieldSchema.safeParse(rawCustomFields);
  if (!customFieldsParsed.success) {
    return {
      ok: false,
      error: "Fix the custom field values.",
      fieldErrors: fieldErrorsFrom(customFieldsParsed.error),
    };
  }

  const paymentsParsed = z.array(invoicePaymentSplitSchema).safeParse(parsePaymentRows(formData));
  if (!paymentsParsed.success) {
    return { ok: false, error: paymentsParsed.error.issues[0]?.message ?? "Fix the payment rows." };
  }

  const h = headerParsed.data;
  const sourceQuotationId = String(formData.get("sourceQuotationId") ?? "") || undefined;
  const sourceSalesOrderId = String(formData.get("sourceSalesOrderId") ?? "") || undefined;
  const input: InvoiceWriteInput = {
    businessId,
    customerId: h.customerId,
    invoiceDate: new Date(h.invoiceDate),
    dueDate: h.dueDate ? new Date(h.dueDate) : undefined,
    referenceNumber: h.referenceNumber,
    placeOfSupplyState: h.placeOfSupplyState,
    reverseCharge: h.reverseCharge,
    lineItems: lineItemsParsed.data,
    discountType: discountParsed.data.discountType,
    discountValue: discountParsed.data.discountValue,
    discountTarget: discountParsed.data.discountTarget,
    roundOff: h.roundOff,
    customFieldValues: customFieldsParsed.data,
    notes: h.notes,
    terms: h.terms,
    noteTemplateId: h.noteTemplateId,
    termTemplateId: h.termTemplateId,
    signatureId: h.signatureId,
    bankAccountId: h.bankAccountId,
    projectId: h.projectId,
    sourceQuotationId,
    sourceSalesOrderId,
    tcsApplicable: h.tcsApplicable,
    tcsSectionCode: h.tcsSectionCode,
    tcsRatePercent: h.tcsRatePercent,
    tcsAmountMinor: h.tcsAmountMinor,
  };

  const payments: InvoicePaymentSplitWriteInput[] = paymentsParsed.data.map((p) => ({
    amountMinor: p.amountMinor,
    mode: p.mode,
    bankAccountId: p.bankAccountId,
    paymentDate: new Date(p.paymentDate),
    referenceNote: p.referenceNote,
  }));

  return { ok: true, input, payments };
}

/**
 * One action handles all three submit paths (Save as Draft / Save / Save & Print) via a hidden
 * `intent` field set by each submit button's own `name="intent" value="..."`. Creates a new
 * invoice when `invoiceId` is absent, otherwise edits/finalizes the existing one.
 */
export async function saveInvoiceAction(
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const context = await requireDashboardContext();
  const intent = String(formData.get("intent") ?? "draft"); // "draft" | "finalize" | "finalize_print"
  const invoiceId = String(formData.get("invoiceId") ?? "") || undefined;

  const parsed = await parseInvoiceForm(context.activeBusinessId, formData);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };

  let result;
  if (!invoiceId) {
    requirePermission(context.membership, "sales_invoices", "create");
    result = await createInvoice({
      ...parsed.input,
      createdByUserId: context.membership.userId,
      finalize: intent !== "draft",
      payments: intent === "draft" ? undefined : parsed.payments,
    });
    if (result.ok && parsed.input.sourceQuotationId) {
      await markQuotationClosed(parsed.input.sourceQuotationId, context.activeBusinessId);
      revalidatePath("/sales/quotations");
    }
    if (result.ok && parsed.input.sourceSalesOrderId) {
      await markSalesOrderClosed(parsed.input.sourceSalesOrderId, context.activeBusinessId);
      revalidatePath("/sales/sales-orders");
    }
  } else {
    requirePermission(context.membership, "sales_invoices", "edit");
    const existing = await findInvoiceById(invoiceId, context.activeBusinessId);
    if (!existing) return { error: REASON_MESSAGES.not_found };

    if (existing.status === "draft" && intent !== "draft") {
      result = await finalizeInvoiceDraft(
        invoiceId,
        context.activeBusinessId,
        parsed.input,
        parsed.payments,
        context.membership.userId,
      );
    } else {
      result = await updateInvoice(invoiceId, context.activeBusinessId, parsed.input);
    }
  }

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/sales/invoices");
  const savedId = String(result.invoice._id);
  if (intent === "finalize_print") redirect(`/api/sales/invoices/${savedId}/pdf`);
  redirect(`/sales/invoices/${savedId}`);
}

export async function cancelInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_invoices", "edit");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const result = await cancelInvoice(invoiceId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/sales/invoices");
  revalidatePath(`/sales/invoices/${invoiceId}`);
  return {};
}

export async function softDeleteInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_invoices", "delete");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const result = await softDeleteInvoice(invoiceId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  await recordAuditLog({
    businessId: context.activeBusinessId,
    userId: context.membership.userId,
    action: "invoice.deleted",
    target: { type: "invoice", id: invoiceId, label: result.invoice.docNumber },
  });
  revalidatePath("/sales/invoices");
  redirect("/sales/invoices");
}

export async function restoreInvoiceAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_invoices", "delete");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;
  const invoice = await restoreInvoice(invoiceId, context.activeBusinessId);
  if (invoice) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.membership.userId,
      action: "invoice.restored",
      target: { type: "invoice", id: invoiceId, label: invoice.docNumber },
    });
  }
  revalidatePath("/sales/invoices");
}

export async function recordInvoicePaymentAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const context = await requireDashboardContext();
  if (!can(context.membership, "payments", "create")) {
    return { error: "You don't have permission to record payments." };
  }
  const invoiceId = String(formData.get("invoiceId") ?? "");

  const paymentParsed = invoicePaymentSplitSchema.safeParse({
    amountMinor: formData.get("amountMinor"),
    mode: formData.get("mode"),
    bankAccountId: formData.get("bankAccountId"),
    paymentDate: formData.get("paymentDate"),
    referenceNote: formData.get("referenceNote"),
  });
  if (!paymentParsed.success) {
    return { error: paymentParsed.error.issues[0]?.message ?? "Fix the payment." };
  }

  const result = await recordInvoicePayment(
    invoiceId,
    context.activeBusinessId,
    [
      {
        amountMinor: paymentParsed.data.amountMinor,
        mode: paymentParsed.data.mode,
        bankAccountId: paymentParsed.data.bankAccountId,
        paymentDate: new Date(paymentParsed.data.paymentDate),
        referenceNote: paymentParsed.data.referenceNote,
      },
    ],
    context.membership.userId,
  );
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath(`/sales/invoices/${invoiceId}`);
  return {};
}

const APPLY_ADVANCE_MESSAGES: Record<string, string> = {
  advance_not_found: "That advance payment is no longer available.",
  target_not_found: "Invoice not found.",
  not_payable: "This invoice isn't awaiting payment.",
  party_mismatch: "That advance doesn't belong to this invoice's customer.",
  amount_invalid: "Enter an amount up to the advance and the balance due.",
};

/** Settles some or all of an existing unlinked advance payment against this invoice — the
 * manual-settle counterpart to recordInvoicePaymentAction (see applyAdvancePayment). */
export async function applyAdvanceToInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const context = await requireDashboardContext();
  if (!can(context.membership, "payments", "create")) {
    return { error: "You don't have permission to record payments." };
  }
  const invoiceId = String(formData.get("invoiceId") ?? "");

  const parsed = applyAdvanceSchema.safeParse({
    paymentId: formData.get("paymentId"),
    amountMinor: formData.get("amountMinor"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Fix the amount." };

  const result = await applyAdvancePayment({
    businessId: context.activeBusinessId,
    paymentId: parsed.data.paymentId,
    targetType: "invoice",
    targetId: invoiceId,
    amountMinor: parsed.data.amountMinor,
  });
  if (!result.ok) return { error: APPLY_ADVANCE_MESSAGES[result.reason] };

  revalidatePath(`/sales/invoices/${invoiceId}`);
  return {};
}
