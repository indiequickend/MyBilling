import type { NavGroup } from "@/lib/dashboard/navigation";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { MobileSidebar } from "@/components/dashboard/MobileSidebar";
import { AvatarMenu } from "@/components/dashboard/AvatarMenu";
import { SearchShortcut } from "@/components/dashboard/SearchShortcut";

export function Topbar({
  userName,
  businesses,
  activeBusinessId,
  main,
  settings,
}: {
  userName: string;
  businesses: Array<{ _id: string; name: string }>;
  activeBusinessId: string | null;
  main: NavGroup[];
  settings: NavGroup | null;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:px-4">
      <MobileSidebar main={main} settings={settings} />
      <BusinessSwitcher businesses={businesses} activeBusinessId={activeBusinessId} />
      <div className="flex-1" />
      <SearchShortcut />
      <AvatarMenu userName={userName} />
    </header>
  );
}
