"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildDateRangePresets } from "@/lib/reports/dateRangePresets";

function toIso(date: Date | undefined) {
  return date ? date.toLocaleDateString("en-CA") : undefined;
}

function fromIso(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  fyStartMonth = 4,
}: {
  dateFrom?: string;
  dateTo?: string;
  /** Business's fiscal-year start month (1-12) — drives the "FY 25-26" presets. */
  fyStartMonth?: number;
}) {
  const [range, setRange] = useState<DateRange | undefined>({
    from: fromIso(dateFrom),
    to: fromIso(dateTo),
  });
  const [open, setOpen] = useState(false);
  const dateFromInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const presets = buildDateRangePresets(fyStartMonth);

  // Explicit locale — this renders during SSR (Node's default locale) and again on hydration
  // (the browser's locale); a bare toLocaleDateString() can format differently between the two
  // and trigger a hydration mismatch. "en-IN" matches the locale used elsewhere in the app.
  const label =
    range?.from && range?.to
      ? `${range.from.toLocaleDateString("en-IN")} – ${range.to.toLocaleDateString("en-IN")}`
      : range?.from
        ? range.from.toLocaleDateString("en-IN")
        : "Date range";

  function applyPreset(from: string, to: string) {
    setRange({ from: fromIso(from), to: fromIso(to) });
    setOpen(false);

    // Presets are a "quick filter" action — apply immediately rather than requiring the
    // surrounding form's separate Filter/Search button, unlike manual calendar selection.
    // A native form.requestSubmit() here would force a full browser navigation (hard reload,
    // losing client state); router.push does the same URL/query-param update as a soft,
    // client-side transition instead. Read the form's *other* fields generically (extra
    // report filters, search query, tab, page, …) rather than hardcoding their names, and
    // override dateFrom/dateTo with the preset values directly since the hidden inputs above
    // won't reflect the new range until after this render.
    const form = dateFromInputRef.current?.closest("form");
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string" && value !== "") params.set(key, value);
    }
    params.set("dateFrom", from);
    params.set("dateTo", to);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input
        ref={dateFromInputRef}
        type="hidden"
        name="dateFrom"
        value={toIso(range?.from) ?? ""}
        readOnly
      />
      <input type="hidden" name="dateTo" value={toIso(range?.to) ?? ""} readOnly />
      <PopoverTrigger asChild>
        <Button variant="outline" type="button">
          <CalendarDays data-icon="inline-start" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex">
          <div className="flex flex-col gap-0.5 border-r p-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start font-normal"
                onClick={() => applyPreset(preset.from, preset.to)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
