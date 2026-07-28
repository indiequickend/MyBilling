import Link from "next/link";
import { hashToken } from "@/lib/auth/tokens";
import { findValidInvitationByTokenHash } from "@/lib/db/queries/invitations";
import { findUserByEmail } from "@/lib/db/queries/users";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { getCurrentUser } from "@/lib/auth/context";
import { AuthCard } from "@/components/auth/AuthCard";
import { NewUserAcceptForm, ExistingUserAcceptForm } from "./AcceptInviteForms";

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthCard title="Invalid invitation">
        <p className="text-sm text-slate-600">This invitation link is missing its token.</p>
      </AuthCard>
    );
  }

  const invitation = await findValidInvitationByTokenHash(hashToken(token));
  if (!invitation) {
    return (
      <AuthCard title="Invalid or expired invitation">
        <p className="text-sm text-slate-600">
          This invitation link is invalid or has expired. Ask the business admin to send a new one.
        </p>
      </AuthCard>
    );
  }

  const business = await findBusinessById(String(invitation.businessId));
  const subtitle = business ? `Join ${business.name}` : undefined;

  const existingUser = await findUserByEmail(invitation.email);
  if (!existingUser) {
    return (
      <AuthCard title="Accept your invitation" subtitle={subtitle}>
        <NewUserAcceptForm token={token} email={invitation.email} />
      </AuthCard>
    );
  }

  const currentUser = await getCurrentUser();
  if (currentUser && currentUser.email === invitation.email) {
    return (
      <AuthCard title="Accept your invitation" subtitle={subtitle}>
        <ExistingUserAcceptForm token={token} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Log in to accept" subtitle={subtitle}>
      <p className="text-sm text-slate-600">
        An account already exists for <span className="font-medium">{invitation.email}</span>. Log
        in as that account, then return to this link to accept.
      </p>
      <Link href="/login" className="block text-sm font-medium text-slate-900 underline">
        Go to login
      </Link>
    </AuthCard>
  );
}
