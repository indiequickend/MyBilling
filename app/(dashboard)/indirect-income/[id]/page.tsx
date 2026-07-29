import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findIndirectIncomeById } from "@/lib/db/queries/indirectIncome";
import { findExpenseCategoryById } from "@/lib/db/queries/expenseCategories";
import { minorToRupeesString } from "@/lib/utils/money";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CancelIndirectIncomeButton, DeleteIndirectIncomeButton } from "./IndirectIncomeActionButtons";

export default async function IndirectIncomeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "indirect_income", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view indirect income.</p>;
  }

  const entry = await findIndirectIncomeById(id, context.activeBusinessId);
  if (!entry) notFound();

  const category = await findExpenseCategoryById(String(entry.categoryId), context.activeBusinessId);

  const canCancel = can(context.membership, "indirect_income", "edit") && entry.status === "recorded";
  const canDelete = can(context.membership, "indirect_income", "delete") && entry.status === "cancelled";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">₹{minorToRupeesString(entry.amountMinor)}</h1>
            <Badge variant={entry.status === "cancelled" ? "danger" : "success"}>
              {entry.status === "cancelled" ? "Cancelled" : "Recorded"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{category?.name ?? "Uncategorized"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCancel ? <CancelIndirectIncomeButton indirectIncomeId={id} /> : null}
          {canDelete ? <DeleteIndirectIncomeButton indirectIncomeId={id} /> : null}
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{new Date(entry.incomeDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mode</p>
              <p className="font-medium">{PAYMENT_MODE_LABELS[entry.mode]}</p>
            </div>
            {entry.sourceName ? (
              <div>
                <p className="text-sm text-muted-foreground">Source</p>
                <p className="font-medium">{entry.sourceName}</p>
              </div>
            ) : null}
            {entry.description ? (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="font-medium">{entry.description}</p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
