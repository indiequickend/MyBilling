import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowRightLeft, Download, Pencil } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findQuotationById } from "@/lib/db/queries/quotations";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { Button } from "@/components/ui/button";
import { CancelQuotationButton, DeleteQuotationButton } from "./QuotationActionButtons";

const EDITABLE_STATUSES = ["draft", "open"];
const CANCELLABLE_STATUSES = ["draft", "open"];
const DELETABLE_STATUSES = ["draft", "cancelled"];
const STATUS_LABELS = {
  draft: "Draft",
  open: "Open",
  partial: "Partial",
  closed: "Closed",
  cancelled: "Cancelled",
} as const;
const STATUS_BADGE_VARIANT = {
  draft: "outline",
  open: "warning",
  partial: "warning",
  closed: "success",
  cancelled: "danger",
} as const;

export default async function QuotationDetailLayout({
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

  if (!can(context.membership, "quotations", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view quotations.</p>;
  }

  const quotation = await findQuotationById(id, context.activeBusinessId);
  if (!quotation) notFound();

  const canEdit =
    can(context.membership, "quotations", "edit") && EDITABLE_STATUSES.includes(quotation.status);
  const canCancel =
    can(context.membership, "quotations", "edit") && CANCELLABLE_STATUSES.includes(quotation.status);
  const canDelete =
    can(context.membership, "quotations", "delete") && DELETABLE_STATUSES.includes(quotation.status);
  const canConvertToInvoice =
    quotation.status === "open" && can(context.membership, "sales_invoices", "create");
  const canConvertToSalesOrder =
    quotation.status === "open" && can(context.membership, "sales_orders", "create");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{quotation.docNumber ?? "Draft quotation"}</h1>
            <StatusStamp variant={STATUS_BADGE_VARIANT[quotation.status]} seed={String(quotation._id)}>
              {STATUS_LABELS[quotation.status]}
            </StatusStamp>
          </div>
          <p className="text-sm text-muted-foreground">{quotation.customerSnapshot.displayName}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {quotation.docNumber ? (
            <Button variant="outline" asChild>
              <a href={`/api/sales/quotations/${id}/pdf`}>
                <Download data-icon="inline-start" />
                Download PDF
              </a>
            </Button>
          ) : null}
          {canConvertToInvoice ? (
            <Button asChild>
              <Link href={`/sales/invoices/new?fromQuotation=${id}`}>
                <ArrowRightLeft data-icon="inline-start" />
                Convert to Invoice
              </Link>
            </Button>
          ) : null}
          {canConvertToSalesOrder ? (
            <Button variant="outline" asChild>
              <Link href={`/sales/sales-orders/new?fromQuotation=${id}`}>
                <ArrowRightLeft data-icon="inline-start" />
                Convert to Sales Order
              </Link>
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`/sales/quotations/${id}/edit`}>
                <Pencil data-icon="inline-start" />
                Edit
              </Link>
            </Button>
          ) : null}
          {canCancel ? <CancelQuotationButton quotationId={id} /> : null}
          {canDelete ? <DeleteQuotationButton quotationId={id} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
