"use client";

import { useRef } from "react";
import Link from "next/link";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { switchBusinessAction } from "@/app/(dashboard)/businesses/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BusinessSwitcher({
  businesses,
  activeBusinessId,
}: {
  businesses: Array<{ _id: string; name: string }>;
  activeBusinessId: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = businesses.find((b) => String(b._id) === activeBusinessId);

  if (businesses.length === 0) return null;

  return (
    <>
      <form ref={formRef} action={switchBusinessAction} className="hidden">
        <input ref={inputRef} type="hidden" name="businessId" />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="max-w-28 justify-start gap-2 px-2 sm:max-w-48">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{active?.name ?? "Select business"}</span>
            <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            {businesses.map((b) => {
              const id = String(b._id);
              const isActive = id === activeBusinessId;
              return (
                <DropdownMenuItem
                  key={id}
                  onSelect={() => {
                    if (isActive) return;
                    if (inputRef.current) inputRef.current.value = id;
                    formRef.current?.requestSubmit();
                  }}
                >
                  <Building2 className="text-muted-foreground" />
                  <span className="flex-1 truncate">{b.name}</span>
                  {isActive ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href="/businesses/new">
                <Plus className="text-muted-foreground" />
                Add another business
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
