import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { SignatureForm } from "../SignatureForm";

export default async function NewSignaturePage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return (
      <p className="text-sm text-destructive">You don&apos;t have permission to create signatures.</p>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New signature</h1>
      <SignatureForm mode="create" />
    </div>
  );
}
