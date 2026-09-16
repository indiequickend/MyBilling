"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/FormField";
import { FormError } from "@/components/auth/AuthCard";
import { SubmitButton } from "@/components/ui/SubmitButton";

export type QuickAddPartyState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  created?: { id: string; label: string };
};

/** The bare-minimum create form for a customer/vendor, opened from a document's party picker
 * (Invoice/Quotation/Purchase/etc.) so the user doesn't have to abandon the document to go create
 * one first. Deliberately only asks for what the full Customer/Vendor form requires at minimum
 * (name) plus the fields most useful to have on the document right away — everything else (address,
 * groups, notes) can be filled in later from the Customers/Vendors page. */
export function QuickAddPartyDialog({
  partyType,
  action,
  onCreated,
}: {
  partyType: "customer" | "vendor";
  action: (prev: QuickAddPartyState, formData: FormData) => Promise<QuickAddPartyState>;
  onCreated: (party: { id: string; label: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = partyType === "customer" ? "Customer" : "Vendor";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`Add new ${label.toLowerCase()}`}
        title={`Add new ${label.toLowerCase()}`}
      >
        <Plus />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {open ? (
            <QuickAddPartyForm
              label={label}
              action={action}
              onCreated={(party) => {
                onCreated(party);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

const initialState: QuickAddPartyState = {};

function QuickAddPartyForm({
  label,
  action,
  onCreated,
  onCancel,
}: {
  label: string;
  action: (prev: QuickAddPartyState, formData: FormData) => Promise<QuickAddPartyState>;
  onCreated: (party: { id: string; label: string }) => void;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const handledCreatedId = useRef<string | null>(null);

  useEffect(() => {
    if (state.created && state.created.id !== handledCreatedId.current) {
      handledCreatedId.current = state.created.id;
      onCreated(state.created);
    }
  }, [state.created, onCreated]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>New {label.toLowerCase()}</DialogTitle>
        <DialogDescription>
          Save the essentials now — add address, groups, or notes later from {label}s.
        </DialogDescription>
      </DialogHeader>
      <form action={formAction} className="space-y-4">
        <FormError message={state.error} />
        <FormField
          label="Name"
          name="displayName"
          required
          autoComplete="off"
          error={state.fieldErrors?.displayName}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Company name"
            name="companyName"
            autoComplete="off"
            error={state.fieldErrors?.companyName}
          />
          <FormField
            label="GSTIN"
            name="gstin"
            placeholder="22AAAAA0000A1Z5"
            autoComplete="off"
            error={state.fieldErrors?.gstin}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Phone"
            name="phone"
            autoComplete="off"
            error={state.fieldErrors?.phone}
          />
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="off"
            error={state.fieldErrors?.email}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <SubmitButton pendingText="Saving…" className="w-auto">
            Create {label.toLowerCase()}
          </SubmitButton>
        </DialogFooter>
      </form>
    </>
  );
}
