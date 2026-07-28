import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPartyGroups } from "@/lib/db/queries/partyGroups";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { CreateGroupForm } from "./CreateGroupForm";
import {
  updateCustomerGroupAction,
  softDeleteCustomerGroupAction,
  restoreCustomerGroupAction,
} from "./actions";

export default async function CustomerGroupsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "customers", "view")) {
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>
    );
  }

  const [active, deleted] = await Promise.all([
    listPartyGroups(context.activeBusinessId, "customer", "active"),
    listPartyGroups(context.activeBusinessId, "customer", "deleted"),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Customer groups</h1>
        <CreateGroupForm />
      </div>

      <Table>
        <Thead>
          <Th>Name</Th>
          <Th />
        </Thead>
        <Tbody>
          {active.length === 0 ? <TableEmptyState colSpan={2} message="No groups yet." /> : null}
          {active.map((g) => (
            <Tr key={String(g._id)}>
              <Td>
                <form action={updateCustomerGroupAction} className="flex items-center gap-2">
                  <input type="hidden" name="groupId" value={String(g._id)} />
                  <input
                    name="name"
                    defaultValue={g.name}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Save
                  </button>
                </form>
              </Td>
              <Td className="text-right">
                <form action={softDeleteCustomerGroupAction}>
                  <input type="hidden" name="groupId" value={String(g._id)} />
                  <button
                    type="submit"
                    className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </form>
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
              {deleted.map((g) => (
                <Tr key={String(g._id)}>
                  <Td>{g.name}</Td>
                  <Td className="text-right">
                    <form action={restoreCustomerGroupAction}>
                      <input type="hidden" name="groupId" value={String(g._id)} />
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Restore
                      </button>
                    </form>
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
