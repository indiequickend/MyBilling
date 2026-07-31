import { LinkTabs } from "@/components/ui/LinkTabs";

const TAB_DEFS = [
  { key: "profit-and-loss", label: "P&L" },
  { key: "invoices", label: "Invoices" },
  { key: "expenses", label: "Expenses" },
  { key: "purchases", label: "Purchases" },
] as const;

export type ProjectDetailTabKey = (typeof TAB_DEFS)[number]["key"];

/** Shared detail-tab shell for a Project's detail page — mirrors PartyDetailTabs. */
export function ProjectDetailTabs({
  basePath,
  active,
}: {
  basePath: string;
  active: ProjectDetailTabKey;
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
