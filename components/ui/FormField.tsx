export function FormField({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  autoComplete,
  placeholder,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
      />
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
