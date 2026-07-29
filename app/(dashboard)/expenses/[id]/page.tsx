import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findExpenseById } from "@/lib/db/queries/expenses";
import { findExpenseCategoryById } from "@/lib/db/queries/expenseCategories";
import { findAttachmentById } from "@/lib/db/queries/attachments";
import { minorToRupeesString } from "@/lib/utils/money";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CancelExpenseButton, DeleteExpenseButton } from "./ExpenseActionButtons";

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "expenses", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view expenses.</p>;
  }

  const expense = await findExpenseById(id, context.activeBusinessId);
  if (!expense) notFound();

  const [category, receipt] = await Promise.all([
    findExpenseCategoryById(String(expense.categoryId), context.activeBusinessId),
    expense.receiptAttachmentId
      ? findAttachmentById(String(expense.receiptAttachmentId), context.activeBusinessId)
      : null,
  ]);

  const canCancel = can(context.membership, "expenses", "edit") && expense.status === "recorded";
  const canDelete = can(context.membership, "expenses", "delete") && expense.status === "cancelled";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">₹{minorToRupeesString(expense.amountMinor)}</h1>
            <Badge variant={expense.status === "cancelled" ? "danger" : "success"}>
              {expense.status === "cancelled" ? "Cancelled" : "Recorded"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{category?.name ?? "Uncategorized"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCancel ? <CancelExpenseButton expenseId={id} /> : null}
          {canDelete ? <DeleteExpenseButton expenseId={id} /> : null}
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{new Date(expense.expenseDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mode</p>
              <p className="font-medium">{PAYMENT_MODE_LABELS[expense.mode]}</p>
            </div>
            {expense.supplierName ? (
              <div>
                <p className="text-sm text-muted-foreground">Supplier</p>
                <p className="font-medium">{expense.supplierName}</p>
              </div>
            ) : null}
            {expense.supplierGstin ? (
              <div>
                <p className="text-sm text-muted-foreground">Supplier GSTIN</p>
                <p className="font-medium">{expense.supplierGstin}</p>
              </div>
            ) : null}
            {expense.description ? (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="font-medium">{expense.description}</p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {receipt ? (
        <Card>
          <CardContent>
            <p className="mb-1 text-sm font-medium">Receipt</p>
            <a href={receipt.url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
              {receipt.fileName}
            </a>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
