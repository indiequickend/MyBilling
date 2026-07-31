"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { productCategorySchema } from "@/lib/validation/productCategories";
import {
  createProductCategory,
  updateProductCategory,
  softDeleteProductCategory,
  restoreProductCategory,
} from "@/lib/db/queries/productCategories";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type ProductCategoryFormState = { error?: string };

async function requireProductsPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "products", "edit");
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

export async function createProductCategoryAction(
  _prev: ProductCategoryFormState,
  formData: FormData,
): Promise<ProductCategoryFormState> {
  const context = await requireProductsPermission();
  const parsed = productCategorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await createProductCategory({ businessId: context.activeBusinessId, ...parsed.data });
  revalidatePath("/products/categories");
  return {};
}

export async function updateProductCategoryAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const categoryId = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!categoryId || !name) return;
  await updateProductCategory(categoryId, context.activeBusinessId, { name });
  revalidatePath("/products/categories");
}

export async function softDeleteProductCategoryAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) return;
  const category = await softDeleteProductCategory(categoryId, context.activeBusinessId);
  if (category) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "product_category.deleted",
      target: { type: "product_category", id: categoryId, label: category.name },
    });
  }
  revalidatePath("/products/categories");
}

export async function restoreProductCategoryAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) return;
  const category = await restoreProductCategory(categoryId, context.activeBusinessId);
  if (category) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "product_category.restored",
      target: { type: "product_category", id: categoryId, label: category.name },
    });
  }
  revalidatePath("/products/categories");
}
