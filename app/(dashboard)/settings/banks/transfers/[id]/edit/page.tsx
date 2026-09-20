import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { objectId } from "@/lib/validation/shared";
import { findBankTransferById, listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { minorToRupeesString } from "@/lib/utils/money";
import { TransferFundsForm } from "../../../TransferFundsForm";

export default async function EditBankTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_banking")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit transfers.</p>;
  }
  if (!objectId.safeParse(id).success) notFound();

  const [transfer, accounts] = await Promise.all([
    findBankTransferById(id, context.activeBusinessId),
    listBankAccounts(context.activeBusinessId, "active"),
  ]);
  if (!transfer) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit transfer</h1>
      <TransferFundsForm
        accounts={accounts.map((a) => ({ id: String(a._id), name: a.name }))}
        transfer={{
          id: String(transfer._id),
          fromAccountId: String(transfer.fromAccountId),
          toAccountId: String(transfer.toAccountId),
          amount: minorToRupeesString(transfer.amountMinor),
          transferDate: transfer.transferDate.toISOString().slice(0, 10),
          note: transfer.note ?? "",
        }}
      />
    </div>
  );
}
