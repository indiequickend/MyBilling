import { emptyPermissionMatrix } from "@/lib/rbac/permissions";
import type { PermissionMatrix } from "@/lib/db/models/Role";

/**
 * Reads checkbox fields named `perm__{module}__{action}` (present = checked) out
 * of a submitted form and turns them into a full permission matrix, defaulting
 * every unlisted module/action to false.
 */
export function parsePermissionMatrixFromFormData(formData: FormData): PermissionMatrix {
  const matrix = emptyPermissionMatrix();
  for (const key of formData.keys()) {
    const match = /^perm__(.+)__(.+)$/.exec(key);
    if (!match) continue;
    const [, moduleKey, actionKey] = match;
    if (matrix[moduleKey] && actionKey in matrix[moduleKey]) {
      matrix[moduleKey][actionKey] = true;
    }
  }
  return matrix;
}

export function permissionCheckboxName(moduleKey: string, actionKey: string): string {
  return `perm__${moduleKey}__${actionKey}`;
}
