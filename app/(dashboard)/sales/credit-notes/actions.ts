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
  updateCreditNote,
  finalizeCreditNoteDraft,
  cancelCreditNote,
  softDeleteCreditNote,
  restoreCreditNote,
  findCreditNoteById,
  type CreditNoteWriteFailureReason,
} from "@/lib/db/queries/creditNotes";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

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
  not_editable: "This credit note can no longer be edited.",
  not_cancellable: "This credit note can't be cancelled.",
  not_deletable: "Only draft or cancelled credit notes can be deleted.",
  insufficient_stock: "One of the line items doesn't have enough stock available to restock.",
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
 * One action handles both create and edit (via a hidden `creditNoteId` field) and all three
 * submit intents (Save as Draft / Save & Print / Issue), the same shape as saveInvoiceAction.
 */
export async function saveCreditNoteAction(
  _prev: CreditNoteFormState,
  formData: FormData,
): Promise<CreditNoteFormState> {
  const context = await requireDashboardContext();
  const intent = String(formData.get("intent") ?? "draft"); // "draft" | "finalize" | "finalize_print"
  const creditNoteId = String(formData.get("creditNoteId") ?? "") || undefined;

  const headerParsed = creditNoteHeaderSchema.safeParse({
    linkedInvoiceId: formData.get("linkedInvoiceId"),
    creditNoteDate: formData.get("creditNoteDate"),
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
  const editInput = {
    creditNoteDate: new Date(h.creditNoteDate),
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
  if (!creditNoteId) {
    requirePermission(context.membership, "sales_credit_notes", "create");
    result = await createCreditNote({
      businessId: context.activeBusinessId,
      linkedInvoiceId: h.linkedInvoiceId,
      ...editInput,
      createdByUserId: context.membership.userId,
      finalize: intent !== "draft",
    });
  } else {
    requirePermission(context.membership, "sales_credit_notes", "edit");
    const existing = await findCreditNoteById(creditNoteId, context.activeBusinessId);
    if (!existing) return { error: REASON_MESSAGES.not_found };

    if (existing.status === "draft" && intent !== "draft") {
      result = await finalizeCreditNoteDraft(
        creditNoteId,
        context.activeBusinessId,
        editInput,
        context.membership.userId,
      );
    } else {
      result = await updateCreditNote(creditNoteId, context.activeBusinessId, editInput);
    }
  }

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/sales/credit-notes");
  const savedId = String(result.creditNote._id);
  if (intent === "finalize_print") {
    // A redirect can only replace this tab, so land on the document and let OpenPdfOnLoad open the PDF in a new one.
    redirect(`/sales/credit-notes/${savedId}?openPdf=${encodeURIComponent(`/api/sales/credit-notes/${savedId}/pdf`)}`);
  }
  redirect(`/sales/credit-notes/${savedId}`);
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
  await recordAuditLog({
    businessId: context.activeBusinessId,
    userId: context.membership.userId,
    action: "credit_note.deleted",
    target: { type: "credit_note", id: creditNoteId, label: result.creditNote.docNumber },
  });
  revalidatePath("/sales/credit-notes");
  redirect("/sales/credit-notes");
}

export async function restoreCreditNoteAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_credit_notes", "delete");
  const creditNoteId = String(formData.get("creditNoteId") ?? "");
  if (!creditNoteId) return;
  const creditNote = await restoreCreditNote(creditNoteId, context.activeBusinessId);
  if (creditNote) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.membership.userId,
      action: "credit_note.restored",
      target: { type: "credit_note", id: creditNoteId, label: creditNote.docNumber },
    });
  }
  revalidatePath("/sales/credit-notes");
}
