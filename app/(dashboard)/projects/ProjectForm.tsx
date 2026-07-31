"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FormError } from "@/components/auth/AuthCard";
import { createProjectAction, updateProjectAction, type ProjectFormState } from "./actions";

const initialState: ProjectFormState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}

export function ProjectForm({
  mode,
  projectId,
  defaultValues,
}: {
  mode: "create" | "edit";
  projectId?: string;
  defaultValues?: { name: string; description: string };
}) {
  const [state, formAction] = useActionState(
    mode === "create" ? createProjectAction : updateProjectAction,
    initialState,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-6">
      <FormError message={state.error} />
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}

      <Card>
        <CardContent>
          <FieldGroup>
            <FormField label="Name" name="name" required defaultValue={defaultValues?.name} />
            <Field>
              <FieldLabel htmlFor="description">Description (optional)</FieldLabel>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={defaultValues?.description}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <SubmitButton label={mode === "create" ? "Create project" : "Save changes"} />
    </form>
  );
}
