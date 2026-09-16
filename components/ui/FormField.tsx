import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function FormField({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  autoComplete,
  placeholder,
  error,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
  /** Fires alongside the field's own uncontrolled state — for a parent that needs to mirror the
   * live value (e.g. a totals preview) without turning this into a controlled input. */
  onChange?: (value: string) => void;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}
