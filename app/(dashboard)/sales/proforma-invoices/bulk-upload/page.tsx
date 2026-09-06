import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { BULK_IMPORT_MAX_ROWS } from "@/lib/importExport/bulkImport";
import { BulkUploadForm } from "@/components/importExport/BulkUploadForm";
import { bulkUploadProformaInvoicesAction } from "./actions";

export default async function ProformaInvoicesBulkUploadPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "proforma_invoices", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to import proforma invoices.</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-lg font-semibold">Bulk upload proforma invoices</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Upload a CSV with one row per proforma invoice. Up to {BULK_IMPORT_MAX_ROWS} rows per
        file. Meant for migrating historical proforma invoices from another system — the number
        you provide is kept exactly as given (not renumbered), and the totals you provide are
        stored exactly as given (not recomputed). Proforma invoices don&apos;t take payments in
        this app, so there&apos;s no payment columns here. Valid rows are imported even if some
        rows fail — every failed row is listed below with its reason so you can fix and re-upload
        just those.
      </p>

      <div className="mb-6 max-w-2xl rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="mb-2 font-medium">Required columns</p>
        <p className="text-muted-foreground">
          <code>docNumber</code>, <code>proformaDate</code> (DD-MM-YYYY),{" "}
          <code>customerName</code>, <code>subtotalMinor</code> (pre-discount taxable amount),{" "}
          <code>totalAmountMinor</code> (grand total)
        </p>
        <p className="mt-2 mb-2 font-medium">Optional columns</p>
        <p className="text-muted-foreground">
          <code>dueDate</code>, <code>customerPhone</code>, <code>customerGstin</code>,{" "}
          <code>placeOfSupplyState</code> (defaults to your business&apos;s own state),{" "}
          <code>referenceNumber</code>, <code>notes</code>, <code>terms</code>,{" "}
          <code>lineItemDescription</code> (default &quot;Imported proforma invoice&quot;),{" "}
          <code>discountAmountMinor</code>, <code>taxAmountMinor</code>
        </p>
        <p className="mt-2 text-muted-foreground">
          A customer name that doesn&apos;t exist yet is created automatically.
        </p>
      </div>

      <BulkUploadForm action={bulkUploadProformaInvoicesAction} />
    </div>
  );
}
