import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { listWarehouses } from "@/lib/db/queries/warehouses";
import { Tabs } from "@/components/ui/Tabs";
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
      <Tabs
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
          product: business.preferences.productsInventory.product,
          inventory: {
            trackInventory: inv.trackInventory,
            defaultWarehouseId: inv.defaultWarehouseId ? String(inv.defaultWarehouseId) : "",
          },
          batch: business.preferences.productsInventory.batch,
        }}
        warehouses={warehouseOptions}
      />
    </div>
  );
}
