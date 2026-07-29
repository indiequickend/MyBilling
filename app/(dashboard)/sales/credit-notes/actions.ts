"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  creditNoteHeaderSchema,
  creditNoteLineItemsSchema,
  creditNoteDiscountSchema,
} from "@/lib/validation/creditNotes";
import { parseIndexedRows, parseCheckbox } from "@/lib/validation/shared";
import {
  createCreditNote,
  cancelCreditNote,
  softDeleteCreditNote,
  restoreCreditNote,
  type CreditNoteWriteFailureReason,
} from "@/lib/db/queries/creditNotes";

export type CreditNoteFormState = { error?: string; fieldErrors?: Record<string, string> };
export type CreditNoteActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<CreditNoteWriteFailureReason, string> = {
  invoice_not_found: "Select a valid invoice.",
  invoice_not_eligible: "This invoice can't be credited.",
  business_not_found: "Business not found.",
  not_found: "Credit note not found.",
  not_cancellable: "This credit note can't be cancelled.",
  not_deletable: "Only draft or cancelled credit notes can be deleted.",
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

/** Single-step: always issues immediately (no draft/edit flow — there is no updateCreditNote). */
export async function saveCreditNoteAction(
  _prev: CreditNoteFormState,
  formData: FormData,
): Promise<CreditNoteFormState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_credit_notes", "create");

  const headerParsed = creditNoteHeaderSchema.safeParse({
    linkedInvoiceId: formData.get("linkedInvoiceId"),
    creditNoteDate: formData.get("creditNoteDate"),
    reason: formData.get("reason"),
    placeOfSupplyState: formData.get("placeOfSupplyState"),
    roundOff: parseCheckbox(formData, "roundOff"),
  });
  if (!headerParsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(headerParsed.error),
    };
  }

  const lineItemsParsed = creditNoteLineItemsSchema.safeParse(parseLineItemRows(formData));
  if (!lineItemsParsed.success) {
    return { error: lineItemsParsed.error.issues[0]?.message ?? "Fix the line items." };
  }

  const discountParsed = creditNoteDiscountSchema.safeParse({
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    discountTarget: formData.get("discountTarget"),
  });
  if (!discountParsed.success) {
    return { error: discountParsed.error.issues[0]?.message ?? "Fix the discount." };
  }

  const h = headerParsed.data;
  const result = await createCreditNote({
    businessId: context.activeBusinessId,
    linkedInvoiceId: h.linkedInvoiceId,
    creditNoteDate: new Date(h.creditNoteDate),
    reason: h.reason,
    placeOfSupplyState: h.placeOfSupplyState,
    lineItems: lineItemsParsed.data,
    discountType: discountParsed.data.discountType,
    discountValue: discountParsed.data.discountValue,
    discountTarget: discountParsed.data.discountTarget,
    roundOff: h.roundOff,
    createdByUserId: context.membership.userId,
    finalize: true,
  });

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/sales/credit-notes");
  redirect(`/sales/credit-notes/${String(result.creditNote._id)}`);
}

export async function cancelCreditNoteAction(
  _prev: CreditNoteActionState,
  formData: FormData,
): Promise<CreditNoteActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_credit_notes", "edit");
  const creditNoteId = String(formData.get("creditNoteId") ?? "");
  const result = await cancelCreditNote(creditNoteId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/sales/credit-notes");
  revalidatePath(`/sales/credit-notes/${creditNoteId}`);
  return {};
}

export async function softDeleteCreditNoteAction(
  _prev: CreditNoteActionState,
  formData: FormData,
): Promise<CreditNoteActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_credit_notes", "delete");
  const creditNoteId = String(formData.get("creditNoteId") ?? "");
  const result = await softDeleteCreditNote(creditNoteId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/sales/credit-notes");
  redirect("/sales/credit-notes");
}

export async function restoreCreditNoteAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_credit_notes", "delete");
  const creditNoteId = String(formData.get("creditNoteId") ?? "");
  if (!creditNoteId) return;
  await restoreCreditNote(creditNoteId, context.activeBusinessId);
  revalidatePath("/sales/credit-notes");
}
