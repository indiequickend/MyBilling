import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listRolesForBusiness } from "@/lib/db/queries/roles";
import { TemplateRoleForm } from "./TemplateRoleForm";
import { ScratchRoleForm } from "./ScratchRoleForm";
import { RolesList } from "./RolesList";

export default async function RolesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_roles")) {
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>
    );
  }

  const roles = await listRolesForBusiness(context.activeBusinessId);

  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Add a role from a template</h1>
        <TemplateRoleForm />
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Start from scratch</h2>
        <ScratchRoleForm />
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Existing roles</h2>
        <RolesList roles={roles} />
      </div>
    </div>
  );
}
