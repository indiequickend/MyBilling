"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Radix Select disallows an empty-string item value (reserved for "no selection"), so an
 * empty-value option (e.g. "None") is represented internally by this sentinel and mapped back
 * to "" for the hidden form input that actually submits with the surrounding <form>. */
const NONE = "__none__";

export function SelectField({
  name,
  defaultValue = "",
  placeholder,
  options,
  required,
  className,
  onValueChange,
}: {
  /** Omit when the caller renders its own parent-state-controlled hidden input instead (see
   * StockMovementForm) — React's automatic form reset after a non-redirecting form action clears
   * this component's own internal state (and thus this hidden input) on every failed submission,
   * which silently drops the value for any field the caller can't afford to lose. Lifting the
   * value to parent state via onValueChange and rendering the hidden input there sidesteps it,
   * the same way productId/variantId already survive in that form. */
  name?: string;
  defaultValue?: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue || NONE);

  return (
    <>
      {name ? (
        <input type="hidden" name={name} value={value === NONE ? "" : value} required={required} />
      ) : null}
      <Select
        value={value}
        onValueChange={(v) => {
          setValue(v);
          onValueChange?.(v === NONE ? "" : v);
        }}
      >
        <SelectTrigger className={cn("w-full", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((o) => (
              <SelectItem key={o.value || NONE} value={o.value || NONE}>
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}
