import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPartyGroups } from "@/lib/db/queries/partyGroups";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateGroupForm } from "./CreateGroupForm";
import {
  updateVendorGroupAction,
  softDeleteVendorGroupAction,
  restoreVendorGroupAction,
} from "./actions";

export default async function VendorGroupsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "vendors", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listPartyGroups(context.activeBusinessId, "vendor", "active"),
    listPartyGroups(context.activeBusinessId, "vendor", "deleted"),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="mb-4 text-lg font-semibold">Vendor groups</h1>
        <CreateGroupForm />
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.length === 0 ? <TableEmptyState colSpan={2} message="No groups yet." /> : null}
              {active.map((g) => (
                <TableRow key={String(g._id)}>
                  <TableCell>
                    <form action={updateVendorGroupAction} className="flex items-center gap-2">
                      <input type="hidden" name="groupId" value={String(g._id)} />
                      <Input name="name" defaultValue={g.name} className="h-8 max-w-48" />
                      <Button type="submit" variant="outline" size="sm">
                        Save
                      </Button>
                    </form>
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={softDeleteVendorGroupAction}>
                      <input type="hidden" name="groupId" value={String(g._id)} />
                      <Button type="submit" variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        Delete
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {deleted.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">Deleted</h2>
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deleted.map((g) => (
                    <TableRow key={String(g._id)}>
                      <TableCell>{g.name}</TableCell>
                      <TableCell className="text-right">
                        <form action={restoreVendorGroupAction}>
                          <input type="hidden" name="groupId" value={String(g._id)} />
                          <Button type="submit" variant="outline" size="sm">
                            Restore
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
