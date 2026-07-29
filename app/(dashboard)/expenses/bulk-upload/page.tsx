import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { EXPENSE_BULK_UPLOAD_MAX_ROWS } from "@/lib/validation/expenses";
import { PAYMENT_MODES } from "@/lib/constants/payments";
import { BulkUploadForm } from "./BulkUploadForm";

export default async function ExpensesBulkUploadPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "expenses", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to import expenses.</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-lg font-semibold">Bulk upload expenses</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Upload a CSV with one expense per row. Up to {EXPENSE_BULK_UPLOAD_MAX_ROWS} rows per file — for
        larger imports, split the file. Every row is validated before anything is saved: if any row
        fails, nothing is imported and every problem row is listed so you can fix and re-upload.
      </p>

      <div className="mb-6 max-w-2xl rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="mb-2 font-medium">Required columns</p>
        <p className="text-muted-foreground">
          <code>categoryName</code>, <code>amountMinor</code> (e.g. &quot;1250.00&quot;), <code>mode</code> (
          {PAYMENT_MODES.join(", ")}), <code>bankAccountName</code>, <code>expenseDate</code> (YYYY-MM-DD)
        </p>
        <p className="mt-2 mb-2 font-medium">Optional columns</p>
        <p className="text-muted-foreground">
          <code>supplierName</code>, <code>supplierGstin</code>, <code>description</code>
        </p>
        <p className="mt-2 text-muted-foreground">
          A category name that doesn&apos;t exist yet is created automatically. The bank/cash account
          name must match an existing account exactly (see Settings → Banks).
        </p>
      </div>

      <BulkUploadForm />
    </div>
  );
}
