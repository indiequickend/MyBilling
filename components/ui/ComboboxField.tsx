"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  onSearch,
  onResolveLabel,
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
  /** Server-side search for lists too large to preload in full. When set, typing queries this
   * (debounced) instead of filtering `options` in the browser, so every record is searchable; with
   * an empty query the preloaded `options` are shown as usual. */
  onSearch?: (query: string) => Promise<Array<{ value: string; label: string }>>;
  /** Resolves the label of a selected value that isn't in `options` (paired with onSearch). */
  onResolveLabel?: (value: string) => Promise<string | undefined>;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(controlledValue ?? defaultValue);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ value: string; label: string }> | null>(null);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">("idle");
  // Labels of every option ever shown, so the selected label survives the result list changing.
  const knownLabels = useRef(new Map<string, string>());
  const searchSeq = useRef(0);
  const [labelTick, setLabelTick] = useState(0);
  const searching = Boolean(onSearch) && query.trim() !== "";

  useEffect(() => {
    if (controlledValue !== undefined) setValue(controlledValue);
  }, [controlledValue]);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? knownLabels.current.get(value),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labelTick re-reads the knownLabels ref
    [options, value, labelTick],
  );

  useEffect(() => {
    if (!onResolveLabel || !value || selectedLabel) return;
    let cancelled = false;
    onResolveLabel(value)
      .then((label) => {
        if (cancelled || !label) return;
        knownLabels.current.set(value, label);
        setLabelTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value, selectedLabel, onResolveLabel]);

  useEffect(() => {
    if (!onSearch) return;
    const q = query.trim();
    if (!q) {
      searchSeq.current++;
      setResults(null);
      setSearchState("idle");
      return;
    }
    setSearchState("loading");
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      onSearch(q)
        .then((found) => {
          if (seq !== searchSeq.current) return; // a newer query superseded this one
          for (const o of found) knownLabels.current.set(o.value, o.label);
          setResults(found);
          setSearchState("idle");
        })
        .catch(() => {
          if (seq !== searchSeq.current) return;
          setResults([]);
          setSearchState("error");
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  const shown = searching ? (results ?? []) : options;

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
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
          <Command shouldFilter={!onSearch}>
            <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
            <CommandList id={listId}>
              <CommandEmpty>
                {searching && searchState === "loading"
                  ? "Searching…"
                  : searchState === "error"
                    ? "Search failed. Try again."
                    : emptyText}
              </CommandEmpty>
              <CommandGroup>
                {shown.map((o) => (
                  <CommandItem
                    key={o.value || "__none__"}
                    value={o.value || "__none__"}
                    keywords={[o.label]}
                    data-checked={o.value === value}
                    onSelect={() => {
                      knownLabels.current.set(o.value, o.label);
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
