import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findExpenseById } from "@/lib/db/queries/expenses";
import { listExpenseCategories } from "@/lib/db/queries/expenseCategories";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listVendors } from "@/lib/db/queries/vendors";
import { listProjects } from "@/lib/db/queries/projects";
import { minorToRupeesString } from "@/lib/utils/money";
import { ExpenseForm } from "../../ExpenseForm";

const EDITABLE_STATUSES = ["recorded"];

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "expenses", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit expenses.</p>;
  }

  const expense = await findExpenseById(id, context.activeBusinessId);
  if (!expense) notFound();
  if (!EDITABLE_STATUSES.includes(expense.status)) {
    redirect(`/expenses/${id}`);
  }

  const canViewProjects = can(context.membership, "projects", "view");
  const [categories, bankAccounts, vendors, projects] = await Promise.all([
    listExpenseCategories(context.activeBusinessId, "active"),
    listBankAccounts(context.activeBusinessId, "active"),
    listVendors(context.activeBusinessId, { pageSize: 500 }),
    canViewProjects ? listProjects(context.activeBusinessId, "active") : Promise.resolve(undefined),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit expense</h1>
      <ExpenseForm
        mode="edit"
        expenseId={id}
        categories={categories.map((c) => ({ id: String(c._id), name: c.name }))}
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        vendors={vendors.items.map((v) => ({
          id: String(v._id),
          label: v.companyName ? `${v.displayName} (${v.companyName})` : v.displayName,
        }))}
        projects={projects?.map((p) => ({ id: String(p._id), name: p.name }))}
        defaultValues={{
          categoryId: String(expense.categoryId),
          amountMinor: minorToRupeesString(expense.amountMinor),
          mode: expense.mode,
          bankAccountId: String(expense.bankAccountId),
          vendorId: expense.vendorId ? String(expense.vendorId) : "",
          supplierName: expense.supplierName ?? "",
          supplierGstin: expense.supplierGstin ?? "",
          projectId: expense.projectId ? String(expense.projectId) : "",
          description: expense.description ?? "",
          expenseDate: new Date(expense.expenseDate).toISOString().slice(0, 10),
          tdsApplicable: expense.tdsApplicable,
          tdsSectionCode: expense.tdsSectionCode ?? "",
          tdsRatePercent: expense.tdsRatePercent != null ? String(expense.tdsRatePercent) : "",
          tdsAmountMinor: expense.tdsAmountMinor ? minorToRupeesString(expense.tdsAmountMinor) : "",
          tcsApplicable: expense.tcsApplicable,
          tcsSectionCode: expense.tcsSectionCode ?? "",
          tcsRatePercent: expense.tcsRatePercent != null ? String(expense.tcsRatePercent) : "",
          tcsAmountMinor: expense.tcsAmountMinor ? minorToRupeesString(expense.tcsAmountMinor) : "",
        }}
      />
    </div>
  );
}
