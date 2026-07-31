import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listAuditLogs, listAuditLogActions } from "@/lib/db/queries/auditLog";
import { listMembershipsForBusiness } from "@/lib/db/queries/memberships";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "view_audit_log")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const action = sp.action || undefined;
  const userId = sp.userId || undefined;
  const q = sp.q || undefined;
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : undefined;
  const to = sp.to ? new Date(`${sp.to}T23:59:59.999`) : undefined;
  const page = sp.page ? Number(sp.page) : 1;

  const [{ items, page: currentPage, totalPages }, actions, members] = await Promise.all([
    listAuditLogs(context.activeBusinessId, { action, userId, from, to, search: q, page }),
    listAuditLogActions(context.activeBusinessId),
    listMembershipsForBusiness(context.activeBusinessId),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Logins, permission changes, deletions, payment edits, and sensitive-field reveals for this
          business.
        </p>
      </div>

      <div className="mb-4">
        <SearchInput defaultValue={q} placeholder="Search by target…" hiddenParams={{ from: sp.from, to: sp.to }}>
          <select
            name="action"
            defaultValue={action ?? ""}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            name="userId"
            defaultValue={userId ?? ""}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All users</option>
            {members.map((m) => (
              <option key={String(m._id)} value={String(m.userId)}>
                {m.user?.name ?? m.user?.email ?? String(m.userId)}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          />
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          />
        </SearchInput>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={4} message="No audit log entries found." /> : null}
          {items.map((entry) => (
            <TableRow key={String(entry._id)}>
              <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
              <TableCell>{entry.userName ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{entry.action}</TableCell>
              <TableCell>
                {entry.target?.label ?? entry.target?.type ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 flex justify-end">
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          basePath="/settings/audit-log"
          searchParams={{ q, action, userId, from: sp.from, to: sp.to }}
        />
      </div>
    </div>
  );
}
