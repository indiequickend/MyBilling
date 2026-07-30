import { Button } from "@/components/ui/button";

/**
 * A thin GET-form period picker for the GST pages — GST returns are always calendar months
 * ("YYYY-MM"), unlike every other report's free-form date range (components/reports/
 * ReportFilterBar.tsx), so this uses a native `<input type="month">` instead of that shared
 * date-range picker.
 */
export function GstPeriodFilterBar({ period }: { period: string }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
      <input
        type="month"
        name="period"
        defaultValue={period}
        required
        className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button type="submit" variant="outline">
        View
      </Button>
    </form>
  );
}
