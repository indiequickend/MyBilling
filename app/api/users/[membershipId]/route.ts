import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { requireCsrf } from "@/lib/auth/csrf";
import { changeMembershipRoleSchema, changeMembershipStatusSchema } from "@/lib/validation/users";
import {
  findMembershipById,
  updateMembershipRole,
  setMembershipStatus,
  countActiveMembershipsWithRole,
} from "@/lib/db/queries/memberships";
import { findRoleById } from "@/lib/db/queries/roles";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    await requireCsrf(request);
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "settings", "manage_users");

    const { membershipId } = await params;
    const target = await findMembershipById(membershipId, context.businessId);
    if (!target) {
      return NextResponse.json({ error: "Membership not found." }, { status: 404 });
    }

    const body = await request.json();

    if ("roleId" in body) {
      const parsed = changeMembershipRoleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      }
      const newRole = await findRoleById(parsed.data.roleId, context.businessId);
      if (!newRole) {
        return NextResponse.json({ error: "Role not found." }, { status: 400 });
      }
      if (!newRole.isSystemDefault) {
        const currentRole = await findRoleById(String(target.roleId), context.businessId);
        if (currentRole?.isSystemDefault) {
          const adminCount = await countActiveMembershipsWithRole(
            context.businessId,
            String(currentRole._id),
          );
          if (adminCount <= 1) {
            return NextResponse.json(
              { error: "This would leave the business with no active Admin." },
              { status: 409 },
            );
          }
        }
      }
      await updateMembershipRole(membershipId, context.businessId, parsed.data.roleId);
    }

    if ("status" in body) {
      const parsed = changeMembershipStatusSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      if (parsed.data.status === "deactivated") {
        const role = await findRoleById(String(target.roleId), context.businessId);
        if (role?.isSystemDefault) {
          const adminCount = await countActiveMembershipsWithRole(
            context.businessId,
            String(role._id),
          );
          if (adminCount <= 1) {
            return NextResponse.json(
              { error: "Can't deactivate the last active Admin." },
              { status: 409 },
            );
          }
        }
      }
      await setMembershipStatus(membershipId, context.businessId, parsed.data.status);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
