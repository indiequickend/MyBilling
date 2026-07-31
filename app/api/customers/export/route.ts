import { handleMasterExport } from "@/lib/importExport/masterExport";
import { listAllCustomers } from "@/lib/db/queries/customers";
import type { ExportColumn } from "@/lib/reports/export";

type CustomerRow = Awaited<ReturnType<typeof listAllCustomers>>[number];

const columns: ExportColumn<CustomerRow>[] = [
  { key: "displayName", header: "Name", value: (c) => c.displayName },
  { key: "companyName", header: "Company", value: (c) => c.companyName ?? "" },
  { key: "gstin", header: "GSTIN", value: (c) => c.gstin ?? "" },
  { key: "email", header: "Email", value: (c) => c.email ?? "" },
  { key: "phone", header: "Phone", value: (c) => c.phone ?? "" },
];

export async function GET(request: Request) {
  return handleMasterExport(
    request,
    { module: "customers", action: "export" },
    columns,
    (businessId, params) => listAllCustomers(businessId, params),
    "Customers",
  );
}
