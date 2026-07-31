import { handleMasterExport } from "@/lib/importExport/masterExport";
import { listPriceLists } from "@/lib/db/queries/priceLists";
import type { ExportColumn } from "@/lib/reports/export";

type PriceListRow = Awaited<ReturnType<typeof listPriceLists>>[number];

const columns: ExportColumn<PriceListRow>[] = [
  { key: "name", header: "Name", value: (p) => p.name },
  { key: "description", header: "Description", value: (p) => p.description ?? "" },
  { key: "isDefault", header: "Default", value: (p) => (p.isDefault ? "Yes" : "No") },
];

export async function GET(request: Request) {
  return handleMasterExport(
    request,
    { module: "products", action: "export" },
    columns,
    (businessId, params) => listPriceLists(businessId, params.tab ?? "active"),
    "Price Lists",
  );
}
