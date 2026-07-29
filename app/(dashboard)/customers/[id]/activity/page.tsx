import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";

export default async function CustomerActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <PartyDetailTabs basePath={`/customers/${id}`} active="activity" />
      <p className="text-sm text-muted-foreground">No activity recorded yet for this customer.</p>
    </div>
  );
}
