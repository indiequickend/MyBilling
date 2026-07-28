import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { listInvoices } from "@/lib/db/queries/invoices";
import { INVOICE_STATUS_LABELS } from "@/lib/constants/invoices";
import { minorToRupeesString } from "@/lib/utils/money";
import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";

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
        <Thead>
          <Th>Invoice #</Th>
          <Th>Date</Th>
          <Th>Status</Th>
          <Th>Total</Th>
          <Th>Paid</Th>
        </Thead>
        <Tbody>
          {items.length === 0 ? <TableEmptyState colSpan={5} message="No transactions yet." /> : null}
          {items.map((inv) => (
            <Tr key={String(inv._id)}>
              <Td>
                <Link
                  href={`/sales/invoices/${String(inv._id)}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {inv.docNumber ?? "Draft"}
                </Link>
              </Td>
              <Td>{new Date(inv.invoiceDate).toLocaleDateString()}</Td>
              <Td>{INVOICE_STATUS_LABELS[inv.status]}</Td>
              <Td>₹{minorToRupeesString(inv.grandTotalMinor)}</Td>
              <Td>₹{minorToRupeesString(inv.amountPaidMinor)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
