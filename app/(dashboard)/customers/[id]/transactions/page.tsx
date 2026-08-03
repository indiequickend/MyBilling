import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { listInvoices } from "@/lib/db/queries/invoices";
import { resolveInvoiceStatusDisplay } from "@/lib/constants/invoices";
import { minorToRupeesString } from "@/lib/utils/money";
import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { StatusStamp } from "@/components/ui/StatusStamp";

export default async function CustomerTransactionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId) redirect("/");

  const { items } = await listInvoices(context.activeBusinessId, { customerId: id, tab: "all" });

  return (
    <div>
      <PartyDetailTabs basePath={`/customers/${id}`} active="transactions" />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Paid</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={5} message="No transactions yet." /> : null}
          {items.map((inv) => {
            const statusDisplay = resolveInvoiceStatusDisplay(inv.status, inv.dueDate);
            return (
              <TableRow key={String(inv._id)}>
                <TableCell>
                  <Link href={`/sales/invoices/${String(inv._id)}`} className="font-medium hover:underline">
                    {inv.docNumber ?? "Draft"}
                  </Link>
                </TableCell>
                <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  <StatusStamp variant={statusDisplay.variant} seed={String(inv._id)}>
                    {statusDisplay.label}
                  </StatusStamp>
                </TableCell>
                <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(inv.grandTotalMinor)}</TableCell>
                <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(inv.amountPaidMinor)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
