import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";

export default async function VendorLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PartyDetailTabs basePath={`/vendors/${id}`} active="ledger" />
      <p className="text-sm text-muted-foreground">
        No ledger entries yet. This tab populates once purchases and payments exist for this vendor.
      </p>
    </div>
  );
}
