import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/context";
import { listSessionsForUser, revokeSessionForUser } from "@/lib/auth/session";
import { requireCsrf } from "@/lib/auth/csrf";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const sessions = await listSessionsForUser(String(user._id));
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: String(s._id),
        userAgent: s.userAgent,
        ip: s.ip,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireCsrf(request);
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const { sessionId } = await request.json();
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    await revokeSessionForUser(sessionId, String(user._id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
