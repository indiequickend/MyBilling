import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Download, Pencil } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { resolveInvoiceStatusDisplay } from "@/lib/constants/invoices";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { Button } from "@/components/ui/button";
import { CancelInvoiceButton, DeleteInvoiceButton } from "./InvoiceActionButtons";

const EDITABLE_STATUSES = ["draft", "pending", "partially_paid"];
const CANCELLABLE_STATUSES = ["draft", "pending", "partially_paid"];
const DELETABLE_STATUSES = ["draft", "cancelled"];

export default async function InvoiceDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_invoices", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view invoices.</p>;
  }

  const invoice = await findInvoiceById(id, context.activeBusinessId);
  if (!invoice) notFound();

  const statusDisplay = resolveInvoiceStatusDisplay(invoice.status, invoice.dueDate);

  const canEdit = can(context.membership, "sales_invoices", "edit") && EDITABLE_STATUSES.includes(invoice.status);
  const canCancel =
    can(context.membership, "sales_invoices", "edit") && CANCELLABLE_STATUSES.includes(invoice.status);
  const canDelete =
    can(context.membership, "sales_invoices", "delete") && DELETABLE_STATUSES.includes(invoice.status);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{invoice.docNumber ?? "Draft invoice"}</h1>
            <StatusStamp variant={statusDisplay.variant} seed={String(invoice._id)}>
              {statusDisplay.label}
            </StatusStamp>
          </div>
          <p className="text-sm text-muted-foreground">{invoice.customerSnapshot.displayName}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {invoice.docNumber ? (
            <Button variant="outline" asChild>
              <a href={`/api/sales/invoices/${id}/pdf`}>
                <Download data-icon="inline-start" />
                Download PDF
              </a>
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`/sales/invoices/${id}/edit`}>
                <Pencil data-icon="inline-start" />
                Edit
              </Link>
            </Button>
          ) : null}
          {canCancel ? <CancelInvoiceButton invoiceId={id} /> : null}
          {canDelete ? <DeleteInvoiceButton invoiceId={id} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
