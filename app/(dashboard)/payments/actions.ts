"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { editPaymentSchema } from "@/lib/validation/payments";
import { updatePayment, voidPayment, findPaymentById, isPaymentEditable } from "@/lib/db/queries/payments";

export type EditPaymentActionState = { error?: string };
export type VoidPaymentActionState = { error?: string };

const UPDATE_ERROR_MESSAGES: Record<string, string> = {
  not_found: "Payment not found.",
  voided: "This payment has already been voided.",
  not_editable: "This payment can't be edited here.",
  invalid_bank_account: "Select a valid bank account.",
  amount_invalid: "That amount isn't valid for this payment.",
  linked_document_not_found: "The linked document for this payment could not be found.",
};

export async function updatePaymentAction(
  _prev: EditPaymentActionState,
  formData: FormData,
): Promise<EditPaymentActionState> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "payments", "edit")) {
    return { error: "You don't have permission to edit payments." };
  }
  const paymentId = String(formData.get("paymentId") ?? "");

  const parsed = editPaymentSchema.safeParse({
    amountMinor: formData.get("amountMinor"),
    mode: formData.get("mode"),
    bankAccountId: formData.get("bankAccountId"),
    paymentDate: formData.get("paymentDate"),
    referenceNote: formData.get("referenceNote"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Fix the payment." };

  const result = await updatePayment(
    paymentId,
    context.activeBusinessId,
    {
      amountMinor: parsed.data.amountMinor,
      mode: parsed.data.mode,
      bankAccountId: parsed.data.bankAccountId,
      paymentDate: new Date(parsed.data.paymentDate),
      referenceNote: parsed.data.referenceNote,
    },
    context.membership.userId,
  );
  if (!result.ok) return { error: UPDATE_ERROR_MESSAGES[result.reason] };

  revalidatePath("/payments");
  if (result.payment.partyType && result.payment.partyId) {
    revalidatePath(
      `/${result.payment.partyType === "customer" ? "customers" : "vendors"}/${String(result.payment.partyId)}/ledger`,
    );
  }
  redirect("/payments");
}

/** The Payments Timeline's Void (delete) row action — gated the same way updatePaymentAction is,
 * see isPaymentEditable for why Expense/Indirect Income-linked and gateway payments are excluded. */
export async function voidPaymentAction(formData: FormData): Promise<void> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "payments", "delete")) return;
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return;

  const payment = await findPaymentById(paymentId, context.activeBusinessId);
  if (!payment || !isPaymentEditable(payment)) return;

  await voidPayment(paymentId, context.activeBusinessId, context.membership.userId);
  revalidatePath("/payments");
  if (payment.partyType && payment.partyId) {
    revalidatePath(`/${payment.partyType === "customer" ? "customers" : "vendors"}/${String(payment.partyId)}/ledger`);
  }
}
