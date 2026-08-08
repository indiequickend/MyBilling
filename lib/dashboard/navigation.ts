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
  | "payments"
  | "projects"
  | "settings"
  | "profile"
  | "company"
  | "preferences"
  | "signatures"
  | "notesTerms"
  | "documentFields"
  | "banks"
  | "users"
  | "roles"
  | "insights"
  | "reports"
  | "gst"
  | "apiKeys"
  | "webhooks"
  | "paymentGateway"
  | "auditLog";

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
  // No moduleKey/action gate at the group level — Insights has no dedicated permission; each
  // tile/chart on the page self-gates against its own underlying module's view permission, so
  // the page itself never 403s, it just shows fewer tiles.
  { href: "/insights", label: "Insights", icon: "insights" },
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
    label: "Inventory",
    icon: "warehouses",
    moduleKey: "inventory",
    action: "view",
    children: [
      { href: "/inventory/warehouses", label: "Warehouses", icon: "warehouses", moduleKey: "inventory", action: "view" },
      { href: "/inventory/stock", label: "Stock In / Out", icon: "warehouses", moduleKey: "inventory", action: "edit" },
      { href: "/inventory/timeline", label: "Timeline", icon: "warehouses", moduleKey: "inventory", action: "view" },
    ],
  },
  {
    href: "/payments",
    label: "Payments",
    icon: "payments",
    moduleKey: "payments",
    action: "view",
    children: [
      { href: "/payments", label: "Timeline", icon: "payments", moduleKey: "payments", action: "view" },
      { href: "/payments/links", label: "Payment Links", icon: "payments", moduleKey: "payments", action: "view" },
      { href: "/payments/journals", label: "Journals", icon: "payments", moduleKey: "payments", action: "view" },
      {
        href: "/payments/reconciliation",
        label: "Bank Reconciliation",
        icon: "payments",
        moduleKey: "payments",
        action: "view",
      },
    ],
  },
  {
    href: "/projects",
    label: "Projects",
    icon: "projects",
    moduleKey: "projects",
    action: "view",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "reports",
    moduleKey: "reports",
    action: "view",
    children: [
      { href: "/reports/transactions", label: "Transactions", icon: "reports", moduleKey: "reports", action: "view" },
      {
        href: "/reports/bill-wise-items",
        label: "Bill-wise Items",
        icon: "reports",
        moduleKey: "reports",
        action: "view",
      },
      { href: "/reports/items", label: "Items", icon: "reports", moduleKey: "reports", action: "view" },
      { href: "/reports/parties", label: "Parties", icon: "reports", moduleKey: "reports", action: "view" },
      {
        href: "/reports/profit-and-loss",
        label: "Profit & Loss",
        icon: "reports",
        moduleKey: "reports",
        action: "view",
      },
      { href: "/reports/payments", label: "Payments", icon: "reports", moduleKey: "reports", action: "view" },
      { href: "/reports/summary", label: "Summary", icon: "reports", moduleKey: "reports", action: "view" },
      { href: "/reports/day-book", label: "Day Book", icon: "reports", moduleKey: "reports", action: "view" },
      {
        href: "/reports/conversions",
        label: "Document Conversions",
        icon: "reports",
        moduleKey: "reports",
        action: "view",
      },
      {
        href: "/reports/share-history",
        label: "Share History",
        icon: "reports",
        moduleKey: "reports",
        action: "view",
      },
      {
        href: "/reports/hsn-summary",
        label: "Sale Summary by HSN",
        icon: "reports",
        moduleKey: "reports",
        action: "view",
      },
      { href: "/reports/tds-tcs", label: "TDS/TCS", icon: "reports", moduleKey: "reports", action: "view" },
    ],
  },
  {
    href: "/gst",
    label: "GST",
    icon: "gst",
    moduleKey: "gst",
    action: "view",
    children: [
      { href: "/gst/gstr1", label: "GSTR-1", icon: "gst", moduleKey: "gst", action: "view" },
      { href: "/gst/gstr3b", label: "GSTR-3B", icon: "gst", moduleKey: "gst", action: "view" },
      { href: "/gst/gstr2b", label: "GSTR-2B Reconciliation", icon: "gst", moduleKey: "gst", action: "view" },
      { href: "/gst/e-way-bills", label: "E-way Bills", icon: "gst", moduleKey: "gst", action: "view" },
      { href: "/gst/e-invoices", label: "E-Invoices", icon: "gst", moduleKey: "gst", action: "view" },
    ],
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
      href: "/settings/businesses",
      label: "Businesses",
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
    {
      href: "/settings/api-keys",
      label: "API Keys",
      icon: "apiKeys",
      moduleKey: "settings",
      action: "manage_integrations",
    },
    {
      href: "/settings/webhooks",
      label: "Webhooks",
      icon: "webhooks",
      moduleKey: "settings",
      action: "manage_integrations",
    },
    {
      href: "/settings/payment-gateway",
      label: "Payment Gateway",
      icon: "paymentGateway",
      moduleKey: "settings",
      action: "manage_integrations",
    },
    {
      href: "/settings/audit-log",
      label: "Audit Log",
      icon: "auditLog",
      moduleKey: "settings",
      action: "view_audit_log",
    },
  ],
};

export function isVisible(item: NavItem, membership: MembershipContext | null): boolean {
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

const BOTTOM_TAB_CANDIDATES: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/sales/invoices", label: "Invoices", icon: "invoices", moduleKey: "sales_invoices", action: "view" },
  { href: "/payments", label: "Payments", icon: "payments", moduleKey: "payments", action: "view" },
];

/** No unified "parties" list exists — prefer Customers, fall back to Vendors, hide if neither is permitted. */
function buildPartiesTabItem(membership: MembershipContext | null): NavItem | null {
  const customers: NavItem = { href: "/customers", label: "Parties", icon: "customers", moduleKey: "customers", action: "view" };
  const vendors: NavItem = { href: "/vendors", label: "Parties", icon: "vendors", moduleKey: "vendors", action: "view" };
  if (isVisible(customers, membership)) return customers;
  if (isVisible(vendors, membership)) return vendors;
  return null;
}

/**
 * Fixed 5th-slot-reserved-for-"More" bottom tab bar items (mobile shell, `md:hidden`).
 * Runs through the same RBAC visibility check as `buildNavGroups` — no duplicated
 * permission logic. A role missing one of these simply doesn't get that slot,
 * rather than another item shifting in to fill the gap.
 */
export function buildBottomTabItems(membership: MembershipContext | null): NavItem[] {
  const items = BOTTOM_TAB_CANDIDATES.filter((item) => isVisible(item, membership));
  const parties = buildPartiesTabItem(membership);
  return parties ? [...items, parties] : items;
}

const QUICK_CREATE_CANDIDATES: NavItem[] = [
  { href: "/sales/invoices/new", label: "Invoice", icon: "invoices", moduleKey: "sales_invoices", action: "create" },
  { href: "/customers/new", label: "Customer", icon: "customers", moduleKey: "customers", action: "create" },
  // No standalone "record a payment" route exists — payments are recorded from
  // the specific invoice/purchase/expense they settle. Link to the Timeline instead.
  { href: "/payments/new", label: "Payments", icon: "payments", moduleKey: "payments", action: "create" },
];

/** RBAC-filtered shortcuts for the mobile quick-create sheet. */
export function buildQuickCreateItems(membership: MembershipContext | null): NavItem[] {
  return QUICK_CREATE_CANDIDATES.filter((item) => isVisible(item, membership));
}
