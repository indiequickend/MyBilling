"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission, can } from "@/lib/rbac/can";
import {
  purchaseHeaderSchema,
  purchaseLineItemsSchema,
  purchaseDiscountSchema,
  purchasePaymentSplitSchema,
} from "@/lib/validation/purchases";
import { buildCustomFieldValuesSchema } from "@/lib/validation/business";
import { parseIndexedRows, parseCheckbox } from "@/lib/validation/shared";
import { findBusinessById } from "@/lib/db/queries/businesses";
import {
  createPurchase,
  updatePurchase,
  finalizePurchaseDraft,
  recordPurchasePayment,
  cancelPurchase,
  softDeletePurchase,
  restorePurchase,
  findPurchaseById,
  type PurchaseWriteInput,
  type PurchaseWriteFailureReason,
  type PurchasePaymentSplitWriteInput,
} from "@/lib/db/queries/purchases";
// Only the "Convert to Purchase" flow (Purchase Orders feature) ever sets sourcePurchaseOrderId.
import { markPurchaseOrderClosed } from "@/lib/db/queries/purchaseOrders";

export type PurchaseFormState = { error?: string; fieldErrors?: Record<string, string> };
export type PurchaseActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<PurchaseWriteFailureReason, string> = {
  vendor_not_found: "Select a valid vendor.",
  invalid_bank_account: "Select a valid bank account.",
  invalid_note_template: "Select a valid notes template.",
  invalid_term_template: "Select a valid terms template.",
  business_not_found: "Business not found.",
  payments_exceed_total: "Payments recorded exceed the purchase total.",
  not_found: "Purchase not found.",
  not_editable: "This purchase can no longer be edited.",
  not_cancellable: "This purchase can't be cancelled.",
  not_deletable: "Only draft or cancelled purchases can be deleted.",
  not_payable: "This purchase isn't awaiting payment.",
  no_payments: "Enter at least one payment.",
  insufficient_stock: "Cancelling this purchase would take stock below zero — some of it has already been used.",
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
    itcEligible: row.itcEligible === "on",
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
 * Parses and validates the whole purchase form. Returns either `{ok:false, ...}` (surfaced as
 * form field errors) or the fully-typed `PurchaseWriteInput` + optional payment splits, ready to
 * hand to createPurchase/updatePurchase/finalizePurchaseDraft.
 */
async function parsePurchaseForm(
  businessId: string,
  formData: FormData,
): Promise<
  | { ok: true; input: PurchaseWriteInput; payments: PurchasePaymentSplitWriteInput[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const headerParsed = purchaseHeaderSchema.safeParse({
    vendorId: formData.get("vendorId"),
    purchaseDate: formData.get("purchaseDate"),
    dueDate: formData.get("dueDate"),
    referenceNumber: formData.get("referenceNumber"),
    vendorInvoiceNumber: formData.get("vendorInvoiceNumber"),
    placeOfSupplyState: formData.get("placeOfSupplyState"),
    reverseCharge: parseCheckbox(formData, "reverseCharge"),
    roundOff: parseCheckbox(formData, "roundOff"),
    notes: formData.get("notes"),
    terms: formData.get("terms"),
    noteTemplateId: formData.get("noteTemplateId"),
    termTemplateId: formData.get("termTemplateId"),
    bankAccountId: formData.get("bankAccountId"),
    tdsApplicable: parseCheckbox(formData, "tdsApplicable"),
    tdsSectionCode: formData.get("tdsSectionCode"),
    tdsRatePercent: formData.get("tdsRatePercent") || undefined,
    tdsAmountMinor: formData.get("tdsAmountMinor") || "",
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

  const lineItemsParsed = purchaseLineItemsSchema.safeParse(parseLineItemRows(formData));
  if (!lineItemsParsed.success) {
    return { ok: false, error: lineItemsParsed.error.issues[0]?.message ?? "Fix the line items." };
  }

  const discountParsed = purchaseDiscountSchema.safeParse({
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    discountTarget: formData.get("discountTarget"),
  });
  if (!discountParsed.success) {
    return { ok: false, error: discountParsed.error.issues[0]?.message ?? "Fix the discount." };
  }

  const business = await findBusinessById(businessId);
  if (!business) return { ok: false, error: "Business not found." };
  const fieldDefs = business.documentCustomFieldDefs?.purchase ?? [];
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

  const paymentsParsed = z.array(purchasePaymentSplitSchema).safeParse(parsePaymentRows(formData));
  if (!paymentsParsed.success) {
    return { ok: false, error: paymentsParsed.error.issues[0]?.message ?? "Fix the payment rows." };
  }

  const h = headerParsed.data;
  const sourcePurchaseOrderId = String(formData.get("sourcePurchaseOrderId") ?? "") || undefined;
  const input: PurchaseWriteInput = {
    businessId,
    vendorId: h.vendorId,
    purchaseDate: new Date(h.purchaseDate),
    dueDate: h.dueDate ? new Date(h.dueDate) : undefined,
    referenceNumber: h.referenceNumber,
    vendorInvoiceNumber: h.vendorInvoiceNumber,
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
    bankAccountId: h.bankAccountId,
    sourcePurchaseOrderId,
    tdsApplicable: h.tdsApplicable,
    tdsSectionCode: h.tdsSectionCode,
    tdsRatePercent: h.tdsRatePercent,
    tdsAmountMinor: h.tdsAmountMinor,
    tcsApplicable: h.tcsApplicable,
    tcsSectionCode: h.tcsSectionCode,
    tcsRatePercent: h.tcsRatePercent,
    tcsAmountMinor: h.tcsAmountMinor,
  };

  const payments: PurchasePaymentSplitWriteInput[] = paymentsParsed.data.map((p) => ({
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
 * purchase when `purchaseId` is absent, otherwise edits/finalizes the existing one. When the form
 * carries a `sourcePurchaseOrderId` (set when arriving via "Convert to Purchase"), the source PO
 * is marked closed once the new Purchase is successfully created.
 */
export async function savePurchaseAction(
  _prev: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const context = await requireDashboardContext();
  const intent = String(formData.get("intent") ?? "draft"); // "draft" | "finalize" | "finalize_print"
  const purchaseId = String(formData.get("purchaseId") ?? "") || undefined;

  const parsed = await parsePurchaseForm(context.activeBusinessId, formData);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };

  let result;
  if (!purchaseId) {
    requirePermission(context.membership, "purchases", "create");
    result = await createPurchase({
      ...parsed.input,
      createdByUserId: context.membership.userId,
      finalize: intent !== "draft",
      payments: intent === "draft" ? undefined : parsed.payments,
    });
    if (result.ok && parsed.input.sourcePurchaseOrderId) {
      await markPurchaseOrderClosed(parsed.input.sourcePurchaseOrderId, context.activeBusinessId);
      revalidatePath("/purchases/orders");
    }
  } else {
    requirePermission(context.membership, "purchases", "edit");
    const existing = await findPurchaseById(purchaseId, context.activeBusinessId);
    if (!existing) return { error: REASON_MESSAGES.not_found };

    if (existing.status === "draft" && intent !== "draft") {
      result = await finalizePurchaseDraft(
        purchaseId,
        context.activeBusinessId,
        parsed.input,
        parsed.payments,
        context.membership.userId,
      );
    } else {
      result = await updatePurchase(purchaseId, context.activeBusinessId, parsed.input);
    }
  }

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/purchases");
  const savedId = String(result.purchase._id);
  if (intent === "finalize_print") redirect(`/api/purchases/${savedId}/pdf`);
  redirect(`/purchases/${savedId}`);
}

export async function cancelPurchaseAction(
  _prev: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "purchases", "edit");
  const purchaseId = String(formData.get("purchaseId") ?? "");
  const result = await cancelPurchase(purchaseId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchaseId}`);
  return {};
}

export async function softDeletePurchaseAction(
  _prev: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "purchases", "delete");
  const purchaseId = String(formData.get("purchaseId") ?? "");
  const result = await softDeletePurchase(purchaseId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/purchases");
  redirect("/purchases");
}

export async function restorePurchaseAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "purchases", "delete");
  const purchaseId = String(formData.get("purchaseId") ?? "");
  if (!purchaseId) return;
  await restorePurchase(purchaseId, context.activeBusinessId);
  revalidatePath("/purchases");
}

export async function recordPurchasePaymentAction(
  _prev: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  const context = await requireDashboardContext();
  if (!can(context.membership, "payments", "create")) {
    return { error: "You don't have permission to record payments." };
  }
  const purchaseId = String(formData.get("purchaseId") ?? "");

  const paymentParsed = purchasePaymentSplitSchema.safeParse({
    amountMinor: formData.get("amountMinor"),
    mode: formData.get("mode"),
    bankAccountId: formData.get("bankAccountId"),
    paymentDate: formData.get("paymentDate"),
    referenceNote: formData.get("referenceNote"),
  });
  if (!paymentParsed.success) {
    return { error: paymentParsed.error.issues[0]?.message ?? "Fix the payment." };
  }

  const result = await recordPurchasePayment(
    purchaseId,
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

  revalidatePath(`/purchases/${purchaseId}`);
  return {};
}
