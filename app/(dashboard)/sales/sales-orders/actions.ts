"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  salesOrderHeaderSchema,
  salesOrderLineItemsSchema,
  salesOrderDiscountSchema,
} from "@/lib/validation/salesOrders";
import { buildCustomFieldValuesSchema } from "@/lib/validation/business";
import { parseIndexedRows, parseCheckbox } from "@/lib/validation/shared";
import { findBusinessById } from "@/lib/db/queries/businesses";
import {
  createSalesOrder,
  updateSalesOrder,
  finalizeSalesOrderDraft,
  cancelSalesOrder,
  softDeleteSalesOrder,
  restoreSalesOrder,
  findSalesOrderById,
  type SalesOrderWriteInput,
  type SalesOrderWriteFailureReason,
} from "@/lib/db/queries/salesOrders";
// Only the "Convert to Sales Order" flow (Quotations feature) ever sets sourceQuotationId.
import { markQuotationClosed } from "@/lib/db/queries/quotations";

export type SalesOrderFormState = { error?: string; fieldErrors?: Record<string, string> };
export type SalesOrderActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<SalesOrderWriteFailureReason, string> = {
  customer_not_found: "Select a valid customer.",
  invalid_note_template: "Select a valid notes template.",
  invalid_term_template: "Select a valid terms template.",
  business_not_found: "Business not found.",
  not_found: "Sales order not found.",
  not_editable: "This sales order can no longer be edited.",
  not_cancellable: "This sales order can't be cancelled.",
  not_deletable: "Only draft or cancelled sales orders can be deleted.",
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

async function parseSalesOrderForm(
  businessId: string,
  formData: FormData,
): Promise<
  | { ok: true; input: Omit<SalesOrderWriteInput, "businessId"> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const headerParsed = salesOrderHeaderSchema.safeParse({
    customerId: formData.get("customerId"),
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

  const lineItemsParsed = salesOrderLineItemsSchema.safeParse(parseLineItemRows(formData));
  if (!lineItemsParsed.success) {
    return { ok: false, error: lineItemsParsed.error.issues[0]?.message ?? "Fix the line items." };
  }

  const discountParsed = salesOrderDiscountSchema.safeParse({
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    discountTarget: formData.get("discountTarget"),
  });
  if (!discountParsed.success) {
    return { ok: false, error: discountParsed.error.issues[0]?.message ?? "Fix the discount." };
  }

  const business = await findBusinessById(businessId);
  if (!business) return { ok: false, error: "Business not found." };
  const fieldDefs = business.documentCustomFieldDefs?.sales_order ?? [];
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
  const sourceQuotationId = String(formData.get("sourceQuotationId") ?? "") || undefined;
  const input: Omit<SalesOrderWriteInput, "businessId"> = {
    customerId: h.customerId,
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
    sourceQuotationId,
  };

  return { ok: true, input };
}

/**
 * One action handles both submit paths (Save as Draft / Save) via a hidden `intent` field. Creates
 * a new sales order when `salesOrderId` is absent, otherwise edits/finalizes the existing one. When
 * the form carries a `sourceQuotationId` (set when arriving via "Convert to Sales Order"), the
 * source quotation is marked closed once the new Sales Order is successfully created.
 */
export async function saveSalesOrderAction(
  _prev: SalesOrderFormState,
  formData: FormData,
): Promise<SalesOrderFormState> {
  const context = await requireDashboardContext();
  const intent = String(formData.get("intent") ?? "draft"); // "draft" | "finalize"
  const salesOrderId = String(formData.get("salesOrderId") ?? "") || undefined;

  const parsed = await parseSalesOrderForm(context.activeBusinessId, formData);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors };

  let result;
  if (!salesOrderId) {
    requirePermission(context.membership, "sales_orders", "create");
    result = await createSalesOrder({
      ...parsed.input,
      businessId: context.activeBusinessId,
      createdByUserId: context.membership.userId,
      finalize: intent !== "draft",
    });
    if (result.ok && parsed.input.sourceQuotationId) {
      await markQuotationClosed(parsed.input.sourceQuotationId, context.activeBusinessId);
      revalidatePath("/sales/quotations");
    }
  } else {
    requirePermission(context.membership, "sales_orders", "edit");
    const existing = await findSalesOrderById(salesOrderId, context.activeBusinessId);
    if (!existing) return { error: REASON_MESSAGES.not_found };

    if (existing.status === "draft" && intent !== "draft") {
      result = await finalizeSalesOrderDraft(salesOrderId, context.activeBusinessId, {
        ...parsed.input,
        businessId: context.activeBusinessId,
      });
    } else {
      result = await updateSalesOrder(salesOrderId, context.activeBusinessId, {
        ...parsed.input,
        businessId: context.activeBusinessId,
      });
    }
  }

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/sales/sales-orders");
  redirect(`/sales/sales-orders/${String(result.salesOrder._id)}`);
}

export async function cancelSalesOrderAction(
  _prev: SalesOrderActionState,
  formData: FormData,
): Promise<SalesOrderActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_orders", "edit");
  const salesOrderId = String(formData.get("salesOrderId") ?? "");
  const result = await cancelSalesOrder(salesOrderId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/sales/sales-orders");
  revalidatePath(`/sales/sales-orders/${salesOrderId}`);
  return {};
}

export async function softDeleteSalesOrderAction(
  _prev: SalesOrderActionState,
  formData: FormData,
): Promise<SalesOrderActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_orders", "delete");
  const salesOrderId = String(formData.get("salesOrderId") ?? "");
  const result = await softDeleteSalesOrder(salesOrderId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/sales/sales-orders");
  redirect("/sales/sales-orders");
}

export async function restoreSalesOrderAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "sales_orders", "delete");
  const salesOrderId = String(formData.get("salesOrderId") ?? "");
  if (!salesOrderId) return;
  await restoreSalesOrder(salesOrderId, context.activeBusinessId);
  revalidatePath("/sales/sales-orders");
}
