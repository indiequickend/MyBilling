import { FormField } from "@/components/ui/FormField";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";

export type AddressFieldValues = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export function AddressFields({
  legend,
  namePrefix,
  defaultValue,
}: {
  legend: string;
  namePrefix: string;
  defaultValue?: AddressFieldValues | null;
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <FieldGroup className="gap-3">
        <FormField
          label="Address line 1"
          name={`${namePrefix}Line1`}
          defaultValue={defaultValue?.line1 ?? undefined}
        />
        <FormField
          label="Address line 2"
          name={`${namePrefix}Line2`}
          defaultValue={defaultValue?.line2 ?? undefined}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="City"
            name={`${namePrefix}City`}
            defaultValue={defaultValue?.city ?? undefined}
          />
          <FormField
            label="State"
            name={`${namePrefix}State`}
            defaultValue={defaultValue?.state ?? undefined}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Postal code"
            name={`${namePrefix}PostalCode`}
            defaultValue={defaultValue?.postalCode ?? undefined}
          />
          <FormField
            label="Country"
            name={`${namePrefix}Country`}
            defaultValue={defaultValue?.country ?? undefined}
          />
        </div>
      </FieldGroup>
    </FieldSet>
  );
}
