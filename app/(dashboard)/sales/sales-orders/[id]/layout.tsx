import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowRightLeft, Download, Pencil } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findSalesOrderById } from "@/lib/db/queries/salesOrders";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { Button } from "@/components/ui/button";
import { CancelSalesOrderButton, DeleteSalesOrderButton } from "./SalesOrderActionButtons";

const EDITABLE_STATUSES = ["draft", "open"];
const CANCELLABLE_STATUSES = ["draft", "open"];
const DELETABLE_STATUSES = ["draft", "cancelled"];
const STATUS_LABELS = { draft: "Draft", open: "Open", closed: "Closed", cancelled: "Cancelled" } as const;
const STATUS_BADGE_VARIANT = {
  draft: "outline",
  open: "warning",
  closed: "success",
  cancelled: "danger",
} as const;

export default async function SalesOrderDetailLayout({
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

  if (!can(context.membership, "sales_orders", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view sales orders.</p>;
  }

  const salesOrder = await findSalesOrderById(id, context.activeBusinessId);
  if (!salesOrder) notFound();

  const canEdit =
    can(context.membership, "sales_orders", "edit") && EDITABLE_STATUSES.includes(salesOrder.status);
  const canCancel =
    can(context.membership, "sales_orders", "edit") && CANCELLABLE_STATUSES.includes(salesOrder.status);
  const canDelete =
    can(context.membership, "sales_orders", "delete") && DELETABLE_STATUSES.includes(salesOrder.status);
  const canConvert = salesOrder.status === "open" && can(context.membership, "sales_invoices", "create");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{salesOrder.docNumber ?? "Draft sales order"}</h1>
            <StatusStamp variant={STATUS_BADGE_VARIANT[salesOrder.status]} seed={String(salesOrder._id)}>
              {STATUS_LABELS[salesOrder.status]}
            </StatusStamp>
          </div>
          <p className="text-sm text-muted-foreground">{salesOrder.customerSnapshot.displayName}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {salesOrder.docNumber ? (
            <Button variant="outline" asChild>
              <a href={`/api/sales/sales-orders/${id}/pdf`}>
                <Download data-icon="inline-start" />
                Download PDF
              </a>
            </Button>
          ) : null}
          {canConvert ? (
            <Button asChild>
              <Link href={`/sales/invoices/new?fromSalesOrder=${id}`}>
                <ArrowRightLeft data-icon="inline-start" />
                Convert to Invoice
              </Link>
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`/sales/sales-orders/${id}/edit`}>
                <Pencil data-icon="inline-start" />
                Edit
              </Link>
            </Button>
          ) : null}
          {canCancel ? <CancelSalesOrderButton salesOrderId={id} /> : null}
          {canDelete ? <DeleteSalesOrderButton salesOrderId={id} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
