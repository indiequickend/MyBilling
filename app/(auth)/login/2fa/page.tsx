import { redirect } from "next/navigation";
import { getPendingLoginUserId } from "@/lib/auth/pendingLogin";
import { AuthCard } from "@/components/auth/AuthCard";
import { TwoFactorForm } from "./TwoFactorForm";

export default async function TwoFactorPage() {
  const pendingUserId = await getPendingLoginUserId();
  if (!pendingUserId) {
    redirect("/login");
  }

  return (
    <AuthCard
      title="Two-factor verification"
      subtitle="Enter the code from your authenticator app."
    >
      <TwoFactorForm />
    </AuthCard>
  );
}
