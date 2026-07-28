"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { warehouseSchema } from "@/lib/validation/warehouses";
import { parseAddressFromFormData } from "@/lib/validation/shared";
import {
  createWarehouse,
  updateWarehouse,
  setDefaultWarehouse,
  softDeleteWarehouse,
  restoreWarehouse,
} from "@/lib/db/queries/warehouses";

export type WarehouseFormState = { error?: string; fieldErrors?: Record<string, string> };

async function requireInventoryPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "inventory", "edit");
  return { activeBusinessId: context.activeBusinessId };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

export async function createWarehouseAction(
  _prev: WarehouseFormState,
  formData: FormData,
): Promise<WarehouseFormState> {
  const context = await requireInventoryPermission();

  const parsed = warehouseSchema.safeParse({
    name: formData.get("name"),
    address: parseAddressFromFormData(formData, "address"),
  });
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  await createWarehouse({ businessId: context.activeBusinessId, ...parsed.data });
  revalidatePath("/inventory/warehouses");
  redirect("/inventory/warehouses");
}

export async function updateWarehouseAction(
  _prev: WarehouseFormState,
  formData: FormData,
): Promise<WarehouseFormState> {
  const context = await requireInventoryPermission();
  const warehouseId = String(formData.get("warehouseId") ?? "");

  const parsed = warehouseSchema.safeParse({
    name: formData.get("name"),
    address: parseAddressFromFormData(formData, "address"),
  });
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  await updateWarehouse(warehouseId, context.activeBusinessId, parsed.data);
  revalidatePath("/inventory/warehouses");
  redirect("/inventory/warehouses");
}

export async function setDefaultWarehouseAction(formData: FormData): Promise<void> {
  const context = await requireInventoryPermission();
  const warehouseId = String(formData.get("warehouseId") ?? "");
  if (!warehouseId) return;
  await setDefaultWarehouse(warehouseId, context.activeBusinessId);
  revalidatePath("/inventory/warehouses");
}

export async function softDeleteWarehouseAction(formData: FormData): Promise<void> {
  const context = await requireInventoryPermission();
  const warehouseId = String(formData.get("warehouseId") ?? "");
  if (!warehouseId) return;
  await softDeleteWarehouse(warehouseId, context.activeBusinessId);
  revalidatePath("/inventory/warehouses");
}

export async function restoreWarehouseAction(formData: FormData): Promise<void> {
  const context = await requireInventoryPermission();
  const warehouseId = String(formData.get("warehouseId") ?? "");
  if (!warehouseId) return;
  await restoreWarehouse(warehouseId, context.activeBusinessId);
  revalidatePath("/inventory/warehouses");
}
