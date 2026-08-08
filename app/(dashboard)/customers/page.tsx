import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Upload, Users2, Trash2, RotateCcw } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listCustomers } from "@/lib/db/queries/customers";
import { listPartyGroups } from "@/lib/db/queries/partyGroups";
import { customerListQuerySchema } from "@/lib/validation/customers";
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
import { softDeleteCustomerAction, restoreCustomerAction, revealCustomerGstinAction } from "./actions";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "customers", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = customerListQuerySchema.parse({
    q: sp.q,
    groupId: sp.groupId,
    tab: sp.tab,
    page: sp.page,
  });

  const [{ items, page, totalPages }, groups] = await Promise.all([
    listCustomers(context.activeBusinessId, {
      search: query.q,
      groupId: query.groupId,
      tab: query.tab,
      page: query.page,
    }),
    listPartyGroups(context.activeBusinessId, "customer"),
  ]);

  const canCreate = can(context.membership, "customers", "create");
  const canDelete = can(context.membership, "customers", "delete");

  return (
    <div>
      <PageHeader
        title="Customers"
        actions={
          <>
            <Button variant="link" asChild className="text-muted-foreground" aria-label="Manage groups">
              <Link href="/customers/groups">
                <Users2 data-icon="inline-start" />
                <ButtonLabel>Manage groups</ButtonLabel>
              </Link>
            </Button>
            {canCreate ? (
              <Button variant="outline" asChild className="hidden lg:inline-flex" aria-label="Bulk upload">
                <Link href="/customers/bulk-upload">
                  <Upload data-icon="inline-start" />
                  <ButtonLabel>Bulk upload</ButtonLabel>
                </Link>
              </Button>
            ) : null}
            {canCreate ? (
              <Button asChild aria-label="New customer">
                <Link href="/customers/new">
                  <Plus data-icon="inline-start" />
                  <ButtonLabel>New customer</ButtonLabel>
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <LinkTabs
        tabs={[
          { label: "Active", href: "/customers", active: query.tab === "active" },
          { label: "Deleted", href: "/customers?tab=deleted", active: query.tab === "deleted" },
        ]}
      />

      <div className="mb-3 flex justify-end">
        <MasterExportButtons baseHref="/api/customers/export" search={query.q} tab={query.tab} />
      </div>

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search customers…"
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
          {items.length === 0 ? (
            <TableEmptyState colSpan={5} message="No customers found." />
          ) : null}
          {items.map((c) => {
            const id = String(c._id);
            return (
              <TableRow key={id}>
                <TableCell>
                  <Link href={`/customers/${id}/ledger`} className="flex items-center gap-2.5 font-medium hover:underline">
                    <PartyAvatar id={id} name={c.displayName} />
                    {c.displayName}
                  </Link>
                </TableCell>
                <TableCell>{c.companyName ?? "—"}</TableCell>
                <TableCell>
                  {c.gstin ? (
                    <RevealField
                      maskedValue={maskGstin(c.gstin) ?? ""}
                      reveal={revealCustomerGstinAction.bind(null, id)}
                    />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{c.phone ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {query.tab === "active" ? (
                    canDelete ? (
                      <form action={softDeleteCustomerAction}>
                        <input type="hidden" name="customerId" value={id} />
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
                    <form action={restoreCustomerAction}>
                      <input type="hidden" name="customerId" value={id} />
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
          basePath="/customers"
          searchParams={{ q: query.q, groupId: query.groupId, tab: query.tab }}
        />
      </div>
    </div>
  );
}
