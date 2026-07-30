"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { revokeApiKeyAction, type ApiKeyActionState } from "./actions";

const initialState: ApiKeyActionState = {};

export function RevokeApiKeyButton({ apiKeyId }: { apiKeyId: string }) {
  const [state, formAction] = useActionState(revokeApiKeyAction, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="apiKeyId" value={apiKeyId} />
      <Button type="submit" variant="destructive" size="sm">
        Revoke
      </Button>
      {state.error ? <span className="max-w-40 text-right text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
