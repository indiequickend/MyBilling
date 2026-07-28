import { cookies } from "next/headers";

const COOKIE_NAME = "active_business_id";

export async function getActiveBusinessIdCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

/** Only callable from a Server Action / Route Handler, not during page render. */
export async function setActiveBusinessIdCookie(businessId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, businessId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}
