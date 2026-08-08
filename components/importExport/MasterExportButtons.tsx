import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";

/** CSV/Excel/PDF export buttons for a master list page — mirrors the export buttons built into
 * ReportTable, but standalone since masters render their own table rather than going through
 * ReportTable's report-shaped (date-range) API. */
export function MasterExportButtons({
  baseHref,
  search,
  tab,
}: {
  baseHref: string;
  search?: string;
  tab?: string;
}) {
  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (tab) qs.set("tab", tab);
  const extra = qs.toString() ? `&${qs.toString()}` : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild aria-label="Export CSV">
        <Link href={`${baseHref}?format=csv${extra}`}>
          <Download data-icon="inline-start" />
          <ButtonLabel>CSV</ButtonLabel>
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild aria-label="Export Excel">
        <Link href={`${baseHref}?format=xlsx${extra}`}>
          <Download data-icon="inline-start" />
          <ButtonLabel>Excel</ButtonLabel>
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild aria-label="Export PDF">
        <Link href={`${baseHref}?format=pdf${extra}`}>
          <Download data-icon="inline-start" />
          <ButtonLabel>PDF</ButtonLabel>
        </Link>
      </Button>
    </div>
  );
}
