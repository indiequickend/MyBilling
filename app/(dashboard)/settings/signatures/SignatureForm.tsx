"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
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
            className="h-16 w-32 rounded-md border border-slate-200 object-contain"
          />
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {mode === "create" ? "Signature image" : "Replace image (optional)"}
          </span>
          <input
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp"
            required={mode === "create"}
            className="text-sm"
          />
        </label>
      </div>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Add signature" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
