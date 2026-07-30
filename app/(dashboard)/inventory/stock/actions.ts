"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { stockAdjustmentSchema, parseSerialNumbersText } from "@/lib/validation/inventory";
import {
  recordManualStockMovement,
  type ManualStockMovementResult,
} from "@/lib/db/queries/stockLedger";

export type StockMovementFormState = { error?: string; fieldErrors?: Record<string, string> };

async function requireInventoryPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "inventory", "edit");
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

const REASON_MESSAGES: Record<Exclude<ManualStockMovementResult, { ok: true }>["reason"], string> = {
  product_not_found: "Select a valid product.",
  invalid_warehouse: "Select a valid warehouse.",
  not_stock_tracked: "This product doesn't have stock tracking enabled.",
  batch_required: "Select an existing batch or enter a new batch number.",
  invalid_batch: "That batch doesn't belong to this product.",
  serials_required: "Enter the serial numbers being moved.",
  serial_count_mismatch: "The number of serial numbers must match the quantity.",
  insufficient_stock: "Not enough stock available for this Stock Out.",
};

export async function recordStockMovementAction(
  _prev: StockMovementFormState,
  formData: FormData,
): Promise<StockMovementFormState> {
  const context = await requireInventoryPermission();

  // formData.get(...) returns null (not "") for a field that's absent from the DOM entirely —
  // e.g. batchId/newBatchNumber/serialNumbersText when the product isn't batch/serial-tracked, so
  // those inputs never render. The validation schemas only accept string | undefined, so every
  // value must be coerced through `?? ""` here rather than passed through raw.
  const parsed = stockAdjustmentSchema.safeParse({
    productId: formData.get("productId") ?? "",
    variantId: formData.get("variantId") ?? "",
    warehouseId: formData.get("warehouseId") ?? "",
    direction: formData.get("direction") ?? "",
    quantity: formData.get("quantity") ?? "",
    batchId: formData.get("batchId") ?? "",
    newBatchNumber: formData.get("newBatchNumber") ?? "",
    newBatchExpiryDate: formData.get("newBatchExpiryDate") ?? "",
    serialNumbersText: formData.get("serialNumbersText") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const d = parsed.data;

  const result = await recordManualStockMovement({
    businessId: context.activeBusinessId,
    productId: d.productId,
    variantId: d.variantId,
    warehouseId: d.warehouseId,
    direction: d.direction,
    quantity: d.quantity,
    batchId: d.batchId,
    newBatch: d.newBatchNumber ? { batchNumber: d.newBatchNumber, expiryDate: d.newBatchExpiryDate ? new Date(d.newBatchExpiryDate) : undefined } : undefined,
    serialNumbers: d.serialNumbersText ? parseSerialNumbersText(d.serialNumbersText) : undefined,
    note: d.note,
    createdByUserId: context.userId,
  });

  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/timeline");
  revalidatePath("/");
  redirect("/inventory/timeline");
}
