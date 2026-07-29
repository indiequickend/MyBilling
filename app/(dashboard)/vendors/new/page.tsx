import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPartyGroups } from "@/lib/db/queries/partyGroups";
import { VendorForm } from "../VendorForm";

export default async function NewVendorPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "vendors", "create")) {
    return (
      <p className="text-sm text-destructive">You don&apos;t have permission to create vendors.</p>
    );
  }

  const groups = await listPartyGroups(context.activeBusinessId, "vendor");

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New vendor</h1>
      <VendorForm mode="create" groups={groups.map((g) => ({ id: String(g._id), name: g.name }))} />
    </div>
  );
}
