"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { createRoleFromTemplateAction, type RolesPageState } from "./actions";
import { ROLE_TEMPLATES } from "@/lib/rbac/templates";

const initialState: RolesPageState = {};

export function TemplateRoleForm() {
  const [state, formAction] = useActionState(createRoleFromTemplateAction, initialState);
  const templateNames = Object.keys(ROLE_TEMPLATES);

  return (
    <form action={formAction} className="flex max-w-xl items-end gap-3">
      <div className="flex-1 space-y-4">
        <FormError message={state.error} />
        <FormNotice message={state.success} />
        <FormField label="Role name" name="name" required placeholder="e.g. Cashier" />
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Based on</span>
        <select name="template" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          {templateNames.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pendingText="Creating…">Create</SubmitButton>
    </form>
  );
}
