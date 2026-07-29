import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthCard title="Invalid link">
        <p className="text-sm text-muted-foreground">This password reset link is missing its token.</p>
        <Link
          href="/forgot-password"
          className="block text-sm font-medium underline underline-offset-4"
        >
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
