import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";

export default async function CustomerTransactionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <PartyDetailTabs basePath={`/customers/${id}`} active="transactions" />
      <p className="text-sm text-slate-500">
        No transactions yet. Invoices, credit notes, and payments linked to this customer will
        appear here.
      </p>
    </div>
  );
}
