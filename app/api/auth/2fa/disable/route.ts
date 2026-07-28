import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/context";
import { requireCsrf } from "@/lib/auth/csrf";
import { disableTotp } from "@/lib/db/queries/users";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    await disableTotp(String(user._id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
