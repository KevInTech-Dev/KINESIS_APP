import type { NextResponse } from "next/server";

export const accessCookieName = "kinesis_access";
export const refreshCookieName = "kinesis_refresh";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function setAuthCookies(
  response: NextResponse,
  access: string,
  refresh: string,
) {
  response.cookies.set(accessCookieName, access, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24,
  });
  response.cookies.set(refreshCookieName, refresh, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 3,
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(accessCookieName, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(refreshCookieName, "", { ...cookieOptions, maxAge: 0 });
}
