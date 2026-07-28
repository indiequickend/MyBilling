import { redirect } from "next/navigation";
import { countUsers } from "@/lib/db/queries/users";
import { AuthCard, FormNotice } from "@/components/auth/AuthCard";
import { LoginForm } from "./LoginForm";

// Reads live DB state (whether any user exists yet) — must never be statically
// prerendered/cached, and this also avoids a build-time database call.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  if ((await countUsers()) === 0) {
    redirect("/setup");
  }

  const { reset } = await searchParams;

  return (
    <AuthCard title="Log in">
      {reset === "success" ? (
        <FormNotice message="Your password was reset. Please log in." />
      ) : null}
      <LoginForm />
    </AuthCard>
  );
}
