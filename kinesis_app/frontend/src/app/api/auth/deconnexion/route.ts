import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  accessCookieName,
  clearAuthCookies,
  refreshCookieName,
} from "@/lib/auth-cookies";
import { postAuthToBackend } from "@/lib/auth-proxy";

export async function POST() {
  const cookieStore = await cookies();
  const access = cookieStore.get(accessCookieName)?.value;
  const refresh = cookieStore.get(refreshCookieName)?.value;
  let result:
    | Awaited<ReturnType<typeof postAuthToBackend>>
    | undefined;

  if (access && refresh) {
    result = await postAuthToBackend("logout/", { refresh }, access);
  }

  const response =
    result && (result.status < 200 || result.status >= 300)
      ? NextResponse.json(result.data, { status: result.status })
      : NextResponse.json({ detail: "Déconnexion réussie." });

  clearAuthCookies(response);
  return response;
}
