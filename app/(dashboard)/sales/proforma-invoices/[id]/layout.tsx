import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Download, Pencil } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findProformaInvoiceById } from "@/lib/db/queries/proformaInvoices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelProformaInvoiceButton, DeleteProformaInvoiceButton } from "./ProformaInvoiceActionButtons";

const EDITABLE_STATUSES = ["draft", "open"];
const CANCELLABLE_STATUSES = ["draft", "open"];
const DELETABLE_STATUSES = ["draft", "cancelled"];
const STATUS_LABELS = { draft: "Draft", open: "Open", cancelled: "Cancelled" } as const;
const STATUS_BADGE_VARIANT = {
  draft: "outline",
  open: "warning",
  cancelled: "danger",
} as const;

export default async function ProformaInvoiceDetailLayout({
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

  if (!can(context.membership, "proforma_invoices", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view proforma invoices.</p>;
  }

  const proformaInvoice = await findProformaInvoiceById(id, context.activeBusinessId);
  if (!proformaInvoice) notFound();

  const canEdit =
    can(context.membership, "proforma_invoices", "edit") && EDITABLE_STATUSES.includes(proformaInvoice.status);
  const canCancel =
    can(context.membership, "proforma_invoices", "edit") && CANCELLABLE_STATUSES.includes(proformaInvoice.status);
  const canDelete =
    can(context.membership, "proforma_invoices", "delete") && DELETABLE_STATUSES.includes(proformaInvoice.status);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{proformaInvoice.docNumber ?? "Draft proforma invoice"}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[proformaInvoice.status]}>
              {STATUS_LABELS[proformaInvoice.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{proformaInvoice.customerSnapshot.displayName}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {proformaInvoice.docNumber ? (
            <Button variant="outline" asChild>
              <a href={`/api/sales/proforma-invoices/${id}/pdf`}>
                <Download data-icon="inline-start" />
                Download PDF
              </a>
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`/sales/proforma-invoices/${id}/edit`}>
                <Pencil data-icon="inline-start" />
                Edit
              </Link>
            </Button>
          ) : null}
          {canCancel ? <CancelProformaInvoiceButton proformaInvoiceId={id} /> : null}
          {canDelete ? <DeleteProformaInvoiceButton proformaInvoiceId={id} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
