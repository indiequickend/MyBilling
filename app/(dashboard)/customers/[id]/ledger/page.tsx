import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { getPartyLedger } from "@/lib/db/queries/payments";
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
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>You Get</TableHead>
            <TableHead>You Got</TableHead>
            <TableHead>Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No ledger entries yet." /> : null}
          {items.map((entry, i) => (
            <TableRow key={i}>
              <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
              <TableCell className="capitalize">{entry.type}</TableCell>
              <TableCell>{entry.description}</TableCell>
              <TableCell>{entry.debitMinor > 0 ? `₹${minorToRupeesString(entry.debitMinor)}` : "—"}</TableCell>
              <TableCell>{entry.creditMinor > 0 ? `₹${minorToRupeesString(entry.creditMinor)}` : "—"}</TableCell>
              <TableCell>₹{minorToRupeesString(entry.balanceMinor)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 flex justify-end">
        <Pagination page={page} totalPages={totalPages} basePath={`/customers/${id}/ledger`} searchParams={{}} />
      </div>
    </div>
  );
}
