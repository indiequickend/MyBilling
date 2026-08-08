import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listSignatures } from "@/lib/db/queries/signatures";
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
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Trash2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setDefaultSignatureAction, softDeleteSignatureAction, restoreSignatureAction } from "./actions";

export default async function SignaturesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted] = await Promise.all([
    listSignatures(context.activeBusinessId, "active"),
    listSignatures(context.activeBusinessId, "deleted"),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Signatures"
        actions={
          <Button asChild aria-label="New signature">
            <Link href="/settings/signatures/new">
              <Plus data-icon="inline-start" />
              <ButtonLabel>New signature</ButtonLabel>
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preview</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Default</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.length === 0 ? <TableEmptyState colSpan={4} message="No signatures yet." /> : null}
              {active.map((s) => (
                <TableRow key={String(s._id)}>
                  <TableCell>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.imageUrl} alt={s.name} className="h-10 w-20 object-contain" />
                  </TableCell>
                  <TableCell>
                    <Link href={`/settings/signatures/${String(s._id)}/edit`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {s.isDefault ? (
                      <Badge variant="success">Default</Badge>
                    ) : (
                      <form action={setDefaultSignatureAction}>
                        <input type="hidden" name="signatureId" value={String(s._id)} />
                        <Button type="submit" variant="outline" size="sm">
                          Set default
                        </Button>
                      </form>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={softDeleteSignatureAction}>
                      <input type="hidden" name="signatureId" value={String(s._id)} />
                      <Button type="submit" variant="destructive" size="sm" aria-label="Delete">
                        <Trash2 data-icon="inline-start" />
                        <ButtonLabel>Delete</ButtonLabel>
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
                  <TableHead>Name</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deleted.map((s) => (
                  <TableRow key={String(s._id)}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="text-right">
                      <form action={restoreSignatureAction}>
                        <input type="hidden" name="signatureId" value={String(s._id)} />
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
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
