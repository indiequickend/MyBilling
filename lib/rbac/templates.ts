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
  "expenses",
  "indirect_income",
  "payments",
  "reports",
  "gst",
]);

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

export const ROLE_TEMPLATES = {
  Admin: ADMIN_TEMPLATE_PERMISSIONS,
  Accounts: ACCOUNTS_TEMPLATE_PERMISSIONS,
  "Sales Manager": SALES_MANAGER_TEMPLATE_PERMISSIONS,
} as const;

export type RoleTemplateName = keyof typeof ROLE_TEMPLATES;
