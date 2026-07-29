import { LinkTabs } from "@/components/ui/LinkTabs";

const TAB_DEFS = [
  { key: "ledger", label: "Ledger" },
  { key: "transactions", label: "Transactions" },
  { key: "bill-wise", label: "Bill-wise" },
  { key: "activity", label: "Activity" },
] as const;

export type PartyDetailTabKey = (typeof TAB_DEFS)[number]["key"];

/**
 * Shared detail-tab shell for Customer and Vendor detail pages — identical
 * shape for both party types. Ledger/Transactions/Bill-wise data is populated
 * starting Phase 3+ once real documents exist; these tabs are empty-state
 * placeholders until then.
 */
export function PartyDetailTabs({
  basePath,
  active,
}: {
  basePath: string;
  active: PartyDetailTabKey;
}) {
  return (
    <LinkTabs
      tabs={TAB_DEFS.map((t) => ({
        label: t.label,
        href: `${basePath}/${t.key}`,
        active: t.key === active,
      }))}
    />
  );
}
