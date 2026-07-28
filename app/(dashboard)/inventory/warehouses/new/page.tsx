import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { WarehouseForm } from "../WarehouseForm";

export default async function NewWarehousePage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "inventory", "edit")) {
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to create warehouses.</p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-slate-900">New warehouse</h1>
      <WarehouseForm mode="create" />
    </div>
  );
}
