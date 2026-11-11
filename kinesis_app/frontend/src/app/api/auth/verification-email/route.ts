import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/auth-cookies";
import { isTokenPair, postAuthToBackend } from "@/lib/auth-proxy";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { detail: "Les informations de vérification sont invalides." },
      { status: 400 },
    );
  }

  if (
    !isRecord(body) ||
    typeof body.email !== "string" ||
    typeof body.code !== "string" ||
    !body.email.trim() ||
    !/^\d{6}$/.test(body.code)
  ) {
    return Response.json(
      { detail: "Saisissez votre adresse e-mail et le code à 6 chiffres." },
      { status: 400 },
    );
  }

  const result = await postAuthToBackend("email-verification/confirm/", {
    email: body.email.trim(),
    code: body.code,
  });
  if (result.status < 200 || result.status >= 300) {
    return Response.json(result.data, { status: result.status });
  }
  if (!isTokenPair(result.data)) {
    if (isRecord(result.data) && typeof result.data.detail === "string") {
      return NextResponse.json(result.data);
    }
    console.error("Email verification response did not contain both auth tokens.");
    return Response.json(
      { detail: "La réponse de vérification du serveur est invalide." },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ detail: "Adresse e-mail vérifiée." });
  setAuthCookies(response, result.data.access, result.data.refresh);
  return response;
}
