"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { expenseHeaderSchema } from "@/lib/validation/expenses";
import {
  createExpense,
  cancelExpense,
  softDeleteExpense,
  restoreExpense,
  attachExpenseReceipt,
  type ExpenseWriteFailureReason,
} from "@/lib/db/queries/expenses";
import { createAttachment } from "@/lib/db/queries/attachments";
import { uploadFile } from "@/lib/storage/cloudinary";
import { detectAttachmentMimeType } from "@/lib/storage/imageMime";

export type ExpenseFormState = { error?: string; fieldErrors?: Record<string, string> };
export type ExpenseActionState = { error?: string };

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

const REASON_MESSAGES: Record<ExpenseWriteFailureReason, string> = {
  invalid_category: "Select a valid category.",
  invalid_bank_account: "Select a valid bank account.",
  invalid_vendor: "Select a valid vendor.",
  not_found: "Expense not found.",
  not_cancellable: "This expense can't be cancelled.",
  not_deletable: "Only cancelled expenses can be deleted.",
};

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

export async function saveExpenseAction(
  _prev: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "expenses", "create");

  const parsed = expenseHeaderSchema.safeParse({
    categoryId: formData.get("categoryId"),
    amountMinor: formData.get("amountMinor"),
    mode: formData.get("mode"),
    bankAccountId: formData.get("bankAccountId"),
    vendorId: formData.get("vendorId"),
    supplierName: formData.get("supplierName"),
    supplierGstin: formData.get("supplierGstin"),
    description: formData.get("description"),
    expenseDate: formData.get("expenseDate"),
  });
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const h = parsed.data;
  const result = await createExpense({
    businessId: context.activeBusinessId,
    categoryId: h.categoryId,
    amountMinor: h.amountMinor,
    mode: h.mode,
    bankAccountId: h.bankAccountId,
    vendorId: h.vendorId,
    supplierName: h.supplierName,
    supplierGstin: h.supplierGstin,
    description: h.description,
    expenseDate: new Date(h.expenseDate),
    createdByUserId: context.membership.userId,
  });
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  const receipt = formData.get("receipt");
  if (receipt instanceof File && receipt.size > 0) {
    const buffer = Buffer.from(await receipt.arrayBuffer());
    const mimeType = detectAttachmentMimeType(buffer);
    if (mimeType) {
      const uploaded = await uploadFile(buffer, mimeType, {
        folder: `businesses/${context.activeBusinessId}/expenses`,
      });
      const attachment = await createAttachment({
        businessId: context.activeBusinessId,
        linkedDocumentType: "expense",
        linkedDocumentId: String(result.expense._id),
        fileName: receipt.name,
        publicId: uploaded.publicId,
        url: uploaded.url,
        mimeType,
        bytes: uploaded.bytes,
        uploadedByUserId: context.membership.userId,
      });
      await attachExpenseReceipt(String(result.expense._id), context.activeBusinessId, String(attachment._id));
    }
  }

  revalidatePath("/expenses");
  redirect(`/expenses/${String(result.expense._id)}`);
}

export async function cancelExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "expenses", "edit");
  const expenseId = String(formData.get("expenseId") ?? "");
  const result = await cancelExpense(expenseId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/expenses");
  revalidatePath(`/expenses/${expenseId}`);
  return {};
}

export async function softDeleteExpenseAction(
  _prev: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "expenses", "delete");
  const expenseId = String(formData.get("expenseId") ?? "");
  const result = await softDeleteExpense(expenseId, context.activeBusinessId);
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };
  revalidatePath("/expenses");
  redirect("/expenses");
}

export async function restoreExpenseAction(formData: FormData): Promise<void> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "expenses", "delete");
  const expenseId = String(formData.get("expenseId") ?? "");
  if (!expenseId) return;
  await restoreExpense(expenseId, context.activeBusinessId);
  revalidatePath("/expenses");
}
