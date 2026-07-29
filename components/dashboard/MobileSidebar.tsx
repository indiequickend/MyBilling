"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import type { NavGroup } from "@/lib/dashboard/navigation";
import { NavLinks } from "@/components/dashboard/NavLinks";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileSidebar({ main, settings }: { main: NavGroup[]; settings: NavGroup | null }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b">
          <SheetTitle asChild>
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
                M
              </span>
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
