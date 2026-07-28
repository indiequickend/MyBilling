import Link from "next/link";
import { logoutAction } from "@/app/(dashboard)/actions";
import { switchBusinessAction } from "@/app/(dashboard)/businesses/actions";
import { can, type MembershipContext } from "@/lib/rbac/can";
import type { ModuleKey, ActionKey } from "@/lib/rbac/permissions";

type NavLink = { href: string; label: string; moduleKey?: ModuleKey; action?: ActionKey };

const MAIN_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard" },
  { href: "/customers", label: "Customers", moduleKey: "customers", action: "view" },
  { href: "/vendors", label: "Vendors", moduleKey: "vendors", action: "view" },
  { href: "/products", label: "Products & Services", moduleKey: "products", action: "view" },
  { href: "/inventory/warehouses", label: "Warehouses", moduleKey: "inventory", action: "view" },
];

const SETTINGS_LINKS: NavLink[] = [
  { href: "/settings/profile", label: "Profile" },
  {
    href: "/settings/company",
    label: "Company Details",
    moduleKey: "settings",
    action: "manage_company",
  },
  {
    href: "/settings/preferences",
    label: "Preferences",
    moduleKey: "settings",
    action: "manage_preferences",
  },
  { href: "/settings/users", label: "Users", moduleKey: "settings", action: "manage_users" },
  {
    href: "/settings/roles",
    label: "Roles & Permissions",
    moduleKey: "settings",
    action: "manage_roles",
  },
];

function visibleLinks(links: NavLink[], membership: MembershipContext | null): NavLink[] {
  return links.filter((link) => {
    if (!link.moduleKey || !link.action) return true;
    if (!membership) return false;
    return can(membership, link.moduleKey, link.action);
  });
}

export function Sidebar({
  userName,
  businesses,
  activeBusinessId,
  membership,
}: {
  userName: string;
  businesses: Array<{ _id: unknown; name: string }>;
  activeBusinessId: string | null;
  membership: MembershipContext | null;
}) {
  const mainLinks = visibleLinks(MAIN_LINKS, membership);
  const settingsLinks = visibleLinks(SETTINGS_LINKS, membership);

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

      <nav className="flex-1 space-y-4 text-sm">
        <div className="space-y-1">
          {mainLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-3 py-2 hover:bg-slate-100"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {settingsLinks.length > 0 ? (
          <div>
            <p className="mb-1 px-3 text-xs font-medium tracking-wide text-slate-400 uppercase">
              Settings
            </p>
            <div className="space-y-1">
              {settingsLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-md px-3 py-2 hover:bg-slate-100"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

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
