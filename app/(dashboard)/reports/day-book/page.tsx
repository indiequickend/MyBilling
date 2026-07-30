import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getDayBook, type DayBookEntry } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DOC_TYPE_LABELS: Record<DayBookEntry["type"], string> = {
  invoice: "Invoice",
  purchase: "Purchase",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  payment: "Payment",
  expense: "Expense",
  indirect_income: "Indirect Income",
  journal: "Journal",
};

export default async function DayBookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "reports", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const dateStr = sp.date ?? new Date().toISOString().slice(0, 10);
  const date = new Date(`${dateStr}T00:00:00`);
  const rows = await getDayBook(context.activeBusinessId, date);

  const columns: ReportTableColumn<DayBookEntry>[] = [
    { key: "date", header: "Date", value: (r) => new Date(r.date).toLocaleString() },
    { key: "type", header: "Type", value: (r) => DOC_TYPE_LABELS[r.type] },
    { key: "docNumber", header: "Doc #", value: (r) => r.docNumber ?? "—" },
    { key: "description", header: "Description", value: (r) => r.description },
    { key: "partyName", header: "Party", value: (r) => r.partyName ?? "—" },
    {
      key: "amountMinor",
      header: "Amount",
      align: "right",
      value: (r) => minorToRupeesString(r.amountMinor),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Day Book</h1>
      <form method="get" className="mb-4 flex items-center gap-2">
        <Input type="date" name="date" defaultValue={dateStr} className="w-auto" />
        <Button type="submit" variant="outline">
          Go
        </Button>
      </form>
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/day-book/export"
        exportQuery={`dateFrom=${dateStr}`}
        emptyMessage="No transactions on this day."
      />
    </div>
  );
}
