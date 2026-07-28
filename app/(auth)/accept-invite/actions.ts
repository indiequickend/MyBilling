"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { acceptInviteNewUserSchema } from "@/lib/validation/auth";
import {
  findValidInvitationByTokenHash,
  markInvitationAccepted,
} from "@/lib/db/queries/invitations";
import { findUserByEmail, createUser } from "@/lib/db/queries/users";
import { createMembership, findMembership } from "@/lib/db/queries/memberships";
import { hashPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/context";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";

export type AcceptInviteState = { error?: string };

export async function acceptInviteNewUserAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const h = await headers();
  if (!checkRateLimit(rateLimitKeyFromHeaders(h, "accept-invite"), 10, 60_000)) {
    return { error: "Too many attempts. Please wait a moment and try again." };
  }

  const parsed = acceptInviteNewUserSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { token, name, password } = parsed.data;

  const invitation = await findValidInvitationByTokenHash(hashToken(token));
  if (!invitation) {
    return { error: "This invitation is invalid or has expired." };
  }

  const existing = await findUserByEmail(invitation.email);
  if (existing) {
    return { error: "An account already exists for this email. Please log in to accept." };
  }

  const passwordHash = await hashPassword(password);
  // The invitation itself was emailed to this address, so receipt of a valid,
  // unexpired token is treated as proof of ownership — no separate verification email needed.
  const user = await createUser({
    email: invitation.email,
    passwordHash,
    name,
    emailVerifiedAt: new Date(),
  });

  await createMembership({
    userId: String(user._id),
    businessId: String(invitation.businessId),
    roleId: String(invitation.roleId),
    status: "active",
  });
  await markInvitationAccepted(String(invitation._id));

  await createSession(String(user._id));
  redirect("/");
}

export async function acceptInviteExistingUserAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "");
  const invitation = await findValidInvitationByTokenHash(hashToken(token));
  if (!invitation) {
    return { error: "This invitation is invalid or has expired." };
  }

  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.email !== invitation.email) {
    return { error: "Log in as the invited email address to accept this invitation." };
  }

  const existingMembership = await findMembership(
    String(currentUser._id),
    String(invitation.businessId),
  );
  if (!existingMembership) {
    await createMembership({
      userId: String(currentUser._id),
      businessId: String(invitation.businessId),
      roleId: String(invitation.roleId),
      status: "active",
    });
  }
  await markInvitationAccepted(String(invitation._id));

  redirect("/");
}
