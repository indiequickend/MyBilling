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
  name: string;
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
      <input type="hidden" name={name} value={value === NONE ? "" : value} required={required} />
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
