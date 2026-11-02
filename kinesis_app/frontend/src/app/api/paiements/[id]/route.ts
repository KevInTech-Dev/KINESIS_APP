import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { readAuthSession } from "@/lib/auth-session";
import { getBackendResource } from "@/lib/auth-proxy";
import { isUserProfile } from "@/lib/user-profile";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await readAuthSession();
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }
  if (!isUserProfile(auth.session.profile) || auth.session.profile.role !== "VOYAGEUR") {
    return NextResponse.json(
      { detail: "Le paiement est réservé aux comptes voyageurs." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json(
      { detail: "Identifiant de paiement invalide." },
      { status: 400 },
    );
  }

  const result = await getBackendResource(
    `paiements/${encodeURIComponent(id)}/`,
    auth.session.access,
  );
  const response = NextResponse.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
  if (auth.session.rotated) {
    setAuthCookies(response, auth.session.access, auth.session.refresh);
  }
  return response;
}
