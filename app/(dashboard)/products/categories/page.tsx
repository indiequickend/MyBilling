import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listProductCategories } from "@/lib/db/queries/productCategories";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { CreateCategoryForm } from "./CreateCategoryForm";
import {
  updateProductCategoryAction,
  softDeleteProductCategoryAction,
  restoreProductCategoryAction,
} from "./actions";

export default async function ProductCategoriesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "view")) {
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>
    );
  }

  const [active, deleted] = await Promise.all([
    listProductCategories(context.activeBusinessId, "active"),
    listProductCategories(context.activeBusinessId, "deleted"),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Product categories</h1>
        <CreateCategoryForm />
      </div>

      <Table>
        <Thead>
          <Th>Name</Th>
          <Th />
        </Thead>
        <Tbody>
          {active.length === 0 ? (
            <TableEmptyState colSpan={2} message="No categories yet." />
          ) : null}
          {active.map((c) => (
            <Tr key={String(c._id)}>
              <Td>
                <form action={updateProductCategoryAction} className="flex items-center gap-2">
                  <input type="hidden" name="categoryId" value={String(c._id)} />
                  <input
                    name="name"
                    defaultValue={c.name}
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
                <form action={softDeleteProductCategoryAction}>
                  <input type="hidden" name="categoryId" value={String(c._id)} />
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
              {deleted.map((c) => (
                <Tr key={String(c._id)}>
                  <Td>{c.name}</Td>
                  <Td className="text-right">
                    <form action={restoreProductCategoryAction}>
                      <input type="hidden" name="categoryId" value={String(c._id)} />
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
