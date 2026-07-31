import { handleMasterExport } from "@/lib/importExport/masterExport";
import { listAllVendors } from "@/lib/db/queries/vendors";
import type { ExportColumn } from "@/lib/reports/export";

type VendorRow = Awaited<ReturnType<typeof listAllVendors>>[number];

const columns: ExportColumn<VendorRow>[] = [
  { key: "displayName", header: "Name", value: (v) => v.displayName },
  { key: "companyName", header: "Company", value: (v) => v.companyName ?? "" },
  { key: "gstin", header: "GSTIN", value: (v) => v.gstin ?? "" },
  { key: "email", header: "Email", value: (v) => v.email ?? "" },
  { key: "phone", header: "Phone", value: (v) => v.phone ?? "" },
];

export async function GET(request: Request) {
  return handleMasterExport(
    request,
    { module: "vendors", action: "export" },
    columns,
    (businessId, params) => listAllVendors(businessId, params),
    "Vendors",
  );
}
