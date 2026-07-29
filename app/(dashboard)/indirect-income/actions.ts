"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { indirectIncomeHeaderSchema } from "@/lib/validation/indirectIncome";
import {
  createIndirectIncome,
  cancelIndirectIncome,
  softDeleteIndirectIncome,
  restoreIndirectIncome,
  type IndirectIncomeWriteFailureReason,
} from "@/lib/db/queries/indirectIncome";

export type IndirectIncomeFormState = { error?: string; fieldErrors?: Record<string, string> };
export type IndirectIncomeActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<IndirectIncomeWriteFailureReason, string> = {
  invalid_category: "Select a valid category.",
  invalid_bank_account: "Select a valid bank account.",
  invalid_customer: "Select a valid customer.",
  not_found: "Indirect income entry not found.",
  not_cancellable: "This entry can't be cancelled.",
  not_deletable: "Only cancelled entries can be deleted.",
};

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

export async function saveIndirectIncomeAction(
  _prev: IndirectIncomeFormState,
  formData: FormData,
): Promise<IndirectIncomeFormState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "indirect_income", "create");

  const parsed = indirectIncomeHeaderSchema.safeParse({
    categoryId: formData.get("categoryId"),
    amountMinor: formData.get("amountMinor"),
    mode: formData.get("mode"),
    bankAccountId: formData.get("bankAccountId"),
    customerId: formData.get("customerId"),
    sourceName: formData.get("sourceName"),
    description: formData.get("description"),
    incomeDate: formData.get("incomeDate"),
  });
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const h = parsed.data;
  const result = await createIndirectIncome({
    businessId: context.activeBusinessId,
    categoryId: h.categoryId,
    amountMinor: h.amountMinor,
    mode: h.mode,
    bankAccountId: h.bankAccountId,
    customerId: h.customerId,
    sourceName: h.sourceName,
    description: h.description,
    incomeDate: new Date(h.incomeDate),
    createdByUserId: context.membership.userId,
  });
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/indirect-income");
  redirect(`/indirect-income/${String(result.indirectIncome._id)}`);
}

export async function cancelIndirectIncomeAction(
  _prev: IndirectIncomeActionState,
  formData: FormData,
): Promise<IndirectIncomeActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "indirect_income", "edit");
  const indirectIncomeId = String(formData.get("indirectIncomeId") ?? "");
  const result = await cancelIndirectIncome(indirectIncomeId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/indirect-income");
  revalidatePath(`/indirect-income/${indirectIncomeId}`);
  return {};
}

export async function softDeleteIndirectIncomeAction(
  _prev: IndirectIncomeActionState,
  formData: FormData,
): Promise<IndirectIncomeActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "indirect_income", "delete");
  const indirectIncomeId = String(formData.get("indirectIncomeId") ?? "");
  const result = await softDeleteIndirectIncome(indirectIncomeId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/indirect-income");
  redirect("/indirect-income");
}

export async function restoreIndirectIncomeAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "indirect_income", "delete");
  const indirectIncomeId = String(formData.get("indirectIncomeId") ?? "");
  if (!indirectIncomeId) return;
  await restoreIndirectIncome(indirectIncomeId, context.activeBusinessId);
  revalidatePath("/indirect-income");
}
