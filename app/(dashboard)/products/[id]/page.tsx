import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findProductById } from "@/lib/db/queries/products";
import { findProductCategoryById } from "@/lib/db/queries/productCategories";
import { findProductGroupById } from "@/lib/db/queries/productGroups";
import { minorToRupeesString } from "@/lib/utils/money";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { softDeleteProductAction } from "../actions";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "view")) {
    return <p className="text-sm text-red-700">You don&apos;t have permission to view products.</p>;
  }

  const product = await findProductById(id, context.activeBusinessId);
  if (!product) notFound();

  const [category, group] = await Promise.all([
    product.categoryId
      ? findProductCategoryById(String(product.categoryId), context.activeBusinessId)
      : null,
    product.groupId
      ? findProductGroupById(String(product.groupId), context.activeBusinessId)
      : null,
  ]);

  const canEdit = can(context.membership, "products", "edit");
  const canDelete = can(context.membership, "products", "delete");

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{product.name}</h1>
          <p className="text-sm text-slate-500">
            {product.type === "product" ? "Product" : "Service"}
            {category ? ` · ${category.name}` : ""}
            {group ? ` · ${group.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Link
              href={`/products/${id}/edit`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Edit
            </Link>
          ) : null}
          {canDelete && !product.deletedAt ? (
            <form action={softDeleteProductAction}>
              <input type="hidden" name="productId" value={id} />
              <button
                type="submit"
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {product.images.length > 0 ? (
        <div className="flex gap-2">
          {product.images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={img.url}
              alt=""
              className="h-20 w-20 rounded-md border border-slate-200 object-cover"
            />
          ))}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-slate-500">HSN/SAC</dt>
          <dd className="text-slate-900">{product.hsnOrSac ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Unit</dt>
          <dd className="text-slate-900">{product.unit ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Selling price</dt>
          <dd className="text-slate-900">
            ₹{minorToRupeesString(product.sellingPriceMinor)}{" "}
            {product.priceIsTaxInclusive ? "(tax-inclusive)" : "(tax-exclusive)"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Purchase price</dt>
          <dd className="text-slate-900">
            {product.purchasePriceMinor != null
              ? `₹${minorToRupeesString(product.purchasePriceMinor)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Tax rate</dt>
          <dd className="text-slate-900">{product.taxRatePercent}%</dd>
        </div>
        <div>
          <dt className="text-slate-500">Barcode</dt>
          <dd className="text-slate-900">{product.barcode ?? "—"}</dd>
        </div>
      </dl>

      {product.variants.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-700">Variants</h2>
          <Table>
            <Thead>
              <Th>Name</Th>
              <Th>SKU</Th>
              <Th>Barcode</Th>
              <Th>Selling price</Th>
              <Th>Purchase price</Th>
            </Thead>
            <Tbody>
              {product.variants.map((v, i) => (
                <Tr key={i}>
                  <Td>{v.name}</Td>
                  <Td>{v.sku ?? "—"}</Td>
                  <Td>{v.barcode ?? "—"}</Td>
                  <Td>
                    {v.sellingPriceOverrideMinor != null
                      ? `₹${minorToRupeesString(v.sellingPriceOverrideMinor)}`
                      : "—"}
                  </Td>
                  <Td>
                    {v.purchasePriceOverrideMinor != null
                      ? `₹${minorToRupeesString(v.purchasePriceOverrideMinor)}`
                      : "—"}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      ) : null}

      {product.priceOverrides.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-700">Price list overrides</h2>
          <Table>
            <Thead>
              <Th>Price list</Th>
              <Th>Price</Th>
            </Thead>
            <Tbody>
              {product.priceOverrides.length === 0 ? (
                <TableEmptyState colSpan={2} message="No overrides." />
              ) : null}
              {product.priceOverrides.map((p, i) => (
                <Tr key={i}>
                  <Td>{String(p.priceListId)}</Td>
                  <Td>₹{minorToRupeesString(p.priceMinor)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
