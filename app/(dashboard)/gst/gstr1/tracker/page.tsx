import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listGstr1FilingTracker } from "@/lib/db/queries/gstReportSnapshots";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";

function monthsAgo(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 - months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function Gstr1TrackerPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "gst", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const currentPeriod = new Date().toISOString().slice(0, 7);
  const rows = await listGstr1FilingTracker(context.activeBusinessId, monthsAgo(currentPeriod, 12), currentPeriod);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">GSTR-1 Filing Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Per-month view of saved GSTR-1 snapshots. &quot;Filed&quot; is a manual flag your business
          sets — it is never a real filing confirmation.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Last Computed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Filed On</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableEmptyState colSpan={5} message="No GSTR-1 snapshots saved yet." /> : null}
            {rows.map((r) => (
              <TableRow key={r.period}>
                <TableCell>{r.period}</TableCell>
                <TableCell>{new Date(r.computedAt).toLocaleString("en-IN")}</TableCell>
                <TableCell>
                  {r.manualFiledFlag ? <Badge variant="success">Filed</Badge> : <Badge variant="outline">Not Filed</Badge>}
                </TableCell>
                <TableCell>{r.filedAt ? new Date(r.filedAt).toLocaleDateString("en-IN") : "—"}</TableCell>
                <TableCell>
                  <Link href={`/gst/gstr1?period=${r.period}`} className="text-sm text-primary underline-offset-4 hover:underline">
                    View
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
