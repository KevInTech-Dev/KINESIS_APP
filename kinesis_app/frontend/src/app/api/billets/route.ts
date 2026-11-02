import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { readAuthSession } from "@/lib/auth-session";
import { getBackendResource } from "@/lib/auth-proxy";
import { isUserProfile } from "@/lib/user-profile";

export async function GET() {
  const auth = await readAuthSession();
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }
  if (!isUserProfile(auth.session.profile) || auth.session.profile.role !== "VOYAGEUR") {
    return NextResponse.json(
      { detail: "Les billets sont réservés aux comptes voyageurs." },
      { status: 403 },
    );
  }

  const result = await getBackendResource("billets/?page_size=100", auth.session.access);
  const response = NextResponse.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
  if (auth.session.rotated) {
    setAuthCookies(response, auth.session.access, auth.session.refresh);
  }
  return response;
}
