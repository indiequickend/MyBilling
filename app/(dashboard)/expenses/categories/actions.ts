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

export type ExpenseCategoryFormState = { error?: string };

async function requireExpensesPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "expenses", "edit");
  return { activeBusinessId: context.activeBusinessId };
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
  await softDeleteExpenseCategory(categoryId, context.activeBusinessId);
  revalidatePath("/expenses/categories");
}

export async function restoreExpenseCategoryAction(formData: FormData): Promise<void> {
  const context = await requireExpensesPermission();
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) return;
  await restoreExpenseCategory(categoryId, context.activeBusinessId);
  revalidatePath("/expenses/categories");
}
