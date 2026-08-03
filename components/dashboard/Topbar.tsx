import type { NavGroup, NavItem } from "@/lib/dashboard/navigation";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { MobileTopbarTitle } from "@/components/dashboard/MobileTopbarTitle";
import { QuickCreateSheet } from "@/components/dashboard/QuickCreateSheet";
import { AvatarMenu } from "@/components/dashboard/AvatarMenu";
import { SearchShortcut } from "@/components/dashboard/SearchShortcut";

export function Topbar({
  userName,
  businesses,
  activeBusinessId,
  main,
  settings,
  quickCreateItems,
}: {
  userName: string;
  businesses: Array<{ _id: string; name: string }>;
  activeBusinessId: string | null;
  main: NavGroup[];
  settings: NavGroup | null;
  quickCreateItems: NavItem[];
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 md:px-4">
      <BusinessSwitcher businesses={businesses} activeBusinessId={activeBusinessId} />
      <MobileTopbarTitle main={main} settings={settings} />
      <div className="hidden flex-1 md:block" />
      <SearchShortcut />
      <QuickCreateSheet items={quickCreateItems} />
      <AvatarMenu userName={userName} />
    </header>
  );
}
