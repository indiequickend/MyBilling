import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { buildNavGroups } from "@/lib/dashboard/navigation";
import { SidebarNav } from "@/components/dashboard/SidebarNav";
import { Topbar } from "@/components/dashboard/Topbar";

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

  const { main, settings } = buildNavGroups(context.membership);
  // Plain-serialize before crossing into client components — `context.businesses` holds full
  // Mongoose documents (ObjectId/toJSON), which React cannot pass as Client Component props.
  const businesses = context.businesses.map((b) => ({ _id: String(b._id), name: b.name }));

  return (
    <div className="flex min-h-screen bg-muted/30">
      <SidebarNav main={main} settings={settings} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          userName={context.user.name}
          businesses={businesses}
          activeBusinessId={context.activeBusinessId}
          main={main}
          settings={settings}
        />
        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
