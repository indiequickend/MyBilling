import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { BankAccountForm } from "../BankAccountForm";

export default async function NewBankAccountPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_banking")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create accounts.</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New bank account</h1>
      <BankAccountForm mode="create" />
    </div>
  );
}
