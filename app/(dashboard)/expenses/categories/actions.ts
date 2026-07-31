"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { expenseCategorySchema } from "@/lib/validation/expenseCategories";
import {
  createExpenseCategory,
  updateExpenseCategory,
  softDeleteExpenseCategory,
  restoreExpenseCategory,
} from "@/lib/db/queries/expenseCategories";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type ExpenseCategoryFormState = { error?: string };

async function requireExpensesPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "expenses", "edit");
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

export async function createExpenseCategoryAction(
  _prev: ExpenseCategoryFormState,
  formData: FormData,
): Promise<ExpenseCategoryFormState> {
  const context = await requireExpensesPermission();
  const parsed = expenseCategorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await createExpenseCategory({ businessId: context.activeBusinessId, ...parsed.data });
  revalidatePath("/expenses/categories");
  return {};
}

export async function updateExpenseCategoryAction(formData: FormData): Promise<void> {
  const context = await requireExpensesPermission();
  const categoryId = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!categoryId || !name) return;
  await updateExpenseCategory(categoryId, context.activeBusinessId, { name });
  revalidatePath("/expenses/categories");
}

export async function softDeleteExpenseCategoryAction(formData: FormData): Promise<void> {
  const context = await requireExpensesPermission();
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) return;
  const category = await softDeleteExpenseCategory(categoryId, context.activeBusinessId);
  if (category) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "expense_category.deleted",
      target: { type: "expense_category", id: categoryId, label: category.name },
    });
  }
  revalidatePath("/expenses/categories");
}

export async function restoreExpenseCategoryAction(formData: FormData): Promise<void> {
  const context = await requireExpensesPermission();
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) return;
  const category = await restoreExpenseCategory(categoryId, context.activeBusinessId);
  if (category) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "expense_category.restored",
      target: { type: "expense_category", id: categoryId, label: category.name },
    });
  }
  revalidatePath("/expenses/categories");
}
