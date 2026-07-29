import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findWarehouseById } from "@/lib/db/queries/warehouses";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { WarehouseForm } from "../../WarehouseForm";

export default async function EditWarehousePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "inventory", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit warehouses.</p>;
  }

  const warehouse = await findWarehouseById(id, context.activeBusinessId);
  if (!warehouse) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit warehouse</h1>
      <WarehouseForm
        mode="edit"
        warehouseId={String(warehouse._id)}
        defaultValues={{ name: warehouse.name, address: toPlainAddress(warehouse.address) }}
      />
    </div>
  );
}
