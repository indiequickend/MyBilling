import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";

export default async function VendorActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PartyDetailTabs basePath={`/vendors/${id}`} active="activity" />
      <p className="text-sm text-slate-500">No activity recorded yet for this vendor.</p>
    </div>
  );
}
