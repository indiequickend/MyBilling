import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { listWarehouses } from "@/lib/db/queries/warehouses";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { ProductsInventoryPreferencesForm } from "./ProductsInventoryPreferencesForm";

export default async function ProductsInventoryPreferencesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId) redirect("/");

  const [business, warehouses] = await Promise.all([
    findBusinessById(context.activeBusinessId),
    listWarehouses(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const warehouseOptions = warehouses.map((w) => ({ id: String(w._id), name: w.name }));
  const inv = business.preferences.productsInventory.inventory;

  return (
    <div>
      <LinkTabs
        tabs={[
          { label: "Document", href: "/settings/preferences/document", active: false },
          {
            label: "Products & Inventory",
            href: "/settings/preferences/products-inventory",
            active: true,
          },
        ]}
      />
      <ProductsInventoryPreferencesForm
        preferences={{
          product: {
            defaultItemType: business.preferences.productsInventory.product.defaultItemType,
            defaultPriceInclusiveOfTax:
              business.preferences.productsInventory.product.defaultPriceInclusiveOfTax,
            maxDiscountPercent: business.preferences.productsInventory.product.maxDiscountPercent,
            defaultUnit: business.preferences.productsInventory.product.defaultUnit,
            defaultTaxRatePercent:
              business.preferences.productsInventory.product.defaultTaxRatePercent,
          },
          inventory: {
            trackInventory: inv.trackInventory,
            defaultWarehouseId: inv.defaultWarehouseId ? String(inv.defaultWarehouseId) : "",
          },
          batch: {
            batchTrackingEnabledByDefault:
              business.preferences.productsInventory.batch.batchTrackingEnabledByDefault,
            expiryTrackingEnabledByDefault:
              business.preferences.productsInventory.batch.expiryTrackingEnabledByDefault,
          },
        }}
        warehouses={warehouseOptions}
      />
    </div>
  );
}
