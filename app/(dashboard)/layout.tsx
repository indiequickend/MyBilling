import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { Sidebar } from "@/components/dashboard/Sidebar";

// Every page under this layout depends on the live session/business/permission
// state for the current request — none of it may be statically prerendered or
// cached, and forcing it here (rather than relying on cookies() usage to imply
// it) also guarantees no build-time database call.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getDashboardContext();
  if (!context) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        userName={context.user.name}
        businesses={context.businesses}
        activeBusinessId={context.activeBusinessId}
        membership={context.membership}
      />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
