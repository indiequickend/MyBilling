import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";

export default async function PreferencesLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_preferences")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-lg font-semibold">Preferences</h1>
      {children}
    </div>
  );
}
