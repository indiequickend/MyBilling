import { connectToDatabase } from "@/lib/db/connect";
import { Role, type PermissionMatrix } from "@/lib/db/models/Role";
import { Membership } from "@/lib/db/models/Membership";

/** .lean() — this is display data that regularly flows into Client Component props. */
export async function listRolesForBusiness(businessId: string) {
  await connectToDatabase();
  return Role.find({ businessId }).sort({ createdAt: 1 }).lean();
}

export async function findRoleById(roleId: string, businessId: string) {
  await connectToDatabase();
  return Role.findOne({ _id: roleId, businessId });
}

export async function createRole(input: {
  businessId: string;
  name: string;
  permissions: PermissionMatrix;
  isSystemDefault?: boolean;
}) {
  await connectToDatabase();
  return Role.create({
    businessId: input.businessId,
    name: input.name,
    permissions: input.permissions,
    isSystemDefault: input.isSystemDefault ?? false,
  });
}

export async function updateRole(
  roleId: string,
  businessId: string,
  updates: { name?: string; permissions?: PermissionMatrix },
) {
  await connectToDatabase();
  return Role.findOneAndUpdate(
    { _id: roleId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

/**
 * Refuses to delete a system-default role or one still assigned to any member —
 * callers should reassign members first.
 */
export async function deleteRole(roleId: string, businessId: string) {
  await connectToDatabase();
  const role = await Role.findOne({ _id: roleId, businessId });
  if (!role) return { ok: false as const, reason: "not_found" as const };
  if (role.isSystemDefault) return { ok: false as const, reason: "system_default" as const };

  const inUse = await Membership.countDocuments({ businessId, roleId });
  if (inUse > 0) return { ok: false as const, reason: "in_use" as const };

  await Role.deleteOne({ _id: roleId, businessId });
  return { ok: true as const };
}
