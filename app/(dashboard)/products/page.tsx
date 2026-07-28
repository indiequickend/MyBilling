import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listProducts } from "@/lib/db/queries/products";
import { listProductCategories } from "@/lib/db/queries/productCategories";
import { productListQuerySchema } from "@/lib/validation/products";
import { minorToRupeesString } from "@/lib/utils/money";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { softDeleteProductAction, restoreProductAction } from "./actions";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "view")) {
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>
    );
  }

  const query = productListQuerySchema.parse({
    q: sp.q,
    categoryId: sp.categoryId,
    groupId: sp.groupId,
    type: sp.type,
    tab: sp.tab,
    page: sp.page,
  });

  const [{ items, page, totalPages }, categories] = await Promise.all([
    listProducts(context.activeBusinessId, {
      search: query.q,
      categoryId: query.categoryId,
      groupId: query.groupId,
      type: query.type,
      tab: query.tab,
      page: query.page,
    }),
    listProductCategories(context.activeBusinessId),
  ]);

  const canCreate = can(context.membership, "products", "create");
  const canDelete = can(context.membership, "products", "delete");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Products & Services</h1>
        <div className="flex items-center gap-3">
          <Link href="/products/categories" className="text-sm text-slate-500 hover:underline">
            Categories
          </Link>
          <Link href="/products/groups" className="text-sm text-slate-500 hover:underline">
            Groups
          </Link>
          <Link href="/products/price-lists" className="text-sm text-slate-500 hover:underline">
            Price lists
          </Link>
          {canCreate ? (
            <Link
              href="/products/new"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              + New product
            </Link>
          ) : null}
        </div>
      </div>

      <Tabs
        tabs={[
          { label: "Active", href: "/products", active: query.tab === "active" },
          { label: "Deleted", href: "/products?tab=deleted", active: query.tab === "deleted" },
        ]}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search products…"
          hiddenParams={{ tab: query.tab }}
        >
          {categories.length > 0 ? (
            <select
              name="categoryId"
              defaultValue={query.categoryId ?? ""}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={String(c._id)} value={String(c._id)}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            name="type"
            defaultValue={query.type ?? ""}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">All types</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </SearchInput>
      </div>

      <Table>
        <Thead>
          <Th>Name</Th>
          <Th>Type</Th>
          <Th>HSN/SAC</Th>
          <Th>Selling price</Th>
          <Th />
        </Thead>
        <Tbody>
          {items.length === 0 ? <TableEmptyState colSpan={5} message="No products found." /> : null}
          {items.map((p) => (
            <Tr key={String(p._id)}>
              <Td>
                <Link
                  href={`/products/${String(p._id)}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {p.name}
                </Link>
              </Td>
              <Td>{p.type === "product" ? "Product" : "Service"}</Td>
              <Td>{p.hsnOrSac ?? "—"}</Td>
              <Td>₹{minorToRupeesString(p.sellingPriceMinor)}</Td>
              <Td className="text-right">
                {query.tab === "active" ? (
                  canDelete ? (
                    <form action={softDeleteProductAction}>
                      <input type="hidden" name="productId" value={String(p._id)} />
                      <button
                        type="submit"
                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </form>
                  ) : null
                ) : (
                  <form action={restoreProductAction}>
                    <input type="hidden" name="productId" value={String(p._id)} />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Restore
                    </button>
                  </form>
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/products"
        searchParams={{
          q: query.q,
          categoryId: query.categoryId,
          groupId: query.groupId,
          type: query.type,
          tab: query.tab,
        }}
      />
    </div>
  );
}
