import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { findEwayBillDataByInvoice } from "@/lib/db/queries/ewayBillData";
import { GenerateEwayBillForm } from "@/components/gst/GenerateEwayBillForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function EwayBillDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "gst", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const invoice = await findInvoiceById(invoiceId, context.activeBusinessId);
  if (!invoice) notFound();

  const ewayBillData = await findEwayBillDataByInvoice(invoiceId, context.activeBusinessId);
  const canEdit = can(context.membership, "gst", "edit");
  const canExport = can(context.membership, "gst", "export");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">E-way Bill — {invoice.docNumber ?? "Draft"}</h1>
          <p className="text-sm text-muted-foreground">{invoice.customerSnapshot.displayName}</p>
        </div>
        <div className="flex items-center gap-2">
          {ewayBillData?.status === "generated" ? <Badge variant="success">Generated</Badge> : <Badge variant="outline">Not Generated</Badge>}
          {canExport && ewayBillData?.status === "generated" ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/api/gst/e-way-bills/${invoiceId}/json`}>
                <Download data-icon="inline-start" />
                Download JSON
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {!invoice.eWayBillFlag ? (
        <p className="text-sm text-destructive">E-way bill generation is not enabled for this invoice.</p>
      ) : canEdit ? (
        <GenerateEwayBillForm invoiceId={invoiceId} existing={ewayBillData?.transportDetails} />
      ) : null}
    </div>
  );
}
