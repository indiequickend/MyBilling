import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPriceLists } from "@/lib/db/queries/priceLists";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { CreatePriceListForm } from "./CreatePriceListForm";
import {
  updatePriceListAction,
  setDefaultPriceListAction,
  softDeletePriceListAction,
  restorePriceListAction,
} from "./actions";

export default async function PriceListsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "view")) {
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>
    );
  }

  const [active, deleted] = await Promise.all([
    listPriceLists(context.activeBusinessId, "active"),
    listPriceLists(context.activeBusinessId, "deleted"),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Price lists</h1>
        <CreatePriceListForm />
      </div>

      <Table>
        <Thead>
          <Th>Name</Th>
          <Th>Default</Th>
          <Th />
        </Thead>
        <Tbody>
          {active.length === 0 ? (
            <TableEmptyState colSpan={3} message="No price lists yet." />
          ) : null}
          {active.map((p) => (
            <Tr key={String(p._id)}>
              <Td>
                <form action={updatePriceListAction} className="flex items-center gap-2">
                  <input type="hidden" name="priceListId" value={String(p._id)} />
                  <input
                    name="name"
                    defaultValue={p.name}
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
              <Td>
                {p.isDefault ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    Default
                  </span>
                ) : (
                  <form action={setDefaultPriceListAction}>
                    <input type="hidden" name="priceListId" value={String(p._id)} />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Set default
                    </button>
                  </form>
                )}
              </Td>
              <Td className="text-right">
                <form action={softDeletePriceListAction}>
                  <input type="hidden" name="priceListId" value={String(p._id)} />
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
              {deleted.map((p) => (
                <Tr key={String(p._id)}>
                  <Td>{p.name}</Td>
                  <Td className="text-right">
                    <form action={restorePriceListAction}>
                      <input type="hidden" name="priceListId" value={String(p._id)} />
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
