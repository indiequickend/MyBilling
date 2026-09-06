import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { BULK_IMPORT_MAX_ROWS } from "@/lib/importExport/bulkImport";
import { BulkUploadForm } from "@/components/importExport/BulkUploadForm";
import { bulkUploadInvoicesAction } from "./actions";

export default async function InvoicesBulkUploadPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_invoices", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to import invoices.</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-lg font-semibold">Bulk upload invoices</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Upload a CSV with one row per invoice, or one row per payment for invoices with several
        payments. Up to {BULK_IMPORT_MAX_ROWS} rows per file. Meant for migrating historical
        invoices from another system — the invoice number you provide is kept exactly as given
        (not renumbered), and the totals you provide are stored exactly as given (not recomputed).
        Valid rows are imported even if some rows fail — every failed row is listed below with its
        reason so you can fix and re-upload just those.
      </p>

      <div className="mb-6 max-w-2xl rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="mb-2 font-medium">Required columns</p>
        <p className="text-muted-foreground">
          <code>docNumber</code>, <code>invoiceDate</code> (YYYY-MM-DD), <code>customerName</code>,{" "}
          <code>subtotalMinor</code> (pre-discount taxable amount, e.g. &quot;19200.00&quot;),{" "}
          <code>totalAmountMinor</code> (grand total, e.g. &quot;20000.00&quot;)
        </p>
        <p className="mt-2 mb-2 font-medium">Optional columns</p>
        <p className="text-muted-foreground">
          <code>dueDate</code>, <code>customerPhone</code>, <code>customerGstin</code>,{" "}
          <code>placeOfSupplyState</code> (defaults to your business&apos;s own state),{" "}
          <code>referenceNumber</code>, <code>notes</code>, <code>terms</code>,{" "}
          <code>lineItemDescription</code> (default &quot;Imported invoice&quot;),{" "}
          <code>discountAmountMinor</code>, <code>taxAmountMinor</code>
        </p>
        <p className="mt-2 mb-2 font-medium">Payments</p>
        <p className="text-muted-foreground">
          To record payments already made against an invoice, use one row per payment and repeat
          the same <code>docNumber</code> on each of those rows — rows sharing a{" "}
          <code>docNumber</code> are combined into one invoice instead of becoming separate ones.
          On each payment row, fill in <code>paymentAmountMinor</code>, <code>paymentMode</code>{" "}
          (cash/upi/bank_transfer/card/cheque/other), and <code>paymentDate</code>, plus optionally{" "}
          <code>paymentBankAccountNumber</code>, <code>paymentBankIfsc</code>,{" "}
          <code>paymentBankName</code>, and <code>paymentReferenceNote</code>. Invoice-level
          columns only need to be filled in on one of the rows for that invoice — the rest can be
          left blank. Rows with no <code>paymentAmountMinor</code> import as invoices with no
          recorded payments.
        </p>
        <p className="mt-2 text-muted-foreground">
          A customer name that doesn&apos;t exist yet is created automatically. Cash payments post
          to a shared &quot;Cash&quot; account; other payments post to an account matched (or
          created) by the bank account number, falling back to a shared &quot;Imported
          Payments&quot; account when no account number is given.
        </p>
      </div>

      <BulkUploadForm action={bulkUploadInvoicesAction} />
    </div>
  );
}
