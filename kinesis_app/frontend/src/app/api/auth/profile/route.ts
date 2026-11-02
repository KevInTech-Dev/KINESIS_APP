import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { readAuthSession } from "@/lib/auth-session";
import { patchBackendResource } from "@/lib/auth-proxy";
import { isUserProfile } from "@/lib/user-profile";

export async function GET() {
  const auth = await readAuthSession();
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }

  const response = NextResponse.json(auth.session.profile, {
    headers: { "Cache-Control": "no-store" },
  });
  if (auth.session.rotated) {
    setAuthCookies(response, auth.session.access, auth.session.refresh);
  }
  return response;
}

export async function PATCH(request: Request) {
  const auth = await readAuthSession();
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }
  if (!isUserProfile(auth.session.profile) || auth.session.profile.role !== "VOYAGEUR") {
    return NextResponse.json(
      { detail: "La modification est réservée aux comptes voyageurs." },
      { status: 403 },
    );
  }

  let input: FormData;
  try {
    input = await request.formData();
  } catch {
    return NextResponse.json(
      { detail: "Les informations du profil sont invalides." },
      { status: 400 },
    );
  }

  const payload = new FormData();
  for (const field of ["nom", "prenoms", "telephone"] as const) {
    const value = input.get(field);
    if (typeof value === "string") payload.set(field, value.trim());
  }
  const photo = input.get("photo_profil");
  if (photo instanceof File && photo.size > 0) {
    payload.set("photo_profil", photo, photo.name);
  }
  if ([...payload.keys()].length === 0) {
    return NextResponse.json(
      { detail: "Aucune modification n’a été renseignée." },
      { status: 400 },
    );
  }

  const result = await patchBackendResource("auth/me/", payload, auth.session.access);
  const response = NextResponse.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
  if (auth.session.rotated) {
    setAuthCookies(response, auth.session.access, auth.session.refresh);
  }
  return response;
}
