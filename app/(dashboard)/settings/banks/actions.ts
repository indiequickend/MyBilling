"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { bankAccountSchema } from "@/lib/validation/bankAccounts";
import { bankTransferSchema } from "@/lib/validation/bankTransfers";
import {
  createBankAccount,
  updateBankAccount,
  setDefaultBankAccount,
  softDeleteBankAccount,
  restoreBankAccount,
  findBankAccountById,
  transferFunds,
} from "@/lib/db/queries/bankAccounts";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type BankAccountFormState = { error?: string; fieldErrors?: Record<string, string> };
export type TransferFundsFormState = { error?: string; success?: string };

async function requireBankingPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_banking");
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

function parseBankAccountForm(formData: FormData) {
  return bankAccountSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    accountHolderName: formData.get("accountHolderName"),
    accountNumber: formData.get("accountNumber"),
    ifsc: formData.get("ifsc"),
    upiId: formData.get("upiId"),
    openingBalanceMinor: formData.get("openingBalanceMinor"),
  });
}

export async function createBankAccountAction(
  _prev: BankAccountFormState,
  formData: FormData,
): Promise<BankAccountFormState> {
  const context = await requireBankingPermission();

  const parsed = parseBankAccountForm(formData);
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await createBankAccount({ businessId: context.activeBusinessId, ...parsed.data });
  revalidatePath("/settings/banks");
  redirect("/settings/banks");
}

export async function updateBankAccountAction(
  _prev: BankAccountFormState,
  formData: FormData,
): Promise<BankAccountFormState> {
  const context = await requireBankingPermission();
  const bankAccountId = String(formData.get("bankAccountId") ?? "");

  const parsed = parseBankAccountForm(formData);
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await updateBankAccount(bankAccountId, context.activeBusinessId, parsed.data);
  revalidatePath("/settings/banks");
  redirect("/settings/banks");
}

export async function setDefaultBankAccountAction(formData: FormData): Promise<void> {
  const context = await requireBankingPermission();
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!bankAccountId) return;
  await setDefaultBankAccount(bankAccountId, context.activeBusinessId);
  revalidatePath("/settings/banks");
}

export type DeleteBankAccountState = { error?: string };

export async function softDeleteBankAccountAction(
  _prev: DeleteBankAccountState,
  formData: FormData,
): Promise<DeleteBankAccountState> {
  const context = await requireBankingPermission();
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!bankAccountId) return {};
  const account = await findBankAccountById(bankAccountId, context.activeBusinessId);
  const result = await softDeleteBankAccount(bankAccountId, context.activeBusinessId);
  if (!result.ok) {
    return {
      error:
        result.reason === "in_use"
          ? "This account is referenced by existing invoices, payments, or transfers and can't be deleted."
          : "Account not found.",
    };
  }
  await recordAuditLog({
    businessId: context.activeBusinessId,
    userId: context.userId,
    action: "bank_account.deleted",
    target: { type: "bank_account", id: bankAccountId, label: account?.name },
  });
  revalidatePath("/settings/banks");
  return {};
}

export async function restoreBankAccountAction(formData: FormData): Promise<void> {
  const context = await requireBankingPermission();
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!bankAccountId) return;
  const account = await restoreBankAccount(bankAccountId, context.activeBusinessId);
  if (account) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "bank_account.restored",
      target: { type: "bank_account", id: bankAccountId, label: account.name },
    });
  }
  revalidatePath("/settings/banks");
}

export async function transferFundsAction(
  _prev: TransferFundsFormState,
  formData: FormData,
): Promise<TransferFundsFormState> {
  const context = await requireBankingPermission();

  const parsed = bankTransferSchema.safeParse({
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    amountMinor: formData.get("amountMinor"),
    transferDate: formData.get("transferDate"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await transferFunds({
    businessId: context.activeBusinessId,
    fromAccountId: parsed.data.fromAccountId,
    toAccountId: parsed.data.toAccountId,
    amountMinor: parsed.data.amountMinor,
    transferDate: new Date(parsed.data.transferDate),
    note: parsed.data.note,
    createdByUserId: context.userId,
  });
  if (!result.ok) {
    return {
      error:
        result.reason === "same_account"
          ? "Choose two different accounts."
          : "One of the selected accounts is invalid.",
    };
  }

  revalidatePath("/settings/banks");
  return { success: "Funds transferred." };
}
