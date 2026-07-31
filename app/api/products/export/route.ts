import { handleMasterExport } from "@/lib/importExport/masterExport";
import { listAllProducts } from "@/lib/db/queries/products";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

type ProductRow = Awaited<ReturnType<typeof listAllProducts>>[number];

const columns: ExportColumn<ProductRow>[] = [
  { key: "name", header: "Name", value: (p) => p.name },
  { key: "type", header: "Type", value: (p) => p.type },
  { key: "hsnOrSac", header: "HSN/SAC", value: (p) => p.hsnOrSac ?? "" },
  { key: "unit", header: "Unit", value: (p) => p.unit ?? "" },
  {
    key: "sellingPriceMinor",
    header: "Selling price",
    value: (p) => (p.sellingPriceMinor != null ? minorToRupeesString(p.sellingPriceMinor) : ""),
  },
  { key: "taxRatePercent", header: "Tax %", value: (p) => p.taxRatePercent },
  { key: "barcode", header: "Barcode", value: (p) => p.barcode ?? "" },
];

export async function GET(request: Request) {
  return handleMasterExport(
    request,
    { module: "products", action: "export" },
    columns,
    (businessId, params) => listAllProducts(businessId, params),
    "Products",
  );
}
