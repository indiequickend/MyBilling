"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Users, Building2, Wallet, Plus, type LucideIcon } from "lucide-react";
import type { NavItem, NavIconKey } from "@/lib/dashboard/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const ICONS: Partial<Record<NavIconKey, LucideIcon>> = {
  invoices: FileText,
  customers: Users,
  vendors: Building2,
  payments: Wallet,
};

/** Mobile-only (`md:hidden`) primary action in the Topbar — RBAC-filtered shortcuts from `buildQuickCreateItems()`. */
export function QuickCreateSheet({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" size="icon" className="md:hidden" aria-label="Quick create">
          <Plus />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <SheetHeader>
          <SheetTitle>Quick create</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-4 pb-2">
          {items.map((item) => {
            const Icon = ICONS[item.icon] ?? FileText;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-2.5 py-2.5 text-sm hover:bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
