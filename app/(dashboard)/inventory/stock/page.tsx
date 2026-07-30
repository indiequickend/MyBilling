import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listWarehouses } from "@/lib/db/queries/warehouses";
import { StockMovementForm } from "./StockMovementForm";

export default async function StockMovementPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "inventory", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to adjust stock.</p>;
  }

  const warehouses = await listWarehouses(context.activeBusinessId, "active");

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Stock In / Out</h1>
      {warehouses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create a warehouse first — stock movements need a location.
        </p>
      ) : (
        <StockMovementForm warehouses={warehouses.map((w) => ({ id: String(w._id), name: w.name }))} />
      )}
    </div>
  );
}
