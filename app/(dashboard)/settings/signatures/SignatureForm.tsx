"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { Field, FieldLabel } from "@/components/ui/field";
import { createSignatureAction, updateSignatureAction, type SignatureFormState } from "./actions";

const initialState: SignatureFormState = {};

export function SignatureForm({
  mode,
  signatureId,
  defaultValues,
}: {
  mode: "create" | "edit";
  signatureId?: string;
  defaultValues?: { name: string; imageUrl: string };
}) {
  const action = mode === "create" ? createSignatureAction : updateSignatureAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-lg space-y-6">
      <FormError message={state.error} />
      {signatureId ? <input type="hidden" name="signatureId" value={signatureId} /> : null}

      <FormField
        label="Name"
        name="name"
        required
        defaultValue={defaultValues?.name}
        error={state.fieldErrors?.name}
      />

      <div className="flex items-center gap-4">
        {defaultValues?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={defaultValues.imageUrl}
            alt="Current signature"
            className="h-16 w-32 rounded-lg border object-contain"
          />
        ) : null}
        <Field>
          <FieldLabel htmlFor="image">
            {mode === "create" ? "Signature image" : "Replace image (optional)"}
          </FieldLabel>
          <input
            id="image"
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp"
            required={mode === "create"}
            className="text-sm"
          />
        </Field>
      </div>

      <div className="max-w-lg">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Add signature" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
