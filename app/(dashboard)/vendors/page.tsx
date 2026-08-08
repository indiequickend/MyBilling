import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Upload, Users2, Trash2, RotateCcw } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listVendors } from "@/lib/db/queries/vendors";
import { listPartyGroups } from "@/lib/db/queries/partyGroups";
import { vendorListQuerySchema } from "@/lib/validation/vendors";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PartyAvatar } from "@/components/dashboard/PartyAvatar";
import { MasterExportButtons } from "@/components/importExport/MasterExportButtons";
import { RevealField } from "@/components/ui/RevealField";
import { maskGstin } from "@/lib/utils/mask";
import { softDeleteVendorAction, restoreVendorAction, revealVendorGstinAction } from "./actions";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "vendors", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = vendorListQuerySchema.parse({
    q: sp.q,
    groupId: sp.groupId,
    tab: sp.tab,
    page: sp.page,
  });

  const [{ items, page, totalPages }, groups] = await Promise.all([
    listVendors(context.activeBusinessId, {
      search: query.q,
      groupId: query.groupId,
      tab: query.tab,
      page: query.page,
    }),
    listPartyGroups(context.activeBusinessId, "vendor"),
  ]);

  const canCreate = can(context.membership, "vendors", "create");
  const canDelete = can(context.membership, "vendors", "delete");

  return (
    <div>
      <PageHeader
        title="Vendors"
        actions={
          <>
            <Button variant="link" asChild className="text-muted-foreground" aria-label="Manage groups">
              <Link href="/vendors/groups">
                <Users2 data-icon="inline-start" />
                <ButtonLabel>Manage groups</ButtonLabel>
              </Link>
            </Button>
            {canCreate ? (
              <Button variant="outline" asChild className="hidden lg:inline-flex" aria-label="Bulk upload">
                <Link href="/vendors/bulk-upload">
                  <Upload data-icon="inline-start" />
                  <ButtonLabel>Bulk upload</ButtonLabel>
                </Link>
              </Button>
            ) : null}
            {canCreate ? (
              <Button asChild aria-label="New vendor">
                <Link href="/vendors/new">
                  <Plus data-icon="inline-start" />
                  <ButtonLabel>New vendor</ButtonLabel>
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <LinkTabs
        tabs={[
          { label: "Active", href: "/vendors", active: query.tab === "active" },
          { label: "Deleted", href: "/vendors?tab=deleted", active: query.tab === "deleted" },
        ]}
      />

      <div className="mb-3 flex justify-end">
        <MasterExportButtons baseHref="/api/vendors/export" search={query.q} tab={query.tab} />
      </div>

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search vendors…"
          hiddenParams={{ tab: query.tab }}
        >
          {groups.length > 0 ? (
            <select
              name="groupId"
              defaultValue={query.groupId ?? ""}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={String(g._id)} value={String(g._id)}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : null}
        </SearchInput>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>GSTIN</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={5} message="No vendors found." /> : null}
          {items.map((v) => {
            const id = String(v._id);
            return (
              <TableRow key={id}>
                <TableCell>
                  <Link href={`/vendors/${id}/ledger`} className="flex items-center gap-2.5 font-medium hover:underline">
                    <PartyAvatar id={id} name={v.displayName} />
                    {v.displayName}
                  </Link>
                </TableCell>
                <TableCell>{v.companyName ?? "—"}</TableCell>
                <TableCell>
                  {v.gstin ? (
                    <RevealField
                      maskedValue={maskGstin(v.gstin) ?? ""}
                      reveal={revealVendorGstinAction.bind(null, id)}
                    />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{v.phone ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {query.tab === "active" ? (
                    canDelete ? (
                      <form action={softDeleteVendorAction}>
                        <input type="hidden" name="vendorId" value={id} />
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
                    ) : null
                  ) : (
                    <form action={restoreVendorAction}>
                      <input type="hidden" name="vendorId" value={id} />
                      <Button type="submit" variant="outline" size="sm" aria-label="Restore">
                        <RotateCcw data-icon="inline-start" />
                        <ButtonLabel>Restore</ButtonLabel>
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-4 flex justify-end">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/vendors"
          searchParams={{ q: query.q, groupId: query.groupId, tab: query.tab }}
        />
      </div>
    </div>
  );
}
