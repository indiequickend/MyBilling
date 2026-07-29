import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants/documentTypes";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  setDefaultNoteTermTemplateAction,
  softDeleteNoteTermTemplateAction,
  restoreNoteTermTemplateAction,
} from "./actions";

export default async function NotesTermsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listNoteTermTemplates(context.activeBusinessId, { tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { tab: "deleted" }),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Notes &amp; Terms</h1>
        <Button asChild>
          <Link href="/settings/notes-terms/new">
            <Plus data-icon="inline-start" />
            New template
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Default</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.length === 0 ? <TableEmptyState colSpan={6} message="No templates yet." /> : null}
              {active.map((t) => (
                <TableRow key={String(t._id)}>
                  <TableCell>{DOCUMENT_TYPE_LABELS[t.docType]}</TableCell>
                  <TableCell className="capitalize">{t.kind}</TableCell>
                  <TableCell>
                    <Link href={`/settings/notes-terms/${String(t._id)}/edit`} className="font-medium hover:underline">
                      {t.title || "(untitled)"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.isActive ? "success" : "outline"}>{t.isActive ? "Yes" : "No"}</Badge>
                  </TableCell>
                  <TableCell>
                    {t.isDefault ? (
                      <Badge variant="success">Default</Badge>
                    ) : (
                      <form action={setDefaultNoteTermTemplateAction}>
                        <input type="hidden" name="templateId" value={String(t._id)} />
                        <Button type="submit" variant="outline" size="sm">
                          Set default
                        </Button>
                      </form>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={softDeleteNoteTermTemplateAction}>
                      <input type="hidden" name="templateId" value={String(t._id)} />
                      <Button type="submit" variant="destructive" size="sm">
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
        <Card>
          <CardHeader>
            <CardTitle>Deleted</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deleted.map((t) => (
                  <TableRow key={String(t._id)}>
                    <TableCell>{t.title || "(untitled)"}</TableCell>
                    <TableCell className="text-right">
                      <form action={restoreNoteTermTemplateAction}>
                        <input type="hidden" name="templateId" value={String(t._id)} />
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
      ) : null}
    </div>
  );
}
