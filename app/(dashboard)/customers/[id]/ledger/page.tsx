import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";

export default async function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PartyDetailTabs basePath={`/customers/${id}`} active="ledger" />
      <p className="text-sm text-slate-500">
        No ledger entries yet. This tab populates once invoices and payments exist for this
        customer.
      </p>
    </div>
  );
}
