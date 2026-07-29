import { emptyPermissionMatrix, PERMISSION_CATALOG, type ModuleKey } from "@/lib/rbac/permissions";
import type { PermissionMatrix } from "@/lib/db/models/Role";

function fullyGranted(modules: readonly ModuleKey[]): PermissionMatrix {
  const matrix = emptyPermissionMatrix();
  for (const moduleKey of modules) {
    for (const action of PERMISSION_CATALOG[moduleKey]) {
      matrix[moduleKey][action] = true;
    }
  }
  return matrix;
}

/** Everything granted — assigned automatically to the creator of a business. */
export const ADMIN_TEMPLATE_PERMISSIONS: PermissionMatrix = fullyGranted(
  Object.keys(PERMISSION_CATALOG) as ModuleKey[],
);

/** Financial modules only; no settings/user management. */
export const ACCOUNTS_TEMPLATE_PERMISSIONS: PermissionMatrix = fullyGranted([
  "purchases",
  "purchase_orders",
  "debit_notes",
  "expenses",
  "indirect_income",
  "payments",
  "reports",
  "gst",
]);
// Bank/cash/personal accounts and transfer funds are the one Settings-area screen an Accounts
// role needs — a targeted grant rather than a full "settings" module (which would also hand out
// company/user/role management).
ACCOUNTS_TEMPLATE_PERMISSIONS.settings.manage_banking = true;

/** Sales-side modules only; no purchasing, settings, or user management. */
export const SALES_MANAGER_TEMPLATE_PERMISSIONS: PermissionMatrix = fullyGranted([
  "sales_invoices",
  "sales_credit_notes",
  "quotations",
  "sales_orders",
  "proforma_invoices",
  "customers",
  "products",
  "pos",
]);
// Signatures/Notes & Terms/document custom fields are what a Sales Manager needs to configure
// their own documents — same targeted-grant reasoning as Accounts' manage_banking above.
SALES_MANAGER_TEMPLATE_PERMISSIONS.settings.manage_document_settings = true;

export const ROLE_TEMPLATES = {
  Admin: ADMIN_TEMPLATE_PERMISSIONS,
  Accounts: ACCOUNTS_TEMPLATE_PERMISSIONS,
  "Sales Manager": SALES_MANAGER_TEMPLATE_PERMISSIONS,
} as const;

export type RoleTemplateName = keyof typeof ROLE_TEMPLATES;
