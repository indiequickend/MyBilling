import Link from "next/link";

function hrefForPage(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  page: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function Pagination({
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const linkClass = "rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50";
  const disabledClass = "rounded-md border border-slate-200 px-3 py-1 text-slate-300";

  return (
    <nav className="mt-4 flex items-center justify-between text-sm text-slate-600">
      {page > 1 ? (
        <Link href={hrefForPage(basePath, searchParams, page - 1)} className={linkClass}>
          Previous
        </Link>
      ) : (
        <span className={disabledClass}>Previous</span>
      )}
      <span>
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={hrefForPage(basePath, searchParams, page + 1)} className={linkClass}>
          Next
        </Link>
      ) : (
        <span className={disabledClass}>Next</span>
      )}
    </nav>
  );
}
