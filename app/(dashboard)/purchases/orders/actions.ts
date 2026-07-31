"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  purchaseOrderHeaderSchema,
  purchaseOrderLineItemsSchema,
  purchaseOrderDiscountSchema,
} from "@/lib/validation/purchaseOrders";
import { buildCustomFieldValuesSchema } from "@/lib/validation/business";
import { parseIndexedRows, parseCheckbox } from "@/lib/validation/shared";
import { findBusinessById } from "@/lib/db/queries/businesses";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  finalizePurchaseOrderDraft,
  cancelPurchaseOrder,
  softDeletePurchaseOrder,
  restorePurchaseOrder,
  findPurchaseOrderById,
  type PurchaseOrderWriteInput,
  type PurchaseOrderWriteFailureReason,
} from "@/lib/db/queries/purchaseOrders";

export type PurchaseOrderFormState = { error?: string; fieldErrors?: Record<string, string> };
export type PurchaseOrderActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<PurchaseOrderWriteFailureReason, string> = {
  vendor_not_found: "Select a valid vendor.",
  invalid_note_template: "Select a valid notes template.",
  invalid_term_template: "Select a valid terms template.",
  business_not_found: "Business not found.",
  not_found: "Purchase order not found.",
  not_editable: "This purchase order can no longer be edited.",
  not_cancellable: "This purchase order can't be cancelled.",
  not_deletable: "Only draft or cancelled purchase orders can be deleted.",
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

async function parsePurchaseOrderForm(
  businessId: string,
  formData: FormData,
): Promise<
  | { ok: true; input: Omit<PurchaseOrderWriteInput, "businessId"> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const headerParsed = purchaseOrderHeaderSchema.safeParse({
    vendorId: formData.get("vendorId"),
    orderDate: formData.get("orderDate"),
    expectedDeliveryDate: formData.get("expectedDeliveryDate"),
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

  const lineItemsParsed = purchaseOrderLineItemsSchema.safeParse(parseLineItemRows(formData));
  if (!lineItemsParsed.success) {
    return { ok: false, error: lineItemsParsed.error.issues[0]?.message ?? "Fix the line items." };
  }

  const discountParsed = purchaseOrderDiscountSchema.safeParse({
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    discountTarget: formData.get("discountTarget"),
  });
  if (!discountParsed.success) {
    return { ok: false, error: discountParsed.error.issues[0]?.message ?? "Fix the discount." };
  }

  const business = await findBusinessById(businessId);
  if (!business) return { ok: false, error: "Business not found." };
  const fieldDefs = business.documentCustomFieldDefs?.purchase_order ?? [];
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
  const input: Omit<PurchaseOrderWriteInput, "businessId"> = {
    vendorId: h.vendorId,
    orderDate: new Date(h.orderDate),
    expectedDeliveryDate: h.expectedDeliveryDate ? new Date(h.expectedDeliveryDate) : undefined,
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

export async function savePurchaseOrderAction(
  _prev: PurchaseOrderFormState,
  formData: FormData,
): Promise<PurchaseOrderFormState> {
  const context = await requireDashboardContext();
  const intent = String(formData.get("intent") ?? "draft"); // "draft" | "finalize"
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "") || undefined;

  const parsed = await parsePurchaseOrderForm(context.activeBusinessId, formData);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };

  let result;
  if (!purchaseOrderId) {
    requirePermission(context.membership, "purchase_orders", "create");
    result = await createPurchaseOrder({
      ...parsed.input,
      businessId: context.activeBusinessId,
      createdByUserId: context.membership.userId,
      finalize: intent !== "draft",
    });
  } else {
    requirePermission(context.membership, "purchase_orders", "edit");
    const existing = await findPurchaseOrderById(purchaseOrderId, context.activeBusinessId);
    if (!existing) return { error: REASON_MESSAGES.not_found };

    if (existing.status === "draft" && intent !== "draft") {
      result = await finalizePurchaseOrderDraft(purchaseOrderId, context.activeBusinessId, {
        ...parsed.input,
        businessId: context.activeBusinessId,
      });
    } else {
      result = await updatePurchaseOrder(purchaseOrderId, context.activeBusinessId, {
        ...parsed.input,
        businessId: context.activeBusinessId,
      });
    }
  }

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/purchases/orders");
  redirect(`/purchases/orders/${String(result.purchaseOrder._id)}`);
}

export async function cancelPurchaseOrderAction(
  _prev: PurchaseOrderActionState,
  formData: FormData,
): Promise<PurchaseOrderActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "purchase_orders", "edit");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const result = await cancelPurchaseOrder(purchaseOrderId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/purchases/orders");
  revalidatePath(`/purchases/orders/${purchaseOrderId}`);
  return {};
}

export async function softDeletePurchaseOrderAction(
  _prev: PurchaseOrderActionState,
  formData: FormData,
): Promise<PurchaseOrderActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "purchase_orders", "delete");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const result = await softDeletePurchaseOrder(purchaseOrderId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/purchases/orders");
  redirect("/purchases/orders");
}

export async function restorePurchaseOrderAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "purchase_orders", "delete");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  if (!purchaseOrderId) return;
  await restorePurchaseOrder(purchaseOrderId, context.activeBusinessId);
  revalidatePath("/purchases/orders");
}
