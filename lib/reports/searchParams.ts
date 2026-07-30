/** Shared by every reports page.tsx — parses the `dateFrom`/`dateTo` query params into Dates
 * for the query layer, and rebuilds the query string the export buttons append to their href. */
export function parseReportDateRange(sp: Record<string, string | undefined>): {
  dateFrom?: Date;
  dateTo?: Date;
} {
  return {
    dateFrom: sp.dateFrom ? new Date(sp.dateFrom) : undefined,
    dateTo: sp.dateTo ? new Date(sp.dateTo) : undefined,
  };
}

export function reportExportQuery(
  sp: Record<string, string | undefined>,
  extra: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  if (sp.dateFrom) params.set("dateFrom", sp.dateFrom);
  if (sp.dateTo) params.set("dateTo", sp.dateTo);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}
