import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SearchInput({
  defaultValue,
  placeholder = "Search…",
  hiddenParams,
  children,
}: {
  defaultValue?: string;
  placeholder?: string;
  hiddenParams?: Record<string, string | undefined>;
  /** Extra filter controls (e.g. a group/category <select>) submitted in the same GET form. */
  children?: React.ReactNode;
}) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      {hiddenParams
        ? Object.entries(hiddenParams).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )
        : null}
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="pl-8"
        />
      </div>
      {children}
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
