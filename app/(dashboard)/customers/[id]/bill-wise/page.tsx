import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";

export default async function CustomerBillWisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <PartyDetailTabs basePath={`/customers/${id}`} active="bill-wise" />
      <p className="text-sm text-slate-500">
        No bill-wise payment matches yet. Payments matched to specific invoices will appear here.
      </p>
    </div>
  );
}
