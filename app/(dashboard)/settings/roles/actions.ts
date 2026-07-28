"use server";

import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { ROLE_TEMPLATES, type RoleTemplateName } from "@/lib/rbac/templates";
import { parsePermissionMatrixFromFormData } from "@/lib/rbac/formParsing";
import {
  createRoleFromTemplateSchema,
  createRoleFromScratchSchema,
  updateRoleSchema,
} from "@/lib/validation/roles";
import { createRole, updateRole, deleteRole } from "@/lib/db/queries/roles";

export type RolesPageState = { error?: string; success?: string };

async function requireManageRoles() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_roles");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

export async function createRoleFromTemplateAction(
  _prev: RolesPageState,
  formData: FormData,
): Promise<RolesPageState> {
  const context = await requireManageRoles();

  const parsed = createRoleFromTemplateSchema.safeParse({
    name: formData.get("name"),
    template: formData.get("template"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const permissions = ROLE_TEMPLATES[parsed.data.template as RoleTemplateName];
  await createRole({ businessId: context.activeBusinessId, name: parsed.data.name, permissions });
  return { success: `Role "${parsed.data.name}" created.` };
}

export async function createRoleFromScratchAction(
  _prev: RolesPageState,
  formData: FormData,
): Promise<RolesPageState> {
  const context = await requireManageRoles();

  const permissions = parsePermissionMatrixFromFormData(formData);
  const parsed = createRoleFromScratchSchema.safeParse({
    name: formData.get("name"),
    permissions,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await createRole({
    businessId: context.activeBusinessId,
    name: parsed.data.name,
    permissions: parsed.data.permissions,
  });
  return { success: `Role "${parsed.data.name}" created.` };
}

export async function updateRoleAction(
  _prev: RolesPageState,
  formData: FormData,
): Promise<RolesPageState> {
  const context = await requireManageRoles();

  const roleId = String(formData.get("roleId") ?? "");
  if (!roleId) return { error: "Missing role." };

  const permissions = parsePermissionMatrixFromFormData(formData);
  const parsed = updateRoleSchema.safeParse({
    name: formData.get("name") || undefined,
    permissions,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const updated = await updateRole(roleId, context.activeBusinessId, parsed.data);
  if (!updated) return { error: "Role not found." };
  return { success: "Role updated." };
}

export async function deleteRoleAction(
  _prev: RolesPageState,
  formData: FormData,
): Promise<RolesPageState> {
  const context = await requireManageRoles();

  const roleId = String(formData.get("roleId") ?? "");
  if (!roleId) return { error: "Missing role." };

  const result = await deleteRole(roleId, context.activeBusinessId);
  if (!result.ok) {
    const messages = {
      not_found: "Role not found.",
      system_default: "The default Admin role can't be deleted.",
      in_use: "Reassign members away from this role before deleting it.",
    } as const;
    return { error: messages[result.reason] };
  }
  return { success: "Role deleted." };
}
