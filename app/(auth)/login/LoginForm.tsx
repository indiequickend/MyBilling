"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormField label="Email" name="email" type="email" required autoComplete="email" />
      <FormField
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
      />
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  );
}
