import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { readAuthSession } from "@/lib/auth-session";
import { postAuthToBackend } from "@/lib/auth-proxy";
import { isUserProfile } from "@/lib/user-profile";

export async function POST(request: Request) {
  const auth = await readAuthSession();
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }
  if (
    !isUserProfile(auth.session.profile) ||
    auth.session.profile.role !== "AGENT_COMPAGNIE"
  ) {
    return NextResponse.json(
      { detail: "Cette opération est réservée aux agents de compagnie." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Les informations du mot de passe sont invalides." },
      { status: 400 },
    );
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("old_password" in body) ||
    typeof body.old_password !== "string" ||
    !body.old_password ||
    !("new_password" in body) ||
    typeof body.new_password !== "string" ||
    !body.new_password ||
    !("password_confirmation" in body) ||
    typeof body.password_confirmation !== "string" ||
    !body.password_confirmation
  ) {
    return NextResponse.json(
      { detail: "Saisissez le mot de passe provisoire et confirmez le nouveau." },
      { status: 400 },
    );
  }

  const result = await postAuthToBackend(
    "change-password/",
    {
      old_password: body.old_password,
      new_password: body.new_password,
      password_confirmation: body.password_confirmation,
    },
    auth.session.access,
  );
  const response =
    result.status === 204
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(result.data, {
          status: result.status,
          headers: { "Cache-Control": "no-store" },
        });
  if (auth.session.rotated) {
    setAuthCookies(response, auth.session.access, auth.session.refresh);
  }
  return response;
}
