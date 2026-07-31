/**
 * The full permission catalog — one row per project_spec.md module. This is what
 * the Roles & Permissions UI renders as its matrix. Only a subset of these
 * actions is actually enforced by real routes in Phase 1 (the `settings.*`
 * ones); later phases enforce their own module's actions as they're built, but
 * the catalog itself is defined once, here, so the matrix never has to change
 * shape when a new module's routes land.
 */

export const STANDARD_ACTIONS = ["view", "create", "edit", "delete", "export"] as const;
export type StandardAction = (typeof STANDARD_ACTIONS)[number];

export const STANDARD_MODULES = [
  "sales_invoices",
  "sales_credit_notes",
  "purchases",
  "purchase_orders",
  "debit_notes",
  "quotations",
  "sales_orders",
  "proforma_invoices",
  "expenses",
  "indirect_income",
  "products",
  "inventory",
  "payments",
  "customers",
  "vendors",
  "projects",
  "reports",
  "online_store",
  "gst",
  "pos",
] as const;
export type StandardModule = (typeof STANDARD_MODULES)[number];

export const SETTINGS_ACTIONS = [
  "manage_company",
  "manage_users",
  "manage_roles",
  "manage_preferences",
  "manage_integrations",
  // Signatures + Notes & Terms + per-document custom field defs — Settings-area screens, not
  // their own STANDARD_MODULE.
  "manage_document_settings",
  // Bank/cash/personal accounts + transfer funds.
  "manage_banking",
  // View-only access to the Audit Log — deliberately separate from manage_roles/manage_users so
  // it can be granted without also granting the ability to change who has access to what.
  "view_audit_log",
] as const;
export type SettingsAction = (typeof SETTINGS_ACTIONS)[number];

export type ModuleKey = StandardModule | "settings";
export type ActionKey = StandardAction | SettingsAction;

/** Every valid (module, action) pair — used to validate a Role's `permissions` shape. */
const partialCatalog: Partial<Record<ModuleKey, readonly ActionKey[]>> = {
  settings: SETTINGS_ACTIONS,
};
for (const moduleKey of STANDARD_MODULES) {
  partialCatalog[moduleKey] = STANDARD_ACTIONS;
}
export const PERMISSION_CATALOG = partialCatalog as Record<ModuleKey, readonly ActionKey[]>;

export function isValidModule(value: string): value is ModuleKey {
  return value in PERMISSION_CATALOG;
}

export function isValidAction(moduleKey: ModuleKey, value: string): value is ActionKey {
  return (PERMISSION_CATALOG[moduleKey] as readonly string[]).includes(value);
}

/** An all-false permission matrix covering every module/action in the catalog. */
export function emptyPermissionMatrix(): Record<string, Record<string, boolean>> {
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const [moduleKey, actions] of Object.entries(PERMISSION_CATALOG)) {
    matrix[moduleKey] = Object.fromEntries(actions.map((a) => [a, false]));
  }
  return matrix;
}
