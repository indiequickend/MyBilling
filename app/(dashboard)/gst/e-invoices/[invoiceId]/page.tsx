import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { findEInvoiceDataByInvoice } from "@/lib/db/queries/eInvoiceData";
import { GenerateEInvoiceForm, EInvoiceStatusOverrideForm } from "@/components/gst/EInvoiceActions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT = {
  success: "success",
  pending: "outline",
  failed: "danger",
  cancelled: "warning",
} as const;

export default async function EInvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "gst", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const invoice = await findInvoiceById(invoiceId, context.activeBusinessId);
  if (!invoice) notFound();

  const eInvoiceData = await findEInvoiceDataByInvoice(invoiceId, context.activeBusinessId);
  const canEdit = can(context.membership, "gst", "edit");
  const canExport = can(context.membership, "gst", "export");
  const status = eInvoiceData?.validationStatus ?? "pending";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">E-Invoice — {invoice.docNumber ?? "Draft"}</h1>
          <p className="text-sm text-muted-foreground">{invoice.customerSnapshot.displayName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
          {canExport && eInvoiceData?.generatedPayload ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/api/gst/e-invoices/${invoiceId}/json`}>
                <Download data-icon="inline-start" />
                Download JSON
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {!invoice.eInvoiceFlag ? (
        <p className="text-sm text-destructive">E-invoicing is not enabled for this invoice.</p>
      ) : canEdit ? (
        <div className="flex flex-wrap items-start gap-4">
          <GenerateEInvoiceForm invoiceId={invoiceId} />
          <EInvoiceStatusOverrideForm invoiceId={invoiceId} />
        </div>
      ) : null}

      {eInvoiceData?.validationErrors && eInvoiceData.validationErrors.length > 0 ? (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium">Validation errors:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {eInvoiceData.validationErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
