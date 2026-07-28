import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { getPartyLedger } from "@/lib/db/queries/payments";
import { minorToRupeesString } from "@/lib/utils/money";
import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";

export default async function CustomerLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId) redirect("/");

  const page = Number(sp.page ?? 1) || 1;
  const { items, totalPages } = await getPartyLedger("customer", id, context.activeBusinessId, { page });

  return (
    <div>
      <PartyDetailTabs basePath={`/customers/${id}`} active="ledger" />

      <Table>
        <Thead>
          <Th>Date</Th>
          <Th>Type</Th>
          <Th>Description</Th>
          <Th>You Get</Th>
          <Th>You Got</Th>
          <Th>Balance</Th>
        </Thead>
        <Tbody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No ledger entries yet." /> : null}
          {items.map((entry, i) => (
            <Tr key={i}>
              <Td>{new Date(entry.date).toLocaleDateString()}</Td>
              <Td className="capitalize">{entry.type}</Td>
              <Td>{entry.description}</Td>
              <Td>{entry.debitMinor > 0 ? `₹${minorToRupeesString(entry.debitMinor)}` : "—"}</Td>
              <Td>{entry.creditMinor > 0 ? `₹${minorToRupeesString(entry.creditMinor)}` : "—"}</Td>
              <Td>₹{minorToRupeesString(entry.balanceMinor)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Pagination page={page} totalPages={totalPages} basePath={`/customers/${id}/ledger`} searchParams={{}} />
    </div>
  );
}
