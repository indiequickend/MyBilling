import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";

/**
 * The shared date-range filter every report page uses (project_spec.md: "each with a
 * date-range picker") — a thin GET-form wrapper around the existing DateRangeFilter
 * (components/dashboard/DateRangeFilter.tsx, already used by Invoices/Purchases) rather than a
 * second date-picker implementation.
 */
export function ReportFilterBar({
  dateFrom,
  dateTo,
  fyStartMonth,
  extraHiddenParams,
}: {
  dateFrom?: string;
  dateTo?: string;
  /** Business's fiscal-year start month (1-12) — drives the "FY 25-26" presets. */
  fyStartMonth?: number;
  extraHiddenParams?: Record<string, string | undefined>;
}) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
      {extraHiddenParams
        ? Object.entries(extraHiddenParams).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )
        : null}
      <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} fyStartMonth={fyStartMonth} />
      <Button type="submit" variant="outline">
        Filter
      </Button>
    </form>
  );
}
