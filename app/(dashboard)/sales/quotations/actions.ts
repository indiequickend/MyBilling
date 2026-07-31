"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  quotationHeaderSchema,
  quotationLineItemsSchema,
  quotationDiscountSchema,
} from "@/lib/validation/quotations";
import { buildCustomFieldValuesSchema } from "@/lib/validation/business";
import { parseIndexedRows, parseCheckbox } from "@/lib/validation/shared";
import { findBusinessById } from "@/lib/db/queries/businesses";
import {
  createQuotation,
  updateQuotation,
  finalizeQuotationDraft,
  cancelQuotation,
  softDeleteQuotation,
  restoreQuotation,
  findQuotationById,
  type QuotationWriteInput,
  type QuotationWriteFailureReason,
} from "@/lib/db/queries/quotations";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type QuotationFormState = { error?: string; fieldErrors?: Record<string, string> };
export type QuotationActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<QuotationWriteFailureReason, string> = {
  customer_not_found: "Select a valid customer.",
  invalid_note_template: "Select a valid notes template.",
  invalid_term_template: "Select a valid terms template.",
  business_not_found: "Business not found.",
  not_found: "Quotation not found.",
  not_editable: "This quotation can no longer be edited.",
  not_cancellable: "This quotation can't be cancelled.",
  not_deletable: "Only draft or cancelled quotations can be deleted.",
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

async function parseQuotationForm(
  businessId: string,
  formData: FormData,
): Promise<
  | { ok: true; input: Omit<QuotationWriteInput, "businessId"> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const headerParsed = quotationHeaderSchema.safeParse({
    customerId: formData.get("customerId"),
    quotationDate: formData.get("quotationDate"),
    validUntil: formData.get("validUntil"),
    referenceNumber: formData.get("referenceNumber"),
    placeOfSupplyState: formData.get("placeOfSupplyState"),
    reverseCharge: parseCheckbox(formData, "reverseCharge"),
    roundOff: parseCheckbox(formData, "roundOff"),
    notes: formData.get("notes"),
    terms: formData.get("terms"),
    noteTemplateId: formData.get("noteTemplateId"),
    termTemplateId: formData.get("termTemplateId"),
  });
  if (!headerParsed.success) {
    return {
      ok: false,
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(headerParsed.error),
    };
  }

  const lineItemsParsed = quotationLineItemsSchema.safeParse(parseLineItemRows(formData));
  if (!lineItemsParsed.success) {
    return { ok: false, error: lineItemsParsed.error.issues[0]?.message ?? "Fix the line items." };
  }

  const discountParsed = quotationDiscountSchema.safeParse({
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    discountTarget: formData.get("discountTarget"),
  });
  if (!discountParsed.success) {
    return { ok: false, error: discountParsed.error.issues[0]?.message ?? "Fix the discount." };
  }

  const business = await findBusinessById(businessId);
  if (!business) return { ok: false, error: "Business not found." };
  const fieldDefs = business.documentCustomFieldDefs?.quotation ?? [];
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
  const input: Omit<QuotationWriteInput, "businessId"> = {
    customerId: h.customerId,
    quotationDate: new Date(h.quotationDate),
    validUntil: h.validUntil ? new Date(h.validUntil) : undefined,
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
  };

  return { ok: true, input };
}

/**
 * One action handles both submit paths (Save as Draft / Save) via a hidden `intent` field. Creates
 * a new quotation when `quotationId` is absent, otherwise edits/finalizes the existing one.
 */
export async function saveQuotationAction(
  _prev: QuotationFormState,
  formData: FormData,
): Promise<QuotationFormState> {
  const context = await requireDashboardContext();
  const intent = String(formData.get("intent") ?? "draft"); // "draft" | "finalize"
  const quotationId = String(formData.get("quotationId") ?? "") || undefined;

  const parsed = await parseQuotationForm(context.activeBusinessId, formData);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };

  let result;
  if (!quotationId) {
    requirePermission(context.membership, "quotations", "create");
    result = await createQuotation({
      ...parsed.input,
      businessId: context.activeBusinessId,
      createdByUserId: context.membership.userId,
      finalize: intent !== "draft",
    });
  } else {
    requirePermission(context.membership, "quotations", "edit");
    const existing = await findQuotationById(quotationId, context.activeBusinessId);
    if (!existing) return { error: REASON_MESSAGES.not_found };

    if (existing.status === "draft" && intent !== "draft") {
      result = await finalizeQuotationDraft(quotationId, context.activeBusinessId, {
        ...parsed.input,
        businessId: context.activeBusinessId,
      });
    } else {
      result = await updateQuotation(quotationId, context.activeBusinessId, {
        ...parsed.input,
        businessId: context.activeBusinessId,
      });
    }
  }

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/sales/quotations");
  redirect(`/sales/quotations/${String(result.quotation._id)}`);
}

export async function cancelQuotationAction(
  _prev: QuotationActionState,
  formData: FormData,
): Promise<QuotationActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "quotations", "edit");
  const quotationId = String(formData.get("quotationId") ?? "");
  const result = await cancelQuotation(quotationId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/sales/quotations");
  revalidatePath(`/sales/quotations/${quotationId}`);
  return {};
}

export async function softDeleteQuotationAction(
  _prev: QuotationActionState,
  formData: FormData,
): Promise<QuotationActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "quotations", "delete");
  const quotationId = String(formData.get("quotationId") ?? "");
  const result = await softDeleteQuotation(quotationId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  await recordAuditLog({
    businessId: context.activeBusinessId,
    userId: context.membership.userId,
    action: "quotation.deleted",
    target: { type: "quotation", id: quotationId, label: result.quotation.docNumber },
  });
  revalidatePath("/sales/quotations");
  redirect("/sales/quotations");
}

export async function restoreQuotationAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "quotations", "delete");
  const quotationId = String(formData.get("quotationId") ?? "");
  if (!quotationId) return;
  const quotation = await restoreQuotation(quotationId, context.activeBusinessId);
  if (quotation) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.membership.userId,
      action: "quotation.restored",
      target: { type: "quotation", id: quotationId, label: quotation.docNumber },
    });
  }
  revalidatePath("/sales/quotations");
}
