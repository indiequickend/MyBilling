import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findProductById } from "@/lib/db/queries/products";
import { listProductCategories } from "@/lib/db/queries/productCategories";
import { listProductGroups } from "@/lib/db/queries/productGroups";
import { listPriceLists } from "@/lib/db/queries/priceLists";
import { minorToRupeesString } from "@/lib/utils/money";
import { ProductForm } from "../../ProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit products.</p>;
  }

  const [product, categories, groups, priceLists] = await Promise.all([
    findProductById(id, context.activeBusinessId),
    listProductCategories(context.activeBusinessId),
    listProductGroups(context.activeBusinessId),
    listPriceLists(context.activeBusinessId),
  ]);
  if (!product) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit product</h1>
      <ProductForm
        mode="edit"
        productId={String(product._id)}
        categories={categories.map((c) => ({ id: String(c._id), name: c.name }))}
        groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
        priceLists={priceLists.map((p) => ({ id: String(p._id), name: p.name }))}
        defaultValues={{
          name: product.name,
          type: product.type,
          hsnOrSac: product.hsnOrSac ?? "",
          unit: product.unit ?? "",
          categoryId: product.categoryId ? String(product.categoryId) : "",
          groupId: product.groupId ? String(product.groupId) : "",
          purchasePriceMinor: minorToRupeesString(product.purchasePriceMinor),
          sellingPriceMinor: minorToRupeesString(product.sellingPriceMinor),
          priceIsTaxInclusive: product.priceIsTaxInclusive,
          taxRatePercent: String(product.taxRatePercent),
          barcode: product.barcode ?? "",
          variants: product.variants.map((v) => ({
            name: v.name,
            sku: v.sku ?? "",
            barcode: v.barcode ?? "",
            sellingPriceOverrideMinor: minorToRupeesString(v.sellingPriceOverrideMinor),
            purchasePriceOverrideMinor: minorToRupeesString(v.purchasePriceOverrideMinor),
          })),
          priceOverrides: product.priceOverrides.map((p) => ({
            priceListId: String(p.priceListId),
            priceMinor: minorToRupeesString(p.priceMinor),
          })),
          images: product.images.map((img) => ({ url: img.url })),
          stockTrackingEnabled: product.stockTracking?.enabled ?? false,
          stockTrackingMode: product.stockTracking?.batchTracked
            ? "batch"
            : product.stockTracking?.serialTracked
              ? "serial"
              : "none",
          reorderLevel:
            typeof product.stockTracking?.reorderLevel === "number"
              ? String(product.stockTracking.reorderLevel)
              : "",
          batches: (product.batches ?? [])
            .filter((b) => !b.deletedAt)
            .map((b) => ({
              batchNumber: b.batchNumber,
              expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().slice(0, 10) : "",
            })),
        }}
      />
    </div>
  );
}
