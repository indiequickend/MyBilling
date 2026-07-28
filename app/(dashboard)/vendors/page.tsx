import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listVendors } from "@/lib/db/queries/vendors";
import { listPartyGroups } from "@/lib/db/queries/partyGroups";
import { vendorListQuerySchema } from "@/lib/validation/vendors";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { softDeleteVendorAction, restoreVendorAction } from "./actions";

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
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>
    );
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Vendors</h1>
        <div className="flex items-center gap-3">
          <Link href="/vendors/groups" className="text-sm text-slate-500 hover:underline">
            Manage groups
          </Link>
          {canCreate ? (
            <Link
              href="/vendors/new"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              + New vendor
            </Link>
          ) : null}
        </div>
      </div>

      <Tabs
        tabs={[
          { label: "Active", href: "/vendors", active: query.tab === "active" },
          { label: "Deleted", href: "/vendors?tab=deleted", active: query.tab === "deleted" },
        ]}
      />

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
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
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
        <Thead>
          <Th>Name</Th>
          <Th>Company</Th>
          <Th>GSTIN</Th>
          <Th>Phone</Th>
          <Th />
        </Thead>
        <Tbody>
          {items.length === 0 ? <TableEmptyState colSpan={5} message="No vendors found." /> : null}
          {items.map((v) => (
            <Tr key={String(v._id)}>
              <Td>
                <Link
                  href={`/vendors/${String(v._id)}/ledger`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {v.displayName}
                </Link>
              </Td>
              <Td>{v.companyName ?? "—"}</Td>
              <Td>{v.gstin ?? "—"}</Td>
              <Td>{v.phone ?? "—"}</Td>
              <Td className="text-right">
                {query.tab === "active" ? (
                  canDelete ? (
                    <form action={softDeleteVendorAction}>
                      <input type="hidden" name="vendorId" value={String(v._id)} />
                      <button
                        type="submit"
                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </form>
                  ) : null
                ) : (
                  <form action={restoreVendorAction}>
                    <input type="hidden" name="vendorId" value={String(v._id)} />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Restore
                    </button>
                  </form>
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/vendors"
        searchParams={{ q: query.q, groupId: query.groupId, tab: query.tab }}
      />
    </div>
  );
}
