import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listWarehouses } from "@/lib/db/queries/warehouses";
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
import { Button } from "@/components/ui/button";
import {
  setDefaultWarehouseAction,
  softDeleteWarehouseAction,
  restoreWarehouseAction,
} from "./actions";

export default async function WarehousesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "inventory", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listWarehouses(context.activeBusinessId, "active"),
    listWarehouses(context.activeBusinessId, "deleted"),
  ]);

  const canEdit = can(context.membership, "inventory", "edit");

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Warehouses</h1>
        {canEdit ? (
          <Button asChild>
            <Link href="/inventory/warehouses/new">
              <Plus data-icon="inline-start" />
              New warehouse
            </Link>
          </Button>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Default</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {active.length === 0 ? <TableEmptyState colSpan={4} message="No warehouses yet." /> : null}
          {active.map((w) => (
            <TableRow key={String(w._id)}>
              <TableCell>
                {canEdit ? (
                  <Link href={`/inventory/warehouses/${String(w._id)}/edit`} className="font-medium hover:underline">
                    {w.name}
                  </Link>
                ) : (
                  <span className="font-medium">{w.name}</span>
                )}
              </TableCell>
              <TableCell>{w.address?.city ?? "—"}</TableCell>
              <TableCell>
                {w.isDefault ? (
                  <Badge variant="success">Default</Badge>
                ) : canEdit ? (
                  <form action={setDefaultWarehouseAction}>
                    <input type="hidden" name="warehouseId" value={String(w._id)} />
                    <Button type="submit" variant="outline" size="sm">
                      Set default
                    </Button>
                  </form>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                {canEdit ? (
                  <form action={softDeleteWarehouseAction}>
                    <input type="hidden" name="warehouseId" value={String(w._id)} />
                    <Button type="submit" variant="outline" size="sm" className="text-destructive hover:text-destructive">
                      Delete
                    </Button>
                  </form>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {deleted.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Deleted</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deleted.map((w) => (
                <TableRow key={String(w._id)}>
                  <TableCell>{w.name}</TableCell>
                  <TableCell className="text-right">
                    {canEdit ? (
                      <form action={restoreWarehouseAction}>
                        <input type="hidden" name="warehouseId" value={String(w._id)} />
                        <Button type="submit" variant="outline" size="sm">
                          Restore
                        </Button>
                      </form>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
