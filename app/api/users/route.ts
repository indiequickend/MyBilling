import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { requireCsrf } from "@/lib/auth/csrf";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";
import { inviteUserSchema } from "@/lib/validation/users";
import { listMembershipsForBusiness, findMembership } from "@/lib/db/queries/memberships";
import { findRoleById } from "@/lib/db/queries/roles";
import { findUserByEmail } from "@/lib/db/queries/users";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { createInvitation } from "@/lib/db/queries/invitations";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sendInvitationEmail } from "@/lib/auth/mailer";
import { absoluteUrl } from "@/lib/auth/urls";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

export async function GET() {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "settings", "manage_users");

    const members = await listMembershipsForBusiness(context.businessId);
    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "settings", "manage_users");

    if (!checkRateLimit(rateLimitKeyFromHeaders(request.headers, "invite-user-api"), 20, 60_000)) {
      return NextResponse.json({ error: "Too many invitations sent." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = inviteUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { email, roleId } = parsed.data;

    const role = await findRoleById(roleId, context.businessId);
    if (!role) {
      return NextResponse.json({ error: "Select a valid role." }, { status: 400 });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      const existingMembership = await findMembership(String(existingUser._id), context.businessId);
      if (existingMembership) {
        return NextResponse.json(
          { error: "This person is already a member of this business." },
          { status: 409 },
        );
      }
    }

    const business = await findBusinessById(context.businessId);
    const token = generateToken();
    await createInvitation({
      businessId: context.businessId,
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
