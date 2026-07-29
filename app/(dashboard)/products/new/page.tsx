import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listProductCategories } from "@/lib/db/queries/productCategories";
import { listProductGroups } from "@/lib/db/queries/productGroups";
import { listPriceLists } from "@/lib/db/queries/priceLists";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create products.</p>;
  }

  const [categories, groups, priceLists] = await Promise.all([
    listProductCategories(context.activeBusinessId),
    listProductGroups(context.activeBusinessId),
    listPriceLists(context.activeBusinessId),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New product</h1>
      <ProductForm
        mode="create"
        categories={categories.map((c) => ({ id: String(c._id), name: c.name }))}
        groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
        priceLists={priceLists.map((p) => ({ id: String(p._id), name: p.name }))}
      />
    </div>
  );
}
