"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import type { EwayBillTransportDetailsDoc } from "@/lib/db/models/EwayBillData";
import { generateEwayBillDataAction, type GstActionState } from "@/app/(dashboard)/gst/e-way-bills/[invoiceId]/actions";

const initialState: GstActionState = {};

const fieldClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Generating…" : "Generate"}
    </Button>
  );
}

export function GenerateEwayBillForm({
  invoiceId,
  existing,
}: {
  invoiceId: string;
  existing?: EwayBillTransportDetailsDoc;
}) {
  const [state, formAction] = useActionState(generateEwayBillDataAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <Field>
        <FieldLabel htmlFor="transporterId">Transporter ID (GSTIN, optional)</FieldLabel>
        <input id="transporterId" name="transporterId" defaultValue={existing?.transporterId} className={fieldClass} />
      </Field>

      <Field>
        <FieldLabel htmlFor="transporterName">Transporter Name</FieldLabel>
        <input id="transporterName" name="transporterName" defaultValue={existing?.transporterName} className={fieldClass} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="transMode">Mode</FieldLabel>
          <select id="transMode" name="transMode" defaultValue={existing?.transMode ?? "1"} className={fieldClass}>
            <option value="1">Road</option>
            <option value="2">Rail</option>
            <option value="3">Air</option>
            <option value="4">Ship</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="vehicleType">Vehicle Type</FieldLabel>
          <select id="vehicleType" name="vehicleType" defaultValue={existing?.vehicleType ?? "R"} className={fieldClass}>
            <option value="R">Regular</option>
            <option value="O">Over Dimensional Cargo</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="vehicleNumber">Vehicle Number</FieldLabel>
          <input id="vehicleNumber" name="vehicleNumber" defaultValue={existing?.vehicleNumber} className={fieldClass} />
        </Field>
        <Field>
          <FieldLabel htmlFor="transDistanceKm">Distance (km)</FieldLabel>
          <input
            id="transDistanceKm"
            name="transDistanceKm"
            type="number"
            min={0}
            defaultValue={existing?.transDistanceKm}
            className={fieldClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="transDocNo">Transport Doc No.</FieldLabel>
          <input id="transDocNo" name="transDocNo" defaultValue={existing?.transDocNo} className={fieldClass} />
        </Field>
        <Field>
          <FieldLabel htmlFor="transDocDate">Transport Doc Date</FieldLabel>
          <input id="transDocDate" name="transDocDate" type="date" className={fieldClass} />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="subSupplyType">Sub Supply Type</FieldLabel>
        <select id="subSupplyType" name="subSupplyType" defaultValue={existing?.subSupplyType ?? "1"} className={fieldClass}>
          <option value="1">Supply</option>
          <option value="2">Import</option>
          <option value="3">Export</option>
          <option value="4">Job Work</option>
          <option value="5">For Own Use</option>
          <option value="6">Job Work Returns</option>
          <option value="7">Sales Return</option>
          <option value="8">Others</option>
          <option value="9">SKD/CKD</option>
        </select>
      </Field>

      <SubmitButton />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
