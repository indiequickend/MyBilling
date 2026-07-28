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
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
      />
      {children}
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        Search
      </button>
    </form>
  );
}
