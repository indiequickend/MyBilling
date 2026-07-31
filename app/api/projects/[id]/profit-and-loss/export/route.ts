import { handleReportExport } from "@/lib/reports/exportHandler";
import {
  getProjectProfitAndLoss,
  buildProjectProfitAndLossRows,
  type ProjectProfitAndLossRow,
} from "@/lib/db/queries/projects";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const columns: ExportColumn<ProjectProfitAndLossRow>[] = [
  { key: "label", header: "Line", value: (r) => r.label },
  { key: "amountMinor", header: "Amount (₹)", value: (r) => minorToRupeesString(r.amountMinor) },
];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleReportExport(
    request,
    { module: "projects", action: "export" },
    columns,
    async (businessId, range) =>
      buildProjectProfitAndLossRows(await getProjectProfitAndLoss(businessId, id, range)),
    "Project Profit and Loss",
  );
}
