import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findProductById } from "@/lib/db/queries/products";
import { findProductCategoryById } from "@/lib/db/queries/productCategories";
import { findProductGroupById } from "@/lib/db/queries/productGroups";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { softDeleteProductAction } from "../actions";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view products.</p>;
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
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{product.name}</h1>
          <p className="text-sm text-muted-foreground">
            {product.type === "product" ? "Product" : "Service"}
            {category ? ` · ${category.name}` : ""}
            {group ? ` · ${group.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link href={`/products/${id}/edit`}>
                <Pencil data-icon="inline-start" />
                Edit
              </Link>
            </Button>
          ) : null}
          {canDelete && !product.deletedAt ? (
            <form action={softDeleteProductAction}>
              <input type="hidden" name="productId" value={id} />
              <Button type="submit" variant="destructive">
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {product.images.length > 0 ? (
        <div className="flex gap-2">
          {product.images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={img.url} alt="" className="h-20 w-20 rounded-lg border object-cover" />
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">HSN/SAC</dt>
              <dd className="font-medium">{product.hsnOrSac ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Unit</dt>
              <dd className="font-medium">{product.unit ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Selling price</dt>
              <dd className="font-medium">
                {product.variants.length > 0 && product.sellingPriceMinor == null ? (
                  "Varies by variant"
                ) : (
                  <>
                    ₹{minorToRupeesString(product.sellingPriceMinor)}{" "}
                    {product.priceIsTaxInclusive ? "(tax-inclusive)" : "(tax-exclusive)"}
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Purchase price</dt>
              <dd className="font-medium">
                {product.purchasePriceMinor != null
                  ? `₹${minorToRupeesString(product.purchasePriceMinor)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tax rate</dt>
              <dd className="font-medium">{product.taxRatePercent}%</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Barcode</dt>
              <dd className="font-medium">{product.barcode ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {product.variants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Selling price</TableHead>
                  <TableHead>Purchase price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell>{v.name}</TableCell>
                    <TableCell>{v.sku ?? "—"}</TableCell>
                    <TableCell>{v.barcode ?? "—"}</TableCell>
                    <TableCell className="font-tabular tabular-nums">
                      {v.sellingPriceOverrideMinor != null
                        ? `₹${minorToRupeesString(v.sellingPriceOverrideMinor)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-tabular tabular-nums">
                      {v.purchasePriceOverrideMinor != null
                        ? `₹${minorToRupeesString(v.purchasePriceOverrideMinor)}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {product.priceOverrides.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Price list overrides</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Price list</TableHead>
                  <TableHead>Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.priceOverrides.length === 0 ? (
                  <TableEmptyState colSpan={2} message="No overrides." />
                ) : null}
                {product.priceOverrides.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{String(p.priceListId)}</TableCell>
                    <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(p.priceMinor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
