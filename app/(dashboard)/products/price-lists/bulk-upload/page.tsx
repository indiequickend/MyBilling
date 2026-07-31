import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { BULK_IMPORT_MAX_ROWS } from "@/lib/importExport/bulkImport";
import { BulkUploadForm } from "@/components/importExport/BulkUploadForm";
import { bulkUploadPriceListsAction } from "./actions";

export default async function PriceListsBulkUploadPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to import price lists.</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-lg font-semibold">Bulk upload price lists</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Upload a CSV with one price list per row. Up to {BULK_IMPORT_MAX_ROWS} rows per file. Valid
        rows are imported even if some rows fail — every failed row is listed below with its reason so
        you can fix and re-upload just those.
      </p>

      <div className="mb-6 max-w-2xl rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="mb-2 font-medium">Required columns</p>
        <p className="text-muted-foreground">
          <code>name</code>
        </p>
        <p className="mt-2 mb-2 font-medium">Optional columns</p>
        <p className="text-muted-foreground">
          <code>description</code>
        </p>
      </div>

      <BulkUploadForm action={bulkUploadPriceListsAction} />
    </div>
  );
}
