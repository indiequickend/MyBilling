import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResendVerificationForm } from "./ResendVerificationForm";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ purpose?: string; email?: string }>;
}) {
  const { purpose, email } = await searchParams;
  const isVerify = purpose !== "reset";

  const heading = isVerify ? "Verify your email" : "Check your email";
  const body = isVerify
    ? "We've sent a verification link to your email address. You must verify it before you can log in."
    : "If an account exists for that address, we've sent a link to reset your password.";

  return (
    <AuthCard title={heading} subtitle={email}>
      <p className="text-sm text-slate-600">{body}</p>
      {isVerify && email ? <ResendVerificationForm email={email} /> : null}
      <Link href="/login" className="block text-sm font-medium text-slate-900 underline">
        Back to login
      </Link>
    </AuthCard>
  );
}
