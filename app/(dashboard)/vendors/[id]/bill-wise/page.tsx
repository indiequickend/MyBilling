import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";

export default async function VendorBillWisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PartyDetailTabs basePath={`/vendors/${id}`} active="bill-wise" />
      <p className="text-sm text-slate-500">
        No bill-wise payment matches yet. Payments matched to specific bills will appear here.
      </p>
    </div>
  );
}
