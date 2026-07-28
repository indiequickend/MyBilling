"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { inviteUserSchema } from "@/lib/validation/users";
import { findUserByEmail } from "@/lib/db/queries/users";
import {
  findMembership,
  findMembershipById,
  setMembershipStatus,
  updateMembershipRole,
  countActiveMembershipsWithRole,
} from "@/lib/db/queries/memberships";
import { createInvitation } from "@/lib/db/queries/invitations";
import { findRoleById } from "@/lib/db/queries/roles";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sendInvitationEmail } from "@/lib/auth/mailer";
import { absoluteUrl } from "@/lib/auth/urls";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";

export type UsersPageState = { error?: string; success?: string };

async function requireManageUsers() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_users");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

export async function inviteUserAction(
  _prev: UsersPageState,
  formData: FormData,
): Promise<UsersPageState> {
  const context = await requireManageUsers();

  const h = await headers();
  if (!checkRateLimit(rateLimitKeyFromHeaders(h, "invite-user"), 20, 60_000)) {
    return { error: "Too many invitations sent. Please wait a moment and try again." };
  }

  const parsed = inviteUserSchema.safeParse({
    email: formData.get("email"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, roleId } = parsed.data;

  const role = await findRoleById(roleId, context.activeBusinessId);
  if (!role) {
    return { error: "Select a valid role." };
  }

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    const existingMembership = await findMembership(
      String(existingUser._id),
      context.activeBusinessId,
    );
    if (existingMembership) {
      return { error: "This person is already a member of this business." };
    }
  }

  const business = await findBusinessById(context.activeBusinessId);
  const token = generateToken();
  await createInvitation({
    businessId: context.activeBusinessId,
    email,
    roleId,
    tokenHash: hashToken(token),
    invitedByUserId: context.membership.userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  await sendInvitationEmail(
    email,
    business?.name ?? "the business",
    absoluteUrl(`/accept-invite?token=${token}`),
  );

  return { success: `Invitation sent to ${email}.` };
}

export async function changeMembershipRoleAction(formData: FormData): Promise<void> {
  const context = await requireManageUsers();

  const membershipId = String(formData.get("membershipId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  if (!membershipId || !roleId) return;

  const targetMembership = await findMembershipById(membershipId, context.activeBusinessId);
  if (!targetMembership) return;

  const newRole = await findRoleById(roleId, context.activeBusinessId);
  if (!newRole) return;

  // Refuse a reassignment that would leave the business with zero active Admins.
  if (!newRole.isSystemDefault) {
    const currentRole = await findRoleById(
      String(targetMembership.roleId),
      context.activeBusinessId,
    );
    if (currentRole?.isSystemDefault) {
      const adminCount = await countActiveMembershipsWithRole(
        context.activeBusinessId,
        String(currentRole._id),
      );
      if (adminCount <= 1) return;
    }
  }

  await updateMembershipRole(membershipId, context.activeBusinessId, roleId);
}

export async function setMembershipStatusAction(formData: FormData): Promise<void> {
  const context = await requireManageUsers();

  const membershipId = String(formData.get("membershipId") ?? "");
  const status = formData.get("status") === "deactivated" ? "deactivated" : "active";
  if (!membershipId) return;

  if (status === "deactivated") {
    const targetMembership = await findMembershipById(membershipId, context.activeBusinessId);
    if (targetMembership) {
      const role = await findRoleById(String(targetMembership.roleId), context.activeBusinessId);
      if (role?.isSystemDefault) {
        const adminCount = await countActiveMembershipsWithRole(
          context.activeBusinessId,
          String(role._id),
        );
        if (adminCount <= 1) return; // never deactivate the last admin
      }
    }
  }

  await setMembershipStatus(membershipId, context.activeBusinessId, status);
}
