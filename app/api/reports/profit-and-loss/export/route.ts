import { handleReportExport } from "@/lib/reports/exportHandler";
import { getProfitAndLoss, buildProfitAndLossRows, type ProfitAndLossRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const columns: ExportColumn<ProfitAndLossRow>[] = [
  { key: "label", header: "Line", value: (r) => r.label },
  { key: "amountMinor", header: "Amount (₹)", value: (r) => minorToRupeesString(r.amountMinor) },
];

export async function GET(request: Request) {
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    async (businessId, params) => buildProfitAndLossRows(await getProfitAndLoss(businessId, params)),
    "Profit and Loss",
  );
}
