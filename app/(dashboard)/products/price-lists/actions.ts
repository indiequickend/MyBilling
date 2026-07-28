"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { priceListSchema } from "@/lib/validation/priceLists";
import {
  createPriceList,
  updatePriceList,
  setDefaultPriceList,
  softDeletePriceList,
  restorePriceList,
} from "@/lib/db/queries/priceLists";

export type PriceListFormState = { error?: string };

async function requireProductsPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "products", "edit");
  return { activeBusinessId: context.activeBusinessId };
}

export async function createPriceListAction(
  _prev: PriceListFormState,
  formData: FormData,
): Promise<PriceListFormState> {
  const context = await requireProductsPermission();
  const parsed = priceListSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await createPriceList({ businessId: context.activeBusinessId, ...parsed.data });
  revalidatePath("/products/price-lists");
  return {};
}

export async function updatePriceListAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const priceListId = String(formData.get("priceListId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!priceListId || !name) return;
  await updatePriceList(priceListId, context.activeBusinessId, { name });
  revalidatePath("/products/price-lists");
}

export async function setDefaultPriceListAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const priceListId = String(formData.get("priceListId") ?? "");
  if (!priceListId) return;
  await setDefaultPriceList(priceListId, context.activeBusinessId);
  revalidatePath("/products/price-lists");
}

export async function softDeletePriceListAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const priceListId = String(formData.get("priceListId") ?? "");
  if (!priceListId) return;
  await softDeletePriceList(priceListId, context.activeBusinessId);
  revalidatePath("/products/price-lists");
}

export async function restorePriceListAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const priceListId = String(formData.get("priceListId") ?? "");
  if (!priceListId) return;
  await restorePriceList(priceListId, context.activeBusinessId);
  revalidatePath("/products/price-lists");
}
