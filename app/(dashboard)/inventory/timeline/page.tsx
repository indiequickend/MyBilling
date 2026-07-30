import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listStockLedger } from "@/lib/db/queries/stockLedger";
import { listWarehouses } from "@/lib/db/queries/warehouses";
import { findProductsByIds } from "@/lib/db/queries/products";
import { stockLedgerListQuerySchema } from "@/lib/validation/inventory";
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants/documentTypes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/ui/SelectField";

const REASON_LABELS: Record<string, string> = {
  opening_stock: "Opening stock",
  manual_in: "Manual Stock In",
  manual_out: "Manual Stock Out",
  invoice: "Invoice",
  credit_note: "Credit Note",
  purchase: "Purchase",
  debit_note: "Debit Note",
  invoice_cancelled: "Invoice cancelled",
  purchase_cancelled: "Purchase cancelled",
};

const DOC_LINK_PREFIX: Record<string, string> = {
  invoice: "/sales/invoices",
  credit_note: "/sales/credit-notes",
  purchase: "/purchases",
  debit_note: "/purchases/debit-notes",
};

export default async function StockTimelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "inventory", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = stockLedgerListQuerySchema.parse({
    productId: sp.productId,
    warehouseId: sp.warehouseId,
    page: sp.page,
  });

  const [warehouses, { items, page, totalPages }] = await Promise.all([
    listWarehouses(context.activeBusinessId, "active"),
    listStockLedger(context.activeBusinessId, {
      productId: query.productId,
      warehouseId: query.warehouseId,
      page: query.page,
    }),
  ]);

  const products = await findProductsByIds(
    items.map((e) => String(e.productId)),
    context.activeBusinessId,
  );
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const warehouseMap = new Map(warehouses.map((w) => [String(w._id), w.name]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Stock Timeline</h1>
      </div>

      <form method="GET" className="mb-4 grid max-w-md gap-4 sm:grid-cols-1">
        <SelectField
          name="warehouseId"
          defaultValue={query.warehouseId}
          placeholder="All warehouses"
          options={[{ value: "", label: "All warehouses" }, ...warehouses.map((w) => ({ value: String(w._id), label: w.name }))]}
        />
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Warehouse</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Balance after</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Document</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={8} message="No stock movements yet." /> : null}
          {items.map((entry) => {
            const product = productMap.get(String(entry.productId));
            const linkPrefix = entry.refDocumentType ? DOC_LINK_PREFIX[entry.refDocumentType] : undefined;
            return (
              <TableRow key={String(entry._id)}>
                <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                <TableCell>{product?.name ?? "—"}</TableCell>
                <TableCell>{warehouseMap.get(String(entry.warehouseId)) ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={entry.direction === "in" ? "success" : "danger"}>
                    {entry.direction === "in" ? "In" : "Out"}
                  </Badge>
                </TableCell>
                <TableCell>{entry.quantity}</TableCell>
                <TableCell>{entry.balanceAfter}</TableCell>
                <TableCell>{REASON_LABELS[entry.reason] ?? entry.reason}</TableCell>
                <TableCell>
                  {linkPrefix && entry.refDocumentId ? (
                    <Link
                      href={`${linkPrefix}/${String(entry.refDocumentId)}`}
                      className="text-primary hover:underline"
                    >
                      {entry.refDocumentNumber ?? DOCUMENT_TYPE_LABELS[entry.refDocumentType!]}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/inventory/timeline"
          searchParams={{ productId: query.productId, warehouseId: query.warehouseId }}
        />
      </div>
    </div>
  );
}
