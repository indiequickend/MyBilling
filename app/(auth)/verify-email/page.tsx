import Link from "next/link";
import { hashToken } from "@/lib/auth/tokens";
import { findValidToken, markTokenUsed } from "@/lib/db/queries/verificationTokens";
import { setEmailVerified } from "@/lib/db/queries/users";
import { AuthCard } from "@/components/auth/AuthCard";

// This page mutates data (consumes the token) as a side effect of rendering —
// it must run per-request and never be prerendered/cached at build time.
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let success = false;
  if (token) {
    const record = await findValidToken(hashToken(token), "email_verify");
    if (record) {
      await setEmailVerified(String(record.userId));
      await markTokenUsed(String(record._id));
      success = true;
    }
  }

  return (
    <AuthCard title={success ? "Email verified" : "Invalid or expired link"}>
      <p className="text-sm text-muted-foreground">
        {success
          ? "Your email has been verified. You can now log in."
          : "This verification link is invalid or has expired. Try logging in to request a new one."}
      </p>
      <Link href="/login" className="block text-sm font-medium underline underline-offset-4">
        Go to login
      </Link>
    </AuthCard>
  );
}
