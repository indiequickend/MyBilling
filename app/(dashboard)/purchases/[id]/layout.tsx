import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Download, Pencil } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findPurchaseById } from "@/lib/db/queries/purchases";
import { DOCUMENT_STATUS_BADGE_VARIANT, DOCUMENT_STATUS_LABELS } from "@/lib/constants/documents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelPurchaseButton, DeletePurchaseButton } from "./PurchaseActionButtons";

const EDITABLE_STATUSES = ["draft", "pending", "partially_paid"];
const CANCELLABLE_STATUSES = ["draft", "pending", "partially_paid"];
const DELETABLE_STATUSES = ["draft", "cancelled"];

export default async function PurchaseDetailLayout({
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

  if (!can(context.membership, "purchases", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view purchases.</p>;
  }

  const purchase = await findPurchaseById(id, context.activeBusinessId);
  if (!purchase) notFound();

  const canEdit = can(context.membership, "purchases", "edit") && EDITABLE_STATUSES.includes(purchase.status);
  const canCancel =
    can(context.membership, "purchases", "edit") && CANCELLABLE_STATUSES.includes(purchase.status);
  const canDelete =
    can(context.membership, "purchases", "delete") && DELETABLE_STATUSES.includes(purchase.status);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{purchase.docNumber ?? "Draft purchase"}</h1>
            <Badge variant={DOCUMENT_STATUS_BADGE_VARIANT[purchase.status]}>
              {DOCUMENT_STATUS_LABELS[purchase.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{purchase.vendorSnapshot.displayName}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {purchase.docNumber ? (
            <Button variant="outline" asChild>
              <a href={`/api/purchases/${id}/pdf`}>
                <Download data-icon="inline-start" />
                Download PDF
              </a>
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`/purchases/${id}/edit`}>
                <Pencil data-icon="inline-start" />
                Edit
              </Link>
            </Button>
          ) : null}
          {canCancel ? <CancelPurchaseButton purchaseId={id} /> : null}
          {canDelete ? <DeletePurchaseButton purchaseId={id} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
