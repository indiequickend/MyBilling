"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Wallet, Users, Building2, MoreHorizontal, type LucideIcon } from "lucide-react";
import type { NavGroup, NavItem, NavIconKey } from "@/lib/dashboard/navigation";
import { MobileSidebar } from "@/components/dashboard/MobileSidebar";
import { cn } from "@/lib/utils";

const ICONS: Partial<Record<NavIconKey, LucideIcon>> = {
  dashboard: LayoutDashboard,
  invoices: FileText,
  payments: Wallet,
  customers: Users,
  vendors: Building2,
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Fixed mobile bottom tab bar (`md:hidden`) — the desktop `SidebarNav` covers
 * `≥md` unchanged. Renders `buildBottomTabItems()`'s RBAC-filtered items plus
 * a fixed "More" tab that opens the full nav tree via `MobileSidebar`.
 */
export function BottomTabBar({
  items,
  main,
  settings,
}: {
  items: NavItem[];
  main: NavGroup[];
  settings: NavGroup | null;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t bg-sidebar text-sidebar-foreground pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? FileText;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
              active ? "font-semibold text-sidebar-primary" : "text-sidebar-foreground/70",
            )}
          >
            <Icon className="size-5" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
      <MobileSidebar
        main={main}
        settings={settings}
        trigger={
          <button
            type="button"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-sidebar-foreground/70"
            aria-label="More"
          >
            <MoreHorizontal className="size-5" />
            <span className="truncate">More</span>
          </button>
        }
      />
    </nav>
  );
}
