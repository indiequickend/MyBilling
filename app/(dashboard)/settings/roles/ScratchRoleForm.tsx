"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { createRoleFromScratchAction, type RolesPageState } from "./actions";
import { PermissionMatrixFields } from "./PermissionMatrixFields";

const initialState: RolesPageState = {};

export function ScratchRoleForm() {
  const [state, formAction] = useActionState(createRoleFromScratchAction, initialState);

  return (
    <form action={formAction} className="space-y-4" data-testid="scratch-role-form">
      <FormError message={state.error} />
      <FormNotice message={state.success} />
      <div className="max-w-xs">
        <FormField label="Role name" name="name" required placeholder="e.g. Warehouse Staff" />
      </div>
      <PermissionMatrixFields />
      <SubmitButton pendingText="Creating…">Create role</SubmitButton>
    </form>
  );
}
