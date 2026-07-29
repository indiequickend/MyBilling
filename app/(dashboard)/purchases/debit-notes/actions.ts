"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  debitNoteHeaderSchema,
  debitNoteLineItemsSchema,
  debitNoteDiscountSchema,
} from "@/lib/validation/debitNotes";
import { parseIndexedRows, parseCheckbox } from "@/lib/validation/shared";
import {
  createDebitNote,
  cancelDebitNote,
  softDeleteDebitNote,
  restoreDebitNote,
  type DebitNoteWriteFailureReason,
} from "@/lib/db/queries/debitNotes";

export type DebitNoteFormState = { error?: string; fieldErrors?: Record<string, string> };
export type DebitNoteActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<DebitNoteWriteFailureReason, string> = {
  purchase_not_found: "Select a valid purchase.",
  business_not_found: "Business not found.",
  not_found: "Debit note not found.",
  not_cancellable: "This debit note can't be cancelled.",
  not_deletable: "Only draft or cancelled debit notes can be deleted.",
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
    hsnOrSac: row.hsnOrSac || undefined,
    unit: row.unit || undefined,
    quantity: row.quantity,
    unitPriceMinor: row.unitPriceMinor,
    discountType: row.discountType,
    discountValue: row.discountValue,
    taxRatePercent: row.taxRatePercent,
  }));
}

/** Single-step: always issues immediately (no draft/edit flow — there is no updateDebitNote). */
export async function saveDebitNoteAction(
  _prev: DebitNoteFormState,
  formData: FormData,
): Promise<DebitNoteFormState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "debit_notes", "create");

  const headerParsed = debitNoteHeaderSchema.safeParse({
    linkedPurchaseId: formData.get("linkedPurchaseId"),
    debitNoteDate: formData.get("debitNoteDate"),
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

  const lineItemsParsed = debitNoteLineItemsSchema.safeParse(parseLineItemRows(formData));
  if (!lineItemsParsed.success) {
    return { error: lineItemsParsed.error.issues[0]?.message ?? "Fix the line items." };
  }

  const discountParsed = debitNoteDiscountSchema.safeParse({
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    discountTarget: formData.get("discountTarget"),
  });
  if (!discountParsed.success) {
    return { error: discountParsed.error.issues[0]?.message ?? "Fix the discount." };
  }

  const h = headerParsed.data;
  const result = await createDebitNote({
    businessId: context.activeBusinessId,
    linkedPurchaseId: h.linkedPurchaseId,
    debitNoteDate: new Date(h.debitNoteDate),
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

  revalidatePath("/purchases/debit-notes");
  redirect(`/purchases/debit-notes/${String(result.debitNote._id)}`);
}

export async function cancelDebitNoteAction(
  _prev: DebitNoteActionState,
  formData: FormData,
): Promise<DebitNoteActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "debit_notes", "edit");
  const debitNoteId = String(formData.get("debitNoteId") ?? "");
  const result = await cancelDebitNote(debitNoteId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/purchases/debit-notes");
  revalidatePath(`/purchases/debit-notes/${debitNoteId}`);
  return {};
}

export async function softDeleteDebitNoteAction(
  _prev: DebitNoteActionState,
  formData: FormData,
): Promise<DebitNoteActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "debit_notes", "delete");
  const debitNoteId = String(formData.get("debitNoteId") ?? "");
  const result = await softDeleteDebitNote(debitNoteId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/purchases/debit-notes");
  redirect("/purchases/debit-notes");
}

export async function restoreDebitNoteAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "debit_notes", "delete");
  const debitNoteId = String(formData.get("debitNoteId") ?? "");
  if (!debitNoteId) return;
  await restoreDebitNote(debitNoteId, context.activeBusinessId);
  revalidatePath("/purchases/debit-notes");
}
