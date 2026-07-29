import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { listInvoices } from "@/lib/db/queries/invoices";
import { INVOICE_STATUS_BADGE_VARIANT, INVOICE_STATUS_LABELS } from "@/lib/constants/invoices";
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
import { Badge } from "@/components/ui/badge";

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
          {items.map((inv) => (
            <TableRow key={String(inv._id)}>
              <TableCell>
                <Link href={`/sales/invoices/${String(inv._id)}`} className="font-medium hover:underline">
                  {inv.docNumber ?? "Draft"}
                </Link>
              </TableCell>
              <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
              <TableCell>
                <Badge variant={INVOICE_STATUS_BADGE_VARIANT[inv.status]}>
                  {INVOICE_STATUS_LABELS[inv.status]}
                </Badge>
              </TableCell>
              <TableCell>₹{minorToRupeesString(inv.grandTotalMinor)}</TableCell>
              <TableCell>₹{minorToRupeesString(inv.amountPaidMinor)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
