import { NextResponse } from "next/server";
import { ForbiddenError } from "@/lib/rbac/can";
import { CsrfError } from "@/lib/auth/csrf";

export function apiErrorResponse(err: unknown): NextResponse {
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof CsrfError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthorizedError";
  }
}
