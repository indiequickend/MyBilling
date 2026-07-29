import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listExpenseCategories } from "@/lib/db/queries/expenseCategories";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listCustomers } from "@/lib/db/queries/customers";
import { IndirectIncomeForm } from "../IndirectIncomeForm";

export default async function NewIndirectIncomePage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "indirect_income", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to record indirect income.</p>;
  }

  const [categories, bankAccounts, customers] = await Promise.all([
    listExpenseCategories(context.activeBusinessId, "active"),
    listBankAccounts(context.activeBusinessId, "active"),
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New indirect income</h1>
      <IndirectIncomeForm
        categories={categories.map((c) => ({ id: String(c._id), name: c.name }))}
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        customers={customers.items.map((c) => ({
          id: String(c._id),
          label: c.companyName ? `${c.displayName} (${c.companyName})` : c.displayName,
        }))}
      />
    </div>
  );
}
