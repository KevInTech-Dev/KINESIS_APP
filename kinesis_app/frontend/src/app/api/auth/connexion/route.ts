import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/auth-cookies";
import { isTokenPair, postAuthToBackend } from "@/lib/auth-proxy";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { detail: "Les informations de connexion sont invalides." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("email" in body) ||
    typeof body.email !== "string" ||
    !("password" in body) ||
    typeof body.password !== "string" ||
    !body.email.trim() ||
    !body.password
  ) {
    return Response.json(
      { detail: "Saisissez votre adresse e-mail et votre mot de passe." },
      { status: 400 },
    );
  }

  const result = await postAuthToBackend("token/", {
    email: body.email.trim(),
    password: body.password,
  });

  if (result.status < 200 || result.status >= 300) {
    return Response.json(result.data, { status: result.status });
  }

  if (!isTokenPair(result.data)) {
    console.error("Backend auth token response did not contain both tokens.");
    return Response.json(
      { detail: "La réponse de connexion du serveur est invalide." },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ detail: "Connexion réussie." });
  setAuthCookies(response, result.data.access, result.data.refresh);
  return response;
}
