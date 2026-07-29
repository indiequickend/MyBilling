import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listMembershipsForBusiness } from "@/lib/db/queries/memberships";
import { listRolesForBusiness } from "@/lib/db/queries/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm } from "./InviteForm";
import { MembersTable } from "./MembersTable";

export default async function UsersPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_users")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
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
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="mb-4 text-lg font-semibold">Invite someone</h1>
        <Card>
          <CardContent>
            <InviteForm roles={roleOptions} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <MembersTable members={members} roles={roles} />
        </CardContent>
      </Card>
    </div>
  );
}
