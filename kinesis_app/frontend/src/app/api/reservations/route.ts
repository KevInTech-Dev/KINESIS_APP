import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { readAuthSession } from "@/lib/auth-session";
import { getBackendResource, postBackendResource } from "@/lib/auth-proxy";
import { isUserProfile } from "@/lib/user-profile";

export async function GET() {
  const auth = await readAuthSession();
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }
  if (!isUserProfile(auth.session.profile)) {
    return NextResponse.json(
      { detail: "Le profil reçu du serveur est invalide." },
      { status: 502 },
    );
  }
  if (auth.session.profile.role !== "VOYAGEUR") {
    return NextResponse.json(
      { detail: "Cet espace est réservé aux comptes voyageurs." },
      { status: 403 },
    );
  }

  const result = await getBackendResource(
    "reservations/?page_size=100",
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

export async function POST(request: Request) {
  const auth = await readAuthSession();
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }
  if (!isUserProfile(auth.session.profile) || auth.session.profile.role !== "VOYAGEUR") {
    return NextResponse.json(
      { detail: "La réservation est réservée aux comptes voyageurs." },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Les informations de réservation sont invalides." },
      { status: 400 },
    );
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("voyage_id" in payload) ||
    typeof payload.voyage_id !== "string" ||
    !("passagers" in payload) ||
    !Array.isArray(payload.passagers) ||
    !payload.passagers.every((name) => typeof name === "string")
  ) {
    return NextResponse.json(
      { detail: "Indiquez le voyage et le nom de chaque passager." },
      { status: 400 },
    );
  }

  const result = await postBackendResource(
    "reservations/",
    { voyage_id: payload.voyage_id, passagers: payload.passagers },
    auth.session.access,
  );
  const response = NextResponse.json(result.data, { status: result.status });
  if (auth.session.rotated) {
    setAuthCookies(response, auth.session.access, auth.session.refresh);
  }
  return response;
}
