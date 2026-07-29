import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listExpenseCategories } from "@/lib/db/queries/expenseCategories";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listVendors } from "@/lib/db/queries/vendors";
import { ExpenseForm } from "../ExpenseForm";

export default async function NewExpensePage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "expenses", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to record expenses.</p>;
  }

  const [categories, bankAccounts, vendors] = await Promise.all([
    listExpenseCategories(context.activeBusinessId, "active"),
    listBankAccounts(context.activeBusinessId, "active"),
    listVendors(context.activeBusinessId, { pageSize: 500 }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New expense</h1>
      <ExpenseForm
        categories={categories.map((c) => ({ id: String(c._id), name: c.name }))}
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        vendors={vendors.items.map((v) => ({
          id: String(v._id),
          label: v.companyName ? `${v.displayName} (${v.companyName})` : v.displayName,
        }))}
      />
    </div>
  );
}
