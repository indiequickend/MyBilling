"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
}: {
  dateFrom?: string;
  dateTo?: string;
}) {
  const [range, setRange] = useState<DateRange | undefined>({
    from: fromIso(dateFrom),
    to: fromIso(dateTo),
  });

  const label =
    range?.from && range?.to
      ? `${range.from.toLocaleDateString()} – ${range.to.toLocaleDateString()}`
      : range?.from
        ? range.from.toLocaleDateString()
        : "Date range";

  return (
    <Popover>
      <input type="hidden" name="dateFrom" value={toIso(range?.from) ?? ""} readOnly />
      <input type="hidden" name="dateTo" value={toIso(range?.to) ?? ""} readOnly />
      <PopoverTrigger asChild>
        <Button variant="outline" type="button">
          <CalendarDays data-icon="inline-start" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />
      </PopoverContent>
    </Popover>
  );
}
