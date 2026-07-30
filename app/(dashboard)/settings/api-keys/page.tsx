import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listApiKeysForBusiness } from "@/lib/db/queries/apiKeys";
import { listRolesForBusiness } from "@/lib/db/queries/roles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeyForm } from "./ApiKeyForm";
import { RevokeApiKeyButton } from "./RevokeApiKeyButton";

export default async function ApiKeysPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_integrations")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [{ items: apiKeys }, roles] = await Promise.all([
    listApiKeysForBusiness(context.activeBusinessId),
    listRolesForBusiness(context.activeBusinessId),
  ]);
  const roleNameById = new Map(roles.map((r) => [String(r._id), r.name]));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          API keys authenticate requests to the{" "}
          <Link href="/api/v1/openapi.json" className="underline" target="_blank">
            REST API
          </Link>{" "}
          as <code>Authorization: Bearer &lt;key&gt;</code>. Each key acts with exactly the
          permissions of the Role it&apos;s assigned — the same checks the dashboard uses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Existing keys</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.length === 0 ? <TableEmptyState colSpan={6} message="No API keys yet." /> : null}
              {apiKeys.map((key) => {
                const isRevoked = !!key.revokedAt;
                return (
                  <TableRow key={String(key._id)}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground">{key.keyPrefix}…</code>
                    </TableCell>
                    <TableCell>{roleNameById.get(String(key.roleId)) ?? "—"}</TableCell>
                    <TableCell>
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isRevoked ? "outline" : "success"}>
                        {isRevoked ? "Revoked" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isRevoked ? <RevokeApiKeyButton apiKeyId={String(key._id)} /> : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold">Create a new key</h2>
        <ApiKeyForm roles={roles.map((r) => ({ id: String(r._id), name: r.name }))} />
      </div>
    </div>
  );
}
