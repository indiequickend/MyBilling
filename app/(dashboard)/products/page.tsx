import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listProducts } from "@/lib/db/queries/products";
import { listProductCategories } from "@/lib/db/queries/productCategories";
import { productListQuerySchema } from "@/lib/validation/products";
import { minorToRupeesString } from "@/lib/utils/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/button";
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
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Products &amp; Services</h1>
        <div className="flex items-center gap-4">
          <Link href="/products/categories" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Categories
          </Link>
          <Link href="/products/groups" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Groups
          </Link>
          <Link href="/products/price-lists" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Price lists
          </Link>
          {canCreate ? (
            <Button asChild>
              <Link href="/products/new">
                <Plus data-icon="inline-start" />
                New product
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <LinkTabs
        tabs={[
          { label: "Active", href: "/products", active: query.tab === "active" },
          { label: "Deleted", href: "/products?tab=deleted", active: query.tab === "deleted" },
        ]}
      />

      <div className="mb-4">
        <SearchInput defaultValue={query.q} placeholder="Search products…" hiddenParams={{ tab: query.tab }}>
          {categories.length > 0 ? (
            <select
              name="categoryId"
              defaultValue={query.categoryId ?? ""}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
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
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">All types</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </SearchInput>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>HSN/SAC</TableHead>
            <TableHead>Selling price</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={5} message="No products found." /> : null}
          {items.map((p) => (
            <TableRow key={String(p._id)}>
              <TableCell>
                <Link href={`/products/${String(p._id)}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
              </TableCell>
              <TableCell>{p.type === "product" ? "Product" : "Service"}</TableCell>
              <TableCell>{p.hsnOrSac ?? "—"}</TableCell>
              <TableCell>
                {p.variants.length > 0
                  ? "Varies by variant"
                  : `₹${minorToRupeesString(p.sellingPriceMinor)}`}
              </TableCell>
              <TableCell className="text-right">
                {query.tab === "active" ? (
                  canDelete ? (
                    <form action={softDeleteProductAction}>
                      <input type="hidden" name="productId" value={String(p._id)} />
                      <Button type="submit" variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        Delete
                      </Button>
                    </form>
                  ) : null
                ) : (
                  <form action={restoreProductAction}>
                    <input type="hidden" name="productId" value={String(p._id)} />
                    <Button type="submit" variant="outline" size="sm">
                      Restore
                    </Button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-2 flex justify-end">
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
    </div>
  );
}
