import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { buildNavGroups, buildBottomTabItems, buildQuickCreateItems } from "@/lib/dashboard/navigation";
import { SidebarNav } from "@/components/dashboard/SidebarNav";
import { Topbar } from "@/components/dashboard/Topbar";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";

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
  const bottomTabItems = buildBottomTabItems(context.membership);
  const quickCreateItems = buildQuickCreateItems(context.membership);
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
          quickCreateItems={quickCreateItems}
        />
        {/* pb-16 on mobile reserves space for the fixed BottomTabBar so content never sits under it. */}
        <main className="min-w-0 flex-1 p-4 pb-20 md:p-6 md:pb-6 lg:p-8">{children}</main>
      </div>
      <BottomTabBar items={bottomTabItems} main={main} settings={settings} />
    </div>
  );
}
