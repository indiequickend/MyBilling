import { handleReportExport } from "@/lib/reports/exportHandler";
import { getPartyReport, type PartyReportRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

function buildColumns(partyType: "customer" | "vendor"): ExportColumn<PartyReportRow>[] {
  return [
    { key: "displayName", header: "Party", value: (r) => r.displayName },
    { key: "gstin", header: "GSTIN", value: (r) => r.gstin ?? "—" },
    {
      key: "totalDocumentedMinor",
      header: partyType === "customer" ? "Total Invoiced" : "Total Purchased",
      value: (r) => minorToRupeesString(r.totalDocumentedMinor),
    },
    { key: "totalPaidMinor", header: "Total Paid", value: (r) => minorToRupeesString(r.totalPaidMinor) },
    { key: "balanceMinor", header: "Balance", value: (r) => minorToRupeesString(r.balanceMinor) },
  ];
}

export async function GET(request: Request) {
  const partyType = new URL(request.url).searchParams.get("partyType") === "vendor" ? "vendor" : "customer";
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    buildColumns(partyType),
    (businessId, params) => getPartyReport(businessId, partyType, params),
    "Party Report",
  );
}
