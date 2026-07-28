import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/context";
import { requireCsrf } from "@/lib/auth/csrf";
import { totpChallengeSchema } from "@/lib/validation/auth";
import { findUserByIdWithSecrets, enableTotp } from "@/lib/db/queries/users";
import { verifyTotpCode, generateBackupCodes, hashBackupCodes } from "@/lib/auth/totp";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const body = await request.json();
    const parsed = totpChallengeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    }

    const fresh = await findUserByIdWithSecrets(String(user._id));
    if (!fresh?.totpSecret) {
      return NextResponse.json({ error: "Enrollment expired — start again." }, { status: 400 });
    }

    const ok = await verifyTotpCode(fresh.totpSecret, parsed.data.code);
    if (!ok) {
      return NextResponse.json({ error: "Incorrect code." }, { status: 400 });
    }

    const backupCodes = generateBackupCodes();
    const hashes = await hashBackupCodes(backupCodes);
    await enableTotp(String(user._id), fresh.totpSecret, hashes);

    return NextResponse.json({ backupCodes });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
