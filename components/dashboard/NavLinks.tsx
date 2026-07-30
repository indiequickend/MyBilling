"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Building,
  Building2,
  ChevronDown,
  ClipboardList,
  FileBarChart2,
  FileCheck2,
  FileStack,
  FileText,
  LandmarkIcon,
  LayoutDashboard,
  ListChecks,
  Package,
  PenTool,
  ShieldCheck,
  ShoppingCart,
  Receipt,
  SlidersHorizontal,
  UserCircle,
  Users,
  UsersRound,
  Warehouse,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NavGroup, NavIconKey } from "@/lib/dashboard/navigation";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  invoices: FileText,
  quotations: ClipboardList,
  purchases: ShoppingCart,
  expenses: Receipt,
  customers: Users,
  vendors: Building2,
  products: Package,
  warehouses: Warehouse,
  payments: Wallet,
  settings: SlidersHorizontal,
  profile: UserCircle,
  company: Building,
  preferences: SlidersHorizontal,
  signatures: PenTool,
  notesTerms: FileStack,
  documentFields: ListChecks,
  banks: LandmarkIcon,
  users: UsersRound,
  roles: ShieldCheck,
  insights: BarChart3,
  reports: FileBarChart2,
  gst: FileCheck2,
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon,
  active,
  collapsed,
  onNavigate,
  indent,
}: {
  href: string;
  label: string;
  icon: NavIconKey;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  indent?: boolean;
}) {
  const Icon = ICONS[icon];
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        collapsed ? "justify-center px-2" : indent ? "pl-9" : "",
        active
          ? "font-semibold text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {collapsed ? null : <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function NavLinks({
  groups,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {groups.map((group) => {
        const groupActive = isActive(pathname, group.href);
        if (!group.children) {
          return (
            <NavLink
              key={group.href}
              href={group.href}
              label={group.label}
              icon={group.icon}
              active={groupActive}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          );
        }

        const childActive = group.children.some((c) => isActive(pathname, c.href));

        if (collapsed) {
          // Icon-rail mode: children are unreachable via disclosure, so link
          // straight to the group's own page; sub-pages stay reachable by
          // expanding the sidebar.
          return (
            <NavLink
              key={group.href}
              href={group.href}
              label={group.label}
              icon={group.icon}
              active={groupActive || childActive}
              collapsed
              onNavigate={onNavigate}
            />
          );
        }

        return (
          <GroupDisclosure
            key={group.href}
            group={group}
            pathname={pathname}
            active={groupActive}
            childActive={childActive}
            onNavigate={onNavigate}
          />
        );
      })}
    </nav>
  );
}

function GroupDisclosure({
  group,
  pathname,
  active,
  childActive,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  active: boolean;
  childActive: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(childActive);
  const Icon = ICONS[group.icon];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "flex items-center rounded-md pr-1 text-sm transition-colors",
          active || childActive
            ? "font-semibold text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Link
          href={group.href}
          onClick={onNavigate}
          className="flex flex-1 items-center gap-2.5 px-2.5 py-1.5"
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{group.label}</span>
        </Link>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={open ? `Collapse ${group.label}` : `Expand ${group.label}`}
            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="flex flex-col gap-0.5 pt-0.5">
        {group.children?.map((child) => (
          <NavLink
            key={child.href}
            href={child.href}
            label={child.label}
            icon={child.icon}
            active={isActive(pathname, child.href)}
            indent
            onNavigate={onNavigate}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
