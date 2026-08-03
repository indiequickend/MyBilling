"use client";

import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/dashboard/navigation";

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Longest-matching-href nav label wins, so a sub-page (e.g. a credit note child link) beats its parent group. */
function resolveTitle(pathname: string, groups: NavGroup[]): string | null {
  let best: { href: string; label: string } | null = null;
  for (const group of groups) {
    for (const candidate of [group, ...(group.children ?? [])]) {
      if (isActivePath(pathname, candidate.href) && (!best || candidate.href.length > best.href.length)) {
        best = candidate;
      }
    }
  }
  return best?.label ?? null;
}

/**
 * Derives the mobile Topbar's page title from the same RBAC-filtered nav data
 * every page already contributes a label to — no per-page title wiring needed.
 */
export function MobileTopbarTitle({ main, settings }: { main: NavGroup[]; settings: NavGroup | null }) {
  const pathname = usePathname();
  const groups = settings ? [...main, settings] : main;
  const title = resolveTitle(pathname, groups);

  return (
    <h1 className="min-w-0 flex-1 truncate font-heading text-sm font-semibold text-foreground md:hidden">
      {title ?? "MyBilling"}
    </h1>
  );
}
