import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";

export default async function VendorTransactionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <PartyDetailTabs basePath={`/vendors/${id}`} active="transactions" />
      <p className="text-sm text-muted-foreground">
        No transactions yet. Purchases, debit notes, and payments linked to this vendor will appear
        here.
      </p>
    </div>
  );
}
