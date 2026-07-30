"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Copy, Check } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createApiKeyAction, type ApiKeyFormState } from "./actions";

const initialState: ApiKeyFormState = {};

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Create API key
    </Button>
  );
}

function CopyableKey({ rawKey }: { rawKey: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
      <code className="flex-1 truncate text-sm">{rawKey}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(rawKey);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function ApiKeyForm({ roles }: { roles: Array<{ id: string; name: string }> }) {
  const [state, formAction] = useActionState(createApiKeyAction, initialState);

  if (state.rawKey) {
    return (
      <Card className="max-w-lg">
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Copy this key now — for security, it won&apos;t be shown again. Anyone with this key can
            act as the Role you assigned it.
          </p>
          <CopyableKey rawKey={state.rawKey} />
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="max-w-lg space-y-6">
      <FormError message={state.error} />
      <Card>
        <CardContent>
          <FieldGroup>
            <FormField label="Name" name="name" required error={state.fieldErrors?.name} />
            <Field data-invalid={state.fieldErrors?.roleId ? true : undefined}>
              <FieldLabel htmlFor="roleId">Role</FieldLabel>
              <SelectField
                name="roleId"
                placeholder="Select a role"
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
              <FieldError>{state.fieldErrors?.roleId}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <CreateButton />
    </form>
  );
}
