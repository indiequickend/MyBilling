import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listGstFlaggedInvoices } from "@/lib/db/queries/invoices";
import { listEInvoiceDataByInvoiceIds } from "@/lib/db/queries/eInvoiceData";
import { minorToRupeesString } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import type { EInvoiceValidationStatus } from "@/lib/db/models/EInvoiceData";

const TABS: { value: "all" | EInvoiceValidationStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "success", label: "Success" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_VARIANT: Record<EInvoiceValidationStatus, "success" | "warning" | "danger" | "outline"> = {
  success: "success",
  pending: "outline",
  failed: "danger",
  cancelled: "warning",
};

export default async function EInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "gst", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const activeTab = (sp.status as (typeof TABS)[number]["value"]) ?? "all";

  const invoices = await listGstFlaggedInvoices(context.activeBusinessId, "eInvoiceFlag");
  const eInvoiceData = await listEInvoiceDataByInvoiceIds(
    context.activeBusinessId,
    invoices.map((i) => i.invoiceId),
  );
  const statusByInvoice = new Map(eInvoiceData.map((e) => [String(e.invoiceId), e.validationStatus]));

  const rows = invoices
    .map((inv) => ({ ...inv, status: statusByInvoice.get(inv.invoiceId) ?? ("pending" as EInvoiceValidationStatus) }))
    .filter((inv) => activeTab === "all" || inv.status === activeTab);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">E-Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Invoices flagged for e-invoicing. &quot;Success&quot; means the generated payload is
          locally structurally valid and ready for manual upload — never a real IRN, since no live
          IRP call is ever made.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button key={tab.value} variant={activeTab === tab.value ? "default" : "outline"} size="sm" asChild>
            <Link href={tab.value === "all" ? "/gst/e-invoices" : `/gst/e-invoices?status=${tab.value}`}>{tab.label}</Link>
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableEmptyState colSpan={6} message="No invoices in this status." /> : null}
            {rows.map((inv) => (
              <TableRow key={inv.invoiceId}>
                <TableCell>{inv.docNumber ?? "—"}</TableCell>
                <TableCell>{inv.invoiceDate.toLocaleDateString("en-IN")}</TableCell>
                <TableCell>{inv.customerDisplayName}</TableCell>
                <TableCell className="font-tabular tabular-nums">{minorToRupeesString(inv.grandTotalMinor)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/gst/e-invoices/${inv.invoiceId}`}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Manage
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
