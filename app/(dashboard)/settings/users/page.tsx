import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listMembershipsForBusiness } from "@/lib/db/queries/memberships";
import { listRolesForBusiness } from "@/lib/db/queries/roles";
import { InviteForm } from "./InviteForm";
import { MembersTable } from "./MembersTable";

export default async function UsersPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_users")) {
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>
    );
  }

  const [members, roles] = await Promise.all([
    listMembershipsForBusiness(context.activeBusinessId),
    listRolesForBusiness(context.activeBusinessId),
  ]);

  // InviteForm is a Client Component — pass only plain, minimal data across
  // that boundary rather than the full lean Mongoose result (which still
  // carries BSON ObjectId values for _id/businessId).
  const roleOptions = roles.map((r) => ({ id: String(r._id), name: r.name }));

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Invite someone</h1>
        <InviteForm roles={roleOptions} />
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Members</h2>
        <MembersTable members={members} roles={roles} />
      </div>
    </div>
  );
}
