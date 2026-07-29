"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingText,
  variant,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      variant={variant}
      className={cn("w-full", className)}
    >
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      {pending ? (pendingText ?? "Please wait…") : children}
    </Button>
  );
}
