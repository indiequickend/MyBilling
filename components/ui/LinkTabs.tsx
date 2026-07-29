import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function LinkTabs({
  tabs,
}: {
  tabs: Array<{ label: string; href: string; active: boolean; count?: number }>;
}) {
  return (
    <div className="mb-6 flex gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.active
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <Badge variant={tab.active ? "default" : "secondary"}>{tab.count}</Badge>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
