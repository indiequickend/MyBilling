"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  proformaInvoiceHeaderSchema,
  proformaInvoiceLineItemsSchema,
  proformaInvoiceDiscountSchema,
} from "@/lib/validation/proformaInvoices";
import { buildCustomFieldValuesSchema } from "@/lib/validation/business";
import { parseIndexedRows, parseCheckbox } from "@/lib/validation/shared";
import { findBusinessById } from "@/lib/db/queries/businesses";
import {
  createProformaInvoice,
  updateProformaInvoice,
  finalizeProformaInvoiceDraft,
  cancelProformaInvoice,
  softDeleteProformaInvoice,
  restoreProformaInvoice,
  findProformaInvoiceById,
  type ProformaInvoiceWriteInput,
  type ProformaInvoiceWriteFailureReason,
} from "@/lib/db/queries/proformaInvoices";

export type ProformaInvoiceFormState = { error?: string; fieldErrors?: Record<string, string> };
export type ProformaInvoiceActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<ProformaInvoiceWriteFailureReason, string> = {
  customer_not_found: "Select a valid customer.",
  invalid_signature: "Select a valid signature.",
  invalid_bank_account: "Select a valid bank account.",
  invalid_note_template: "Select a valid notes template.",
  invalid_term_template: "Select a valid terms template.",
  business_not_found: "Business not found.",
  not_found: "Proforma invoice not found.",
  not_editable: "This proforma invoice can no longer be edited.",
  not_cancellable: "This proforma invoice can't be cancelled.",
  not_deletable: "Only draft or cancelled proforma invoices can be deleted.",
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
  }));
}

async function parseProformaInvoiceForm(
  businessId: string,
  formData: FormData,
): Promise<
  | { ok: true; input: Omit<ProformaInvoiceWriteInput, "businessId"> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const headerParsed = proformaInvoiceHeaderSchema.safeParse({
    customerId: formData.get("customerId"),
    proformaDate: formData.get("proformaDate"),
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
  });
  if (!headerParsed.success) {
    return {
      ok: false,
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(headerParsed.error),
    };
  }

  const lineItemsParsed = proformaInvoiceLineItemsSchema.safeParse(parseLineItemRows(formData));
  if (!lineItemsParsed.success) {
    return { ok: false, error: lineItemsParsed.error.issues[0]?.message ?? "Fix the line items." };
  }

  const discountParsed = proformaInvoiceDiscountSchema.safeParse({
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    discountTarget: formData.get("discountTarget"),
  });
  if (!discountParsed.success) {
    return { ok: false, error: discountParsed.error.issues[0]?.message ?? "Fix the discount." };
  }

  const business = await findBusinessById(businessId);
  if (!business) return { ok: false, error: "Business not found." };
  const fieldDefs = business.documentCustomFieldDefs?.proforma_invoice ?? [];
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

  const h = headerParsed.data;
  const input: Omit<ProformaInvoiceWriteInput, "businessId"> = {
    customerId: h.customerId,
    proformaDate: new Date(h.proformaDate),
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
  };

  return { ok: true, input };
}

/**
 * One action handles all three submit paths (Save as Draft / Save / Save & Print) via a hidden
 * `intent` field. Creates a new proforma invoice when `proformaInvoiceId` is absent, otherwise
 * edits/finalizes the existing one. Pro Forma Invoices are standalone this phase — no conversion
 * action, unlike Quotation/Sales Order.
 */
export async function saveProformaInvoiceAction(
  _prev: ProformaInvoiceFormState,
  formData: FormData,
): Promise<ProformaInvoiceFormState> {
  const context = await requireDashboardContext();
  const intent = String(formData.get("intent") ?? "draft"); // "draft" | "finalize" | "finalize_print"
  const proformaInvoiceId = String(formData.get("proformaInvoiceId") ?? "") || undefined;

  const parsed = await parseProformaInvoiceForm(context.activeBusinessId, formData);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };

  let result;
  if (!proformaInvoiceId) {
    requirePermission(context.membership, "proforma_invoices", "create");
    result = await createProformaInvoice({
      ...parsed.input,
      businessId: context.activeBusinessId,
      createdByUserId: context.membership.userId,
      finalize: intent !== "draft",
    });
  } else {
    requirePermission(context.membership, "proforma_invoices", "edit");
    const existing = await findProformaInvoiceById(proformaInvoiceId, context.activeBusinessId);
    if (!existing) return { error: REASON_MESSAGES.not_found };

    if (existing.status === "draft" && intent !== "draft") {
      result = await finalizeProformaInvoiceDraft(proformaInvoiceId, context.activeBusinessId, {
        ...parsed.input,
        businessId: context.activeBusinessId,
      });
    } else {
      result = await updateProformaInvoice(proformaInvoiceId, context.activeBusinessId, {
        ...parsed.input,
        businessId: context.activeBusinessId,
      });
    }
  }

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/sales/proforma-invoices");
  const savedId = String(result.proformaInvoice._id);
  if (intent === "finalize_print") redirect(`/api/sales/proforma-invoices/${savedId}/pdf`);
  redirect(`/sales/proforma-invoices/${savedId}`);
}

export async function cancelProformaInvoiceAction(
  _prev: ProformaInvoiceActionState,
  formData: FormData,
): Promise<ProformaInvoiceActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "proforma_invoices", "edit");
  const proformaInvoiceId = String(formData.get("proformaInvoiceId") ?? "");
  const result = await cancelProformaInvoice(proformaInvoiceId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/sales/proforma-invoices");
  revalidatePath(`/sales/proforma-invoices/${proformaInvoiceId}`);
  return {};
}

export async function softDeleteProformaInvoiceAction(
  _prev: ProformaInvoiceActionState,
  formData: FormData,
): Promise<ProformaInvoiceActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "proforma_invoices", "delete");
  const proformaInvoiceId = String(formData.get("proformaInvoiceId") ?? "");
  const result = await softDeleteProformaInvoice(proformaInvoiceId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/sales/proforma-invoices");
  redirect("/sales/proforma-invoices");
}

export async function restoreProformaInvoiceAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "proforma_invoices", "delete");
  const proformaInvoiceId = String(formData.get("proformaInvoiceId") ?? "");
  if (!proformaInvoiceId) return;
  await restoreProformaInvoice(proformaInvoiceId, context.activeBusinessId);
  revalidatePath("/sales/proforma-invoices");
}
