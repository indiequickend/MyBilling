import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { INVOICE_STATUS_LABELS } from "@/lib/constants/invoices";
import { CancelInvoiceButton, DeleteInvoiceButton } from "./InvoiceActionButtons";

const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-50 text-amber-700",
  partially_paid: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

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
    return <p className="text-sm text-red-700">You don&apos;t have permission to view invoices.</p>;
  }

  const invoice = await findInvoiceById(id, context.activeBusinessId);
  if (!invoice) notFound();

  const canEdit = can(context.membership, "sales_invoices", "edit") && EDITABLE_STATUSES.includes(invoice.status);
  const canCancel =
    can(context.membership, "sales_invoices", "edit") && CANCELLABLE_STATUSES.includes(invoice.status);
  const canDelete =
    can(context.membership, "sales_invoices", "delete") && DELETABLE_STATUSES.includes(invoice.status);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-900">
              {invoice.docNumber ?? "Draft invoice"}
            </h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[invoice.status]}`}
            >
              {INVOICE_STATUS_LABELS[invoice.status]}
            </span>
          </div>
          <p className="text-sm text-slate-500">{invoice.customerSnapshot.displayName}</p>
        </div>

        <div className="flex items-center gap-2">
          {invoice.docNumber ? (
            <a
              href={`/api/sales/invoices/${id}/pdf`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Download PDF
            </a>
          ) : null}
          {canEdit ? (
            <Link
              href={`/sales/invoices/${id}/edit`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Edit
            </Link>
          ) : null}
          {canCancel ? <CancelInvoiceButton invoiceId={id} /> : null}
          {canDelete ? <DeleteInvoiceButton invoiceId={id} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}
