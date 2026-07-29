"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { Field, FieldLabel } from "@/components/ui/field";
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
      <Field className="w-40">
        <FieldLabel htmlFor="roleId">Role</FieldLabel>
        <SelectField name="roleId" placeholder="Role" required options={roles.map((r) => ({ value: r.id, label: r.name }))} />
      </Field>
      <SubmitButton pendingText="Sending…" className="w-auto">
        Invite
      </SubmitButton>
    </form>
  );
}
