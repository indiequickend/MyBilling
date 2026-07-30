import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findWebhookEndpointById, listWebhookDeliveries } from "@/lib/db/queries/webhooks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WebhookEndpointForm } from "../WebhookEndpointForm";
import { DeleteWebhookEndpointButton } from "../DeleteWebhookEndpointButton";
import { RedeliverButton } from "../RedeliverButton";

export default async function WebhookEndpointDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_integrations")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const endpoint = await findWebhookEndpointById(id, context.activeBusinessId);
  if (!endpoint) notFound();

  const page = sp.page ? Number(sp.page) : 1;
  const { items: deliveries, totalPages } = await listWebhookDeliveries(id, context.activeBusinessId, { page });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Webhook</h1>
        <DeleteWebhookEndpointButton webhookEndpointId={id} />
      </div>

      <WebhookEndpointForm
        mode="edit"
        webhookEndpointId={id}
        defaultValues={{ url: endpoint.url, eventTypes: endpoint.eventTypes }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Response</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 ? (
                <TableEmptyState colSpan={6} message="No deliveries yet." />
              ) : null}
              {deliveries.map((delivery) => (
                <TableRow key={String(delivery._id)}>
                  <TableCell>{new Date(delivery.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{delivery.eventType}</TableCell>
                  <TableCell>
                    <Badge variant={delivery.status === "success" ? "success" : "destructive"}>
                      {delivery.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{delivery.attempts}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {delivery.lastResponseStatus ?? delivery.lastError ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {delivery.status === "failed" ? (
                      <RedeliverButton webhookEndpointId={id} webhookDeliveryId={String(delivery._id)} />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
            <Pagination page={page} totalPages={totalPages} basePath={`/settings/webhooks/${id}`} searchParams={{}} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
