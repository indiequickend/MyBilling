import { redirect } from "next/navigation";
import { countUsers } from "@/lib/db/queries/users";
import { AuthCard } from "@/components/auth/AuthCard";
import { SetupForm } from "./SetupForm";

// Reads live DB state (whether any user exists yet) — must never be statically
// prerendered/cached, and this also avoids a build-time database call.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await countUsers()) > 0) {
    redirect("/login");
  }

  return (
    <AuthCard
      title="Set up your instance"
      subtitle="Create the first administrator account. This page disables itself once it's used."
    >
      <SetupForm />
    </AuthCard>
  );
}
