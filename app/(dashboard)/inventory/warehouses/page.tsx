import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listWarehouses } from "@/lib/db/queries/warehouses";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
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
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>
    );
  }

  const [active, deleted] = await Promise.all([
    listWarehouses(context.activeBusinessId, "active"),
    listWarehouses(context.activeBusinessId, "deleted"),
  ]);

  const canEdit = can(context.membership, "inventory", "edit");

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Warehouses</h1>
        {canEdit ? (
          <Link
            href="/inventory/warehouses/new"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + New warehouse
          </Link>
        ) : null}
      </div>

      <Table>
        <Thead>
          <Th>Name</Th>
          <Th>City</Th>
          <Th>Default</Th>
          <Th />
        </Thead>
        <Tbody>
          {active.length === 0 ? (
            <TableEmptyState colSpan={4} message="No warehouses yet." />
          ) : null}
          {active.map((w) => (
            <Tr key={String(w._id)}>
              <Td>
                {canEdit ? (
                  <Link
                    href={`/inventory/warehouses/${String(w._id)}/edit`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {w.name}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-900">{w.name}</span>
                )}
              </Td>
              <Td>{w.address?.city ?? "—"}</Td>
              <Td>
                {w.isDefault ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    Default
                  </span>
                ) : canEdit ? (
                  <form action={setDefaultWarehouseAction}>
                    <input type="hidden" name="warehouseId" value={String(w._id)} />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Set default
                    </button>
                  </form>
                ) : null}
              </Td>
              <Td className="text-right">
                {canEdit ? (
                  <form action={softDeleteWarehouseAction}>
                    <input type="hidden" name="warehouseId" value={String(w._id)} />
                    <button
                      type="submit"
                      className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </form>
                ) : null}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {deleted.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-700">Deleted</h2>
          <Table>
            <Thead>
              <Th>Name</Th>
              <Th />
            </Thead>
            <Tbody>
              {deleted.map((w) => (
                <Tr key={String(w._id)}>
                  <Td>{w.name}</Td>
                  <Td className="text-right">
                    {canEdit ? (
                      <form action={restoreWarehouseAction}>
                        <input type="hidden" name="warehouseId" value={String(w._id)} />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Restore
                        </button>
                      </form>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
