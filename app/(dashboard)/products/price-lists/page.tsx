import { redirect } from "next/navigation";
import Link from "next/link";
import { Upload, Trash2, RotateCcw } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPriceLists } from "@/lib/db/queries/priceLists";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { MasterExportButtons } from "@/components/importExport/MasterExportButtons";
import { CreatePriceListForm } from "./CreatePriceListForm";
import {
  updatePriceListAction,
  setDefaultPriceListAction,
  softDeletePriceListAction,
  restorePriceListAction,
} from "./actions";

export default async function PriceListsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listPriceLists(context.activeBusinessId, "active"),
    listPriceLists(context.activeBusinessId, "deleted"),
  ]);

  const canCreate = can(context.membership, "products", "edit");

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <PageHeader
          title="Price lists"
          actions={
            <>
              <MasterExportButtons baseHref="/api/products/price-lists/export" />
              {canCreate ? (
                <Button variant="outline" size="sm" asChild className="hidden lg:inline-flex" aria-label="Bulk upload">
                  <Link href="/products/price-lists/bulk-upload">
                    <Upload data-icon="inline-start" />
                    <ButtonLabel>Bulk upload</ButtonLabel>
                  </Link>
                </Button>
              ) : null}
            </>
          }
        />
        <CreatePriceListForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Default</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {active.length === 0 ? <TableEmptyState colSpan={3} message="No price lists yet." /> : null}
          {active.map((p) => (
            <TableRow key={String(p._id)}>
              <TableCell>
                <form action={updatePriceListAction} className="flex items-center gap-2">
                  <input type="hidden" name="priceListId" value={String(p._id)} />
                  <Input name="name" defaultValue={p.name} className="h-8" />
                  <Button type="submit" variant="outline" size="sm">
                    Save
                  </Button>
                </form>
              </TableCell>
              <TableCell>
                {p.isDefault ? (
                  <Badge variant="success">Default</Badge>
                ) : (
                  <form action={setDefaultPriceListAction}>
                    <input type="hidden" name="priceListId" value={String(p._id)} />
                    <Button type="submit" variant="outline" size="sm">
                      Set default
                    </Button>
                  </form>
                )}
              </TableCell>
              <TableCell className="text-right">
                <form action={softDeletePriceListAction}>
                  <input type="hidden" name="priceListId" value={String(p._id)} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 data-icon="inline-start" />
                    <ButtonLabel>Delete</ButtonLabel>
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {deleted.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Deleted</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deleted.map((p) => (
                <TableRow key={String(p._id)}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right">
                    <form action={restorePriceListAction}>
                      <input type="hidden" name="priceListId" value={String(p._id)} />
                      <Button type="submit" variant="outline" size="sm" aria-label="Restore">
                        <RotateCcw data-icon="inline-start" />
                        <ButtonLabel>Restore</ButtonLabel>
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
