import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listProjects } from "@/lib/db/queries/projects";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Button } from "@/components/ui/button";
import { softDeleteProjectAction, restoreProjectAction } from "./actions";

export default async function ProjectsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "projects", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listProjects(context.activeBusinessId, "active"),
    listProjects(context.activeBusinessId, "deleted"),
  ]);

  const canCreate = can(context.membership, "projects", "create");
  const canEdit = can(context.membership, "projects", "edit");
  const canDelete = can(context.membership, "projects", "delete");

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Projects</h1>
        {canCreate ? (
          <Button asChild>
            <Link href="/projects/new">
              <Plus data-icon="inline-start" />
              New project
            </Link>
          </Button>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {active.length === 0 ? <TableEmptyState colSpan={3} message="No projects yet." /> : null}
          {active.map((p) => {
            const id = String(p._id);
            return (
              <TableRow key={id}>
                <TableCell>
                  <Link href={`/projects/${id}/profit-and-loss`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.description ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/projects/${id}/edit`}>Edit</Link>
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <form action={softDeleteProjectAction}>
                        <input type="hidden" name="projectId" value={id} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          Delete
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
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
                    {canDelete ? (
                      <form action={restoreProjectAction}>
                        <input type="hidden" name="projectId" value={String(p._id)} />
                        <Button type="submit" variant="outline" size="sm">
                          Restore
                        </Button>
                      </form>
                    ) : null}
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
