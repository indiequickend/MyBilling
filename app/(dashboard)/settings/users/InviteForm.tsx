"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { inviteUserAction, type UsersPageState } from "./actions";

const initialState: UsersPageState = {};

export function InviteForm({ roles }: { roles: Array<{ id: string; name: string }> }) {
  const [state, formAction] = useActionState(inviteUserAction, initialState);

  return (
    <form action={formAction} className="flex max-w-xl items-end gap-3">
      <div className="flex-1 space-y-4">
        <FormError message={state.error} />
        <FormNotice message={state.success} />
        <FormField label="Email to invite" name="email" type="email" required />
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Role</span>
        <select
          name="roleId"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pendingText="Sending…">Invite</SubmitButton>
    </form>
  );
}
