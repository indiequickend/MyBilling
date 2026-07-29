"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { NavGroup } from "@/lib/dashboard/navigation";
import { NavLinks } from "@/components/dashboard/NavLinks";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mybilling:sidebar-collapsed";

export function SidebarNav({ main, settings }: { main: NavGroup[]; settings: NavGroup | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] md:flex",
        hydrated ? "" : "invisible",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b px-4",
          collapsed && "flex-col justify-center gap-2 px-0 py-2",
        )}
      >
        <Link href="/" className="flex flex-1 items-center gap-2 font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
            M
          </span>
          {collapsed ? null : <span>MyBilling</span>}
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <NavLinks groups={main} collapsed={collapsed} />
        {settings ? (
          <>
            <Separator className="my-3" />
            <NavLinks groups={[settings]} collapsed={collapsed} />
          </>
        ) : null}
      </div>
    </aside>
  );
}
