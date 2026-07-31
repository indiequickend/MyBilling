"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { productGroupSchema } from "@/lib/validation/productGroups";
import {
  createProductGroup,
  updateProductGroup,
  softDeleteProductGroup,
  restoreProductGroup,
} from "@/lib/db/queries/productGroups";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type ProductGroupFormState = { error?: string };

async function requireProductsPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "products", "edit");
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

export async function createProductGroupAction(
  _prev: ProductGroupFormState,
  formData: FormData,
): Promise<ProductGroupFormState> {
  const context = await requireProductsPermission();
  const parsed = productGroupSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await createProductGroup({ businessId: context.activeBusinessId, ...parsed.data });
  revalidatePath("/products/groups");
  return {};
}

export async function updateProductGroupAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const groupId = String(formData.get("groupId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!groupId || !name) return;
  await updateProductGroup(groupId, context.activeBusinessId, { name });
  revalidatePath("/products/groups");
}

export async function softDeleteProductGroupAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return;
  const group = await softDeleteProductGroup(groupId, context.activeBusinessId);
  if (group) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "product_group.deleted",
      target: { type: "product_group", id: groupId, label: group.name },
    });
  }
  revalidatePath("/products/groups");
}

export async function restoreProductGroupAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission();
  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return;
  const group = await restoreProductGroup(groupId, context.activeBusinessId);
  if (group) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "product_group.restored",
      target: { type: "product_group", id: groupId, label: group.name },
    });
  }
  revalidatePath("/products/groups");
}
