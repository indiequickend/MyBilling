import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findIndirectIncomeById } from "@/lib/db/queries/indirectIncome";
import { listExpenseCategories } from "@/lib/db/queries/expenseCategories";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listCustomers } from "@/lib/db/queries/customers";
import { minorToRupeesString } from "@/lib/utils/money";
import { IndirectIncomeForm } from "../../IndirectIncomeForm";

const EDITABLE_STATUSES = ["recorded"];

export default async function EditIndirectIncomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "indirect_income", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit indirect income.</p>;
  }

  const entry = await findIndirectIncomeById(id, context.activeBusinessId);
  if (!entry) notFound();
  if (!EDITABLE_STATUSES.includes(entry.status)) {
    redirect(`/indirect-income/${id}`);
  }

  const [categories, bankAccounts, customers] = await Promise.all([
    listExpenseCategories(context.activeBusinessId, "active"),
    listBankAccounts(context.activeBusinessId, "active"),
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit indirect income</h1>
      <IndirectIncomeForm
        mode="edit"
        indirectIncomeId={id}
        categories={categories.map((c) => ({ id: String(c._id), name: c.name }))}
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        customers={customers.items.map((c) => ({
          id: String(c._id),
          label: c.companyName ? `${c.displayName} (${c.companyName})` : c.displayName,
        }))}
        defaultValues={{
          categoryId: String(entry.categoryId),
          amountMinor: minorToRupeesString(entry.amountMinor),
          mode: entry.mode,
          bankAccountId: String(entry.bankAccountId),
          customerId: entry.customerId ? String(entry.customerId) : "",
          sourceName: entry.sourceName ?? "",
          description: entry.description ?? "",
          incomeDate: new Date(entry.incomeDate).toISOString().slice(0, 10),
        }}
      />
    </div>
  );
}
