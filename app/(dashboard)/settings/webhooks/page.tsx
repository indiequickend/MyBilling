import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listWebhookEndpoints } from "@/lib/db/queries/webhooks";
import { WEBHOOK_EVENT_LABELS, type WebhookEventType } from "@/lib/webhooks/events";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleWebhookEndpointActiveAction } from "./actions";
import { WebhookEndpointForm } from "./WebhookEndpointForm";

export default async function WebhooksPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_integrations")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const endpoints = await listWebhookEndpoints(context.activeBusinessId);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Get notified in real time when invoices are created, payments are received, or a
          document&apos;s status changes. Every delivery is signed with the endpoint&apos;s secret via{" "}
          <code>X-Webhook-Signature</code>.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>URL</TableHead>
            <TableHead>Events</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {endpoints.length === 0 ? <TableEmptyState colSpan={4} message="No webhooks yet." /> : null}
          {endpoints.map((endpoint) => (
            <TableRow key={String(endpoint._id)}>
              <TableCell>
                <Link href={`/settings/webhooks/${String(endpoint._id)}`} className="font-medium hover:underline">
                  {endpoint.url}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {(endpoint.eventTypes as WebhookEventType[]).map((e) => WEBHOOK_EVENT_LABELS[e]).join(", ")}
              </TableCell>
              <TableCell>
                <Badge variant={endpoint.isActive ? "success" : "outline"}>
                  {endpoint.isActive ? "Active" : "Paused"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <form action={toggleWebhookEndpointActiveAction}>
                  <input type="hidden" name="webhookEndpointId" value={String(endpoint._id)} />
                  <input type="hidden" name="isActive" value={String(endpoint.isActive)} />
                  <Button type="submit" variant="outline" size="sm">
                    {endpoint.isActive ? "Pause" : "Resume"}
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div>
        <h2 className="mb-3 text-base font-semibold">Add a webhook</h2>
        <WebhookEndpointForm mode="create" />
      </div>
    </div>
  );
}
