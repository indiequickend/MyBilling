import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { BULK_IMPORT_MAX_ROWS } from "@/lib/importExport/bulkImport";
import { BulkUploadForm } from "@/components/importExport/BulkUploadForm";
import { bulkUploadPaymentsAction } from "./actions";

export default async function PaymentsBulkUploadPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "payments", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to import payments.</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-lg font-semibold">Bulk upload payments</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Upload a CSV with one row per payment. Up to {BULK_IMPORT_MAX_ROWS} rows per file. Meant
        for migrating historical payments from another system as unlinked/advance payments (not
        tied to a specific invoice/purchase in this app) — each gets its own receipt/voucher
        number, kept exactly as given. Valid rows are imported even if some rows fail — every
        failed row is listed below with its reason so you can fix and re-upload just those.
      </p>

      <div className="mb-6 max-w-2xl rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="mb-2 font-medium">Required columns</p>
        <p className="text-muted-foreground">
          <code>voucherNumber</code>, <code>direction</code> (in/out), <code>amountMinor</code>,{" "}
          <code>mode</code> (cash/upi/bank_transfer/card/cheque/other),{" "}
          <code>paymentDate</code> (DD-MM-YYYY)
        </p>
        <p className="mt-2 mb-2 font-medium">Optional columns</p>
        <p className="text-muted-foreground">
          <code>partyType</code> (customer/vendor — leave blank for a payment with no party, e.g.
          an expense), <code>partyName</code> (required when <code>partyType</code> is set),{" "}
          <code>bankAccountNumber</code>, <code>bankIfsc</code>, <code>bankName</code>,{" "}
          <code>referenceNote</code>
        </p>
        <p className="mt-2 text-muted-foreground">
          A customer/vendor name that doesn&apos;t exist yet is created automatically. Cash
          payments post to a shared &quot;Cash&quot; account; other payments post to an account
          matched (or created) by the bank account number, falling back to a shared &quot;Imported
          Payments&quot; account when no account number is given.
        </p>
      </div>

      <BulkUploadForm action={bulkUploadPaymentsAction} />
    </div>
  );
}
