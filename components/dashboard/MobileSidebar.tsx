"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { NavGroup } from "@/lib/dashboard/navigation";
import { NavLinks } from "@/components/dashboard/NavLinks";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Full RBAC-filtered nav tree in a Sheet. `trigger` is caller-supplied — on
 * mobile widths this is opened from the bottom tab bar's "More" tab, not a
 * standalone hamburger button.
 */
export function MobileSidebar({
  main,
  settings,
  trigger,
}: {
  main: NavGroup[];
  settings: NavGroup | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b">
          <SheetTitle asChild>
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2 font-heading">
              <Image src="/icons/icon-192.png" alt="" width={24} height={24} className="size-6 shrink-0 rounded-md" />
              MyBilling
            </Link>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <NavLinks groups={main} onNavigate={() => setOpen(false)} />
          {settings ? (
            <>
              <Separator className="my-3" />
              <NavLinks groups={[settings]} onNavigate={() => setOpen(false)} />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
