"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { updateRoleAction, deleteRoleAction, type RolesPageState } from "./actions";
import { PermissionMatrixFields } from "./PermissionMatrixFields";
import type { PermissionMatrix } from "@/lib/db/models/Role";

const initialState: RolesPageState = {};

export function RoleEditForm({
  roleId,
  name,
  permissions,
  isSystemDefault,
}: {
  roleId: string;
  name: string;
  permissions: PermissionMatrix;
  isSystemDefault: boolean;
}) {
  const [updateState, updateFormAction] = useActionState(updateRoleAction, initialState);
  const [deleteState, deleteFormAction] = useActionState(deleteRoleAction, initialState);

  return (
    <div className="space-y-4">
      <form action={updateFormAction} className="space-y-4">
        <FormError message={updateState.error} />
        <FormNotice message={updateState.success} />
        <input type="hidden" name="roleId" value={roleId} />
        <div className="max-w-xs">
          <FormField label="Role name" name="name" required defaultValue={name} />
        </div>
        <PermissionMatrixFields defaultPermissions={permissions} />
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </form>

      {!isSystemDefault ? (
        <form action={deleteFormAction} className="border-t border-slate-200 pt-4">
          <FormError message={deleteState.error} />
          <input type="hidden" name="roleId" value={roleId} />
          <button
            type="submit"
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Delete role
          </button>
        </form>
      ) : (
        <p className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          This is the default Admin role and can&apos;t be deleted.
        </p>
      )}
    </div>
  );
}
