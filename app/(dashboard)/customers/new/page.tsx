import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPartyGroups } from "@/lib/db/queries/partyGroups";
import { CustomerForm } from "../CustomerForm";

export default async function NewCustomerPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "customers", "create")) {
    return (
      <p className="text-sm text-destructive">You don&apos;t have permission to create customers.</p>
    );
  }

  const groups = await listPartyGroups(context.activeBusinessId, "customer");

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New customer</h1>
      <CustomerForm
        mode="create"
        groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
      />
    </div>
  );
}
