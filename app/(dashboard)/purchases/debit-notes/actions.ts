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
  updateDebitNote,
  finalizeDebitNoteDraft,
  cancelDebitNote,
  softDeleteDebitNote,
  restoreDebitNote,
  findDebitNoteById,
  type DebitNoteWriteFailureReason,
} from "@/lib/db/queries/debitNotes";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

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
  not_editable: "This debit note can no longer be edited.",
  not_cancellable: "This debit note can't be cancelled.",
  not_deletable: "Only draft or cancelled debit notes can be deleted.",
  insufficient_stock: "One of the line items doesn't have enough stock available to remove.",
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

/**
 * One action handles both create and edit (via a hidden `debitNoteId` field) and all three
 * submit intents (Save as Draft / Save & Print / Issue), the same shape as saveInvoiceAction.
 */
export async function saveDebitNoteAction(
  _prev: DebitNoteFormState,
  formData: FormData,
): Promise<DebitNoteFormState> {
  const context = await requireDashboardContext();
  const intent = String(formData.get("intent") ?? "draft"); // "draft" | "finalize" | "finalize_print"
  const debitNoteId = String(formData.get("debitNoteId") ?? "") || undefined;

  const headerParsed = debitNoteHeaderSchema.safeParse({
    linkedPurchaseId: formData.get("linkedPurchaseId"),
    debitNoteDate: formData.get("debitNoteDate"),
    reason: formData.get("reason"),
    restockItems: parseCheckbox(formData, "restockItems"),
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
  const editInput = {
    debitNoteDate: new Date(h.debitNoteDate),
    reason: h.reason,
    restockItems: h.restockItems,
    placeOfSupplyState: h.placeOfSupplyState,
    lineItems: lineItemsParsed.data,
    discountType: discountParsed.data.discountType,
    discountValue: discountParsed.data.discountValue,
    discountTarget: discountParsed.data.discountTarget,
    roundOff: h.roundOff,
  };

  let result;
  if (!debitNoteId) {
    requirePermission(context.membership, "debit_notes", "create");
    result = await createDebitNote({
      businessId: context.activeBusinessId,
      linkedPurchaseId: h.linkedPurchaseId,
      ...editInput,
      createdByUserId: context.membership.userId,
      finalize: intent !== "draft",
    });
  } else {
    requirePermission(context.membership, "debit_notes", "edit");
    const existing = await findDebitNoteById(debitNoteId, context.activeBusinessId);
    if (!existing) return { error: REASON_MESSAGES.not_found };

    if (existing.status === "draft" && intent !== "draft") {
      result = await finalizeDebitNoteDraft(
        debitNoteId,
        context.activeBusinessId,
        editInput,
        context.membership.userId,
      );
    } else {
      result = await updateDebitNote(debitNoteId, context.activeBusinessId, editInput);
    }
  }

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/purchases/debit-notes");
  const savedId = String(result.debitNote._id);
  if (intent === "finalize_print") {
    // A redirect can only replace this tab, so land on the document and let OpenPdfOnLoad open the PDF in a new one.
    redirect(`/purchases/debit-notes/${savedId}?openPdf=${encodeURIComponent(`/api/purchases/debit-notes/${savedId}/pdf`)}`);
  }
  redirect(`/purchases/debit-notes/${savedId}`);
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
  await recordAuditLog({
    businessId: context.activeBusinessId,
    userId: context.membership.userId,
    action: "debit_note.deleted",
    target: { type: "debit_note", id: debitNoteId, label: result.debitNote.docNumber },
  });
  revalidatePath("/purchases/debit-notes");
  redirect("/purchases/debit-notes");
}

export async function restoreDebitNoteAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "debit_notes", "delete");
  const debitNoteId = String(formData.get("debitNoteId") ?? "");
  if (!debitNoteId) return;
  const debitNote = await restoreDebitNote(debitNoteId, context.activeBusinessId);
  if (debitNote) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.membership.userId,
      action: "debit_note.restored",
      target: { type: "debit_note", id: debitNoteId, label: debitNote.docNumber },
    });
  }
  revalidatePath("/purchases/debit-notes");
}
