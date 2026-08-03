import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listGstFlaggedInvoices } from "@/lib/db/queries/invoices";
import { listEwayBillDataByInvoiceIds } from "@/lib/db/queries/ewayBillData";
import { minorToRupeesString } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";

export default async function EwayBillsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "gst", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const invoices = await listGstFlaggedInvoices(context.activeBusinessId, "eWayBillFlag");
  const ewayBillData = await listEwayBillDataByInvoiceIds(
    context.activeBusinessId,
    invoices.map((i) => i.invoiceId),
  );
  const statusByInvoice = new Map(ewayBillData.map((e) => [String(e.invoiceId), e.status]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">E-way Bills</h1>
        <p className="text-sm text-muted-foreground">
          Invoices flagged for an e-way bill. Generating one builds a downloadable JSON data object
          in the NIC-documented schema — no call is ever made to the government e-way bill system.
        </p>
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
            {invoices.length === 0 ? (
              <TableEmptyState colSpan={6} message="No invoices are flagged for an e-way bill." />
            ) : null}
            {invoices.map((inv) => {
              const status = statusByInvoice.get(inv.invoiceId) ?? "draft";
              return (
                <TableRow key={inv.invoiceId}>
                  <TableCell>{inv.docNumber ?? "—"}</TableCell>
                  <TableCell>{inv.invoiceDate.toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>{inv.customerDisplayName}</TableCell>
                  <TableCell className="font-tabular tabular-nums">{minorToRupeesString(inv.grandTotalMinor)}</TableCell>
                  <TableCell>
                    {status === "generated" ? <Badge variant="success">Generated</Badge> : <Badge variant="outline">Not Generated</Badge>}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/gst/e-way-bills/${inv.invoiceId}`}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      Manage
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
