import Link from "next/link";

export function Tabs({ tabs }: { tabs: Array<{ label: string; href: string; active: boolean }> }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={
            tab.active
              ? "border-b-2 border-slate-900 px-3 py-2 text-sm font-medium text-slate-900"
              : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
