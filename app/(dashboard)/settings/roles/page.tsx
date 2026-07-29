import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listRolesForBusiness } from "@/lib/db/queries/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateRoleForm } from "./TemplateRoleForm";
import { ScratchRoleForm } from "./ScratchRoleForm";
import { RolesList } from "./RolesList";

export default async function RolesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_roles")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const roles = await listRolesForBusiness(context.activeBusinessId);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="mb-4 text-lg font-semibold">Add a role from a template</h1>
        <Card>
          <CardContent>
            <TemplateRoleForm />
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold">Start from scratch</h2>
        <Card>
          <CardContent>
            <ScratchRoleForm />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Existing roles</CardTitle>
        </CardHeader>
        <CardContent>
          <RolesList roles={roles} />
        </CardContent>
      </Card>
    </div>
  );
}
