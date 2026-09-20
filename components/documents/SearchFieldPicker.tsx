"use client";

import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePersistedSelection } from "@/lib/hooks/usePersistedSelection";

export type SearchFieldOption = { id: string; label: string; defaultChecked: boolean };

/**
 * "Search in" chooser rendered inside the list's search <form>. The menu content is portaled
 * outside the form, so the selection is submitted through hidden `qf` inputs. The choice is
 * remembered per list in localStorage; a `qf` already in the URL (the current search) wins over
 * the saved one.
 */
export function SearchFieldPicker({
  options,
  urlSelected,
  storageKey,
}: {
  options: SearchFieldOption[];
  urlSelected: string[];
  storageKey: string;
}) {
  const defaults = options.filter((o) => o.defaultChecked).map((o) => o.id);
  const { selected, update, reset } = usePersistedSelection(
    storageKey,
    defaults,
    options.map((o) => o.id),
    { initial: urlSelected.length > 0 ? urlSelected : undefined, skipLoad: urlSelected.length > 0 },
  );

  function toggle(id: string, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((v) => v !== id);
    if (next.length === 0) return;
    update(options.filter((o) => next.includes(o.id)).map((o) => o.id));
  }

  return (
    <>
      {selected.map((id) => (
        <input key={id} type="hidden" name="qf" value={id} />
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            <ListFilter data-icon="inline-start" />
            Search in ({selected.length})
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 w-56 overflow-y-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Search these fields</DropdownMenuLabel>
            {options.map((o) => (
              <DropdownMenuCheckboxItem
                key={o.id}
                checked={selected.includes(o.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => toggle(o.id, checked === true)}
              >
                {o.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              reset();
            }}
          >
            Reset to default
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
