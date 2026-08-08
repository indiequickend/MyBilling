import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findPaymentById, isPaymentEditable } from "@/lib/db/queries/payments";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { minorToRupeesString } from "@/lib/utils/money";
import { EditPaymentForm } from "@/components/payments/EditPaymentForm";

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "payments", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit payments.</p>;
  }

  const [payment, bankAccounts] = await Promise.all([
    findPaymentById(id, context.activeBusinessId),
    listBankAccounts(context.activeBusinessId, "active"),
  ]);
  if (!payment || payment.voidedAt) notFound();
  if (!isPaymentEditable(payment)) {
    return (
      <p className="text-sm text-destructive">
        This payment can&apos;t be edited here — manage it from the linked record instead.
      </p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit payment</h1>
      <EditPaymentForm
        paymentId={String(payment._id)}
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        defaultValues={{
          amountMinor: minorToRupeesString(payment.amountMinor),
          mode: payment.mode,
          bankAccountId: String(payment.bankAccountId),
          paymentDate: payment.paymentDate.toISOString().slice(0, 10),
          referenceNote: payment.referenceNote ?? "",
        }}
      />
    </div>
  );
}
