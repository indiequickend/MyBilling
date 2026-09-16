"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronsUpDownIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** A searchable, type-to-filter alternative to SelectField for lists a user is likely to scroll
 * past (customers, vendors, products, …) — same drop-in API (hidden input + name) so it plugs
 * into existing server-action forms without touching submission handling. */
export function ComboboxField({
  name,
  defaultValue = "",
  value: controlledValue,
  placeholder,
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
  options,
  required,
  disabled,
  className,
  onValueChange,
}: {
  /** Omit when the caller renders its own parent-state-controlled hidden input instead — see
   * the equivalent note on SelectField. */
  name?: string;
  defaultValue?: string;
  /** Opt into controlled mode — e.g. a party combobox that must re-select the option it just
   * created via a quick-add dialog. Omit for the normal defaultValue-only/uncontrolled usage. */
  value?: string;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(controlledValue ?? defaultValue);

  useEffect(() => {
    if (controlledValue !== undefined) setValue(controlledValue);
  }, [controlledValue]);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label,
    [options, value],
  );

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            disabled={disabled}
            className={cn(
              "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
              !selectedLabel && "text-muted-foreground",
              className,
            )}
          >
            <span className="truncate">{selectedLabel || placeholder}</span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popper-anchor-width) p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList id={listId}>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value || "__none__"}
                    value={o.value || "__none__"}
                    keywords={[o.label]}
                    data-checked={o.value === value}
                    onSelect={() => {
                      setValue(o.value);
                      onValueChange?.(o.value);
                      setOpen(false);
                    }}
                  >
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
