import Link from "next/link";
import { logoutAction } from "@/app/(dashboard)/actions";
import { switchBusinessAction } from "@/app/(dashboard)/businesses/actions";

export function Sidebar({
  userName,
  businesses,
  activeBusinessId,
}: {
  userName: string;
  businesses: Array<{ _id: unknown; name: string }>;
  activeBusinessId: string | null;
}) {
  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white p-4">
      <div className="mb-6">
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
      </div>

      {businesses.length > 0 ? (
        <form action={switchBusinessAction} className="mb-6 space-y-2">
          <label className="block text-xs font-medium text-slate-500">Business</label>
          <select
            name="businessId"
            defaultValue={activeBusinessId ?? undefined}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {businesses.map((b) => (
              <option key={String(b._id)} value={String(b._id)}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Switch
          </button>
        </form>
      ) : null}

      <nav className="flex-1 space-y-1 text-sm">
        <Link href="/" className="block rounded-md px-3 py-2 hover:bg-slate-100">
          Dashboard
        </Link>
        <Link href="/settings/profile" className="block rounded-md px-3 py-2 hover:bg-slate-100">
          Profile
        </Link>
        <Link href="/settings/users" className="block rounded-md px-3 py-2 hover:bg-slate-100">
          Users
        </Link>
        <Link href="/settings/roles" className="block rounded-md px-3 py-2 hover:bg-slate-100">
          Roles &amp; Permissions
        </Link>
        <Link href="/businesses/new" className="block rounded-md px-3 py-2 hover:bg-slate-100">
          + Add another business
        </Link>
      </nav>

      <form action={logoutAction}>
        <button
          type="submit"
          className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100"
        >
          Log out
        </button>
      </form>
    </aside>
  );
}
