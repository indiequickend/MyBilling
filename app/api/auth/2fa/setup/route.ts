import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/context";
import { requireCsrf } from "@/lib/auth/csrf";
import { setPendingTotpSecret } from "@/lib/db/queries/users";
import { generateTotpSecret, buildProvisioningUri, generateQrCodeDataUrl } from "@/lib/auth/totp";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const secret = generateTotpSecret();
    await setPendingTotpSecret(String(user._id), secret);
    const uri = buildProvisioningUri(secret, user.email);
    const qrDataUrl = await generateQrCodeDataUrl(uri);

    return NextResponse.json({ qrDataUrl });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
