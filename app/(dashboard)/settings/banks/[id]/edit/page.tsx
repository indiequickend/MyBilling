import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findBankAccountById } from "@/lib/db/queries/bankAccounts";
import { minorToRupeesString } from "@/lib/utils/money";
import { BankAccountForm } from "../../BankAccountForm";

export default async function EditBankAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_banking")) {
    return <p className="text-sm text-red-700">You don&apos;t have permission to edit accounts.</p>;
  }

  const account = await findBankAccountById(id, context.activeBusinessId);
  if (!account) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-slate-900">Edit bank account</h1>
      <BankAccountForm
        mode="edit"
        bankAccountId={String(account._id)}
        defaultValues={{
          type: account.type,
          name: account.name,
          accountHolderName: account.accountHolderName ?? "",
          accountNumber: account.accountNumber ?? "",
          ifsc: account.ifsc ?? "",
          upiId: account.upiId ?? "",
          openingBalance: minorToRupeesString(account.openingBalanceMinor),
        }}
      />
    </div>
  );
}
