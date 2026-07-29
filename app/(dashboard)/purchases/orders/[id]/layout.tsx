import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowRightLeft, Pencil } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findPurchaseOrderById } from "@/lib/db/queries/purchaseOrders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelPurchaseOrderButton, DeletePurchaseOrderButton } from "./PurchaseOrderActionButtons";

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

export default async function PurchaseOrderDetailLayout({
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

  if (!can(context.membership, "purchase_orders", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view purchase orders.</p>;
  }

  const purchaseOrder = await findPurchaseOrderById(id, context.activeBusinessId);
  if (!purchaseOrder) notFound();

  const canEdit =
    can(context.membership, "purchase_orders", "edit") && EDITABLE_STATUSES.includes(purchaseOrder.status);
  const canCancel =
    can(context.membership, "purchase_orders", "edit") && CANCELLABLE_STATUSES.includes(purchaseOrder.status);
  const canDelete =
    can(context.membership, "purchase_orders", "delete") && DELETABLE_STATUSES.includes(purchaseOrder.status);
  const canConvert = purchaseOrder.status === "open" && can(context.membership, "purchases", "create");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{purchaseOrder.docNumber ?? "Draft purchase order"}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[purchaseOrder.status]}>
              {STATUS_LABELS[purchaseOrder.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{purchaseOrder.vendorSnapshot.displayName}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canConvert ? (
            <Button asChild>
              <Link href={`/purchases/new?fromPurchaseOrder=${id}`}>
                <ArrowRightLeft data-icon="inline-start" />
                Convert to Purchase
              </Link>
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`/purchases/orders/${id}/edit`}>
                <Pencil data-icon="inline-start" />
                Edit
              </Link>
            </Button>
          ) : null}
          {canCancel ? <CancelPurchaseOrderButton purchaseOrderId={id} /> : null}
          {canDelete ? <DeletePurchaseOrderButton purchaseOrderId={id} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
