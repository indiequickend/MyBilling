import { can, type MembershipContext } from "@/lib/rbac/can";
import type { ModuleKey, ActionKey } from "@/lib/rbac/permissions";

/** Icon keys only — never pass the actual icon component (a non-plain object) from this
 * server-computed data across the Server->Client boundary. `NavLinks` (a Client Component)
 * resolves these to real `lucide-react` components. */
export type NavIconKey =
  | "dashboard"
  | "invoices"
  | "quotations"
  | "purchases"
  | "expenses"
  | "customers"
  | "vendors"
  | "products"
  | "warehouses"
  | "settings"
  | "profile"
  | "company"
  | "preferences"
  | "signatures"
  | "notesTerms"
  | "documentFields"
  | "banks"
  | "users"
  | "roles";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
  moduleKey?: ModuleKey;
  action?: ActionKey;
};

export type NavGroup = NavItem & { children?: NavItem[] };

const MAIN_GROUPS: NavGroup[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  {
    href: "/sales/invoices",
    label: "Invoices",
    icon: "invoices",
    moduleKey: "sales_invoices",
    action: "view",
    children: [
      {
        href: "/sales/credit-notes",
        label: "Credit Notes",
        icon: "invoices",
        moduleKey: "sales_credit_notes",
        action: "view",
      },
    ],
  },
  {
    href: "/sales/quotations",
    label: "Quotations+",
    icon: "quotations",
    moduleKey: "quotations",
    action: "view",
    children: [
      {
        href: "/sales/quotations",
        label: "Quotations",
        icon: "quotations",
        moduleKey: "quotations",
        action: "view",
      },
      {
        href: "/sales/sales-orders",
        label: "Sales Orders",
        icon: "quotations",
        moduleKey: "sales_orders",
        action: "view",
      },
      {
        href: "/sales/proforma-invoices",
        label: "Pro Forma Invoices",
        icon: "quotations",
        moduleKey: "proforma_invoices",
        action: "view",
      },
    ],
  },
  {
    href: "/purchases",
    label: "Purchases",
    icon: "purchases",
    moduleKey: "purchases",
    action: "view",
    children: [
      {
        href: "/purchases/orders",
        label: "Purchase Orders",
        icon: "purchases",
        moduleKey: "purchase_orders",
        action: "view",
      },
      {
        href: "/purchases/debit-notes",
        label: "Debit Notes",
        icon: "purchases",
        moduleKey: "debit_notes",
        action: "view",
      },
    ],
  },
  {
    href: "/expenses",
    label: "Expenses",
    icon: "expenses",
    moduleKey: "expenses",
    action: "view",
    children: [
      {
        href: "/expenses/categories",
        label: "Categories",
        icon: "expenses",
        moduleKey: "expenses",
        action: "view",
      },
    ],
  },
  {
    href: "/indirect-income",
    label: "Indirect Income",
    icon: "expenses",
    moduleKey: "indirect_income",
    action: "view",
  },
  {
    href: "/customers",
    label: "Customers",
    icon: "customers",
    moduleKey: "customers",
    action: "view",
    children: [
      { href: "/customers/groups", label: "Groups", icon: "customers", moduleKey: "customers", action: "view" },
    ],
  },
  {
    href: "/vendors",
    label: "Vendors",
    icon: "vendors",
    moduleKey: "vendors",
    action: "view",
    children: [
      { href: "/vendors/groups", label: "Groups", icon: "vendors", moduleKey: "vendors", action: "view" },
    ],
  },
  {
    href: "/products",
    label: "Products & Services",
    icon: "products",
    moduleKey: "products",
    action: "view",
    children: [
      { href: "/products/categories", label: "Categories", icon: "products", moduleKey: "products", action: "view" },
      { href: "/products/groups", label: "Groups", icon: "products", moduleKey: "products", action: "view" },
      {
        href: "/products/price-lists",
        label: "Price Lists",
        icon: "products",
        moduleKey: "products",
        action: "view",
      },
    ],
  },
  {
    href: "/inventory/warehouses",
    label: "Warehouses",
    icon: "warehouses",
    moduleKey: "inventory",
    action: "view",
  },
];

const SETTINGS_GROUP: NavGroup = {
  href: "/settings/profile",
  label: "Settings",
  icon: "settings",
  children: [
    { href: "/settings/profile", label: "Profile", icon: "profile" },
    {
      href: "/settings/company",
      label: "Company Details",
      icon: "company",
      moduleKey: "settings",
      action: "manage_company",
    },
    {
      href: "/settings/preferences",
      label: "Preferences",
      icon: "preferences",
      moduleKey: "settings",
      action: "manage_preferences",
    },
    {
      href: "/settings/signatures",
      label: "Signatures",
      icon: "signatures",
      moduleKey: "settings",
      action: "manage_document_settings",
    },
    {
      href: "/settings/notes-terms",
      label: "Notes & Terms",
      icon: "notesTerms",
      moduleKey: "settings",
      action: "manage_document_settings",
    },
    {
      href: "/settings/document-fields",
      label: "Document Custom Fields",
      icon: "documentFields",
      moduleKey: "settings",
      action: "manage_document_settings",
    },
    {
      href: "/settings/banks",
      label: "Banks",
      icon: "banks",
      moduleKey: "settings",
      action: "manage_banking",
    },
    {
      href: "/settings/users",
      label: "Users",
      icon: "users",
      moduleKey: "settings",
      action: "manage_users",
    },
    {
      href: "/settings/roles",
      label: "Roles & Permissions",
      icon: "roles",
      moduleKey: "settings",
      action: "manage_roles",
    },
  ],
};

function isVisible(item: NavItem, membership: MembershipContext | null): boolean {
  if (!item.moduleKey || !item.action) return true;
  if (!membership) return false;
  return can(membership, item.moduleKey, item.action);
}

function filterGroup(group: NavGroup, membership: MembershipContext | null): NavGroup | null {
  if (!isVisible(group, membership)) return null;
  const children = group.children?.filter((child) => isVisible(child, membership));
  return { ...group, children: children && children.length > 0 ? children : undefined };
}

/** RBAC-filtered nav data, computed once server-side and shared by desktop + mobile nav renderers. */
export function buildNavGroups(membership: MembershipContext | null): {
  main: NavGroup[];
  settings: NavGroup | null;
} {
  const main = MAIN_GROUPS.map((g) => filterGroup(g, membership)).filter(
    (g): g is NavGroup => g !== null,
  );
  const settings = filterGroup(SETTINGS_GROUP, membership);
  return { main, settings };
}
