import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listProductGroups } from "@/lib/db/queries/productGroups";
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
import { CreateGroupForm } from "./CreateGroupForm";
import {
  updateProductGroupAction,
  softDeleteProductGroupAction,
  restoreProductGroupAction,
} from "./actions";

export default async function ProductGroupsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "products", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listProductGroups(context.activeBusinessId, "active"),
    listProductGroups(context.activeBusinessId, "deleted"),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold">Product groups</h1>
        <CreateGroupForm />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {active.length === 0 ? <TableEmptyState colSpan={2} message="No groups yet." /> : null}
          {active.map((g) => (
            <TableRow key={String(g._id)}>
              <TableCell>
                <form action={updateProductGroupAction} className="flex items-center gap-2">
                  <input type="hidden" name="groupId" value={String(g._id)} />
                  <Input name="name" defaultValue={g.name} className="h-8" />
                  <Button type="submit" variant="outline" size="sm">
                    Save
                  </Button>
                </form>
              </TableCell>
              <TableCell className="text-right">
                <form action={softDeleteProductGroupAction}>
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
              {deleted.map((g) => (
                <TableRow key={String(g._id)}>
                  <TableCell>{g.name}</TableCell>
                  <TableCell className="text-right">
                    <form action={restoreProductGroupAction}>
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
        </div>
      ) : null}
    </div>
  );
}
