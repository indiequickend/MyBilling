import { getDashboardContext } from "@/lib/auth/dashboardContext";

export default async function DashboardHomePage() {
  const context = await getDashboardContext();

  if (!context || context.businesses.length === 0) {
    return (
      <div>
        <h1 className="mb-1 text-lg font-semibold text-slate-900">Welcome</h1>
        <p className="text-sm text-slate-500">
          You don&apos;t belong to any business yet. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Dashboard</h1>
      <p className="text-sm text-slate-500">
        Signed in as {context.user.name}. Sales, purchases, and everything else land in later phases
        — Phase 1 is the auth/tenancy/RBAC foundation.
      </p>
    </div>
  );
}
