import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/auth-cookies";
import {
  getBackendResource,
  isTokenPair,
  postAuthToBackend,
} from "@/lib/auth-proxy";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return Response.json(
      { detail: "Le lien d’invitation est incomplet." },
      { status: 400 },
    );
  }
  const result = await getBackendResource(
    `compagnies/agent-activation/?${new URLSearchParams({ token })}`,
    "",
  );
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { detail: "Les informations d’activation sont invalides." },
      { status: 400 },
    );
  }

  if (
    !isRecord(body) ||
    typeof body.token !== "string" ||
    typeof body.new_password !== "string" ||
    typeof body.password_confirmation !== "string" ||
    !body.token ||
    !body.new_password ||
    !body.password_confirmation
  ) {
    return Response.json(
      { detail: "Renseignez le lien et les deux mots de passe." },
      { status: 400 },
    );
  }

  const result = await postAuthToBackend(
    "compagnies/agent-activation/",
    {
      token: body.token,
      new_password: body.new_password,
      password_confirmation: body.password_confirmation,
    },
    undefined,
    "",
  );
  if (result.status < 200 || result.status >= 300) {
    return Response.json(result.data, { status: result.status });
  }
  if (!isTokenPair(result.data)) {
    console.error("Agent activation response did not contain both auth tokens.");
    return Response.json(
      { detail: "La réponse d’activation du serveur est invalide." },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ detail: "Compte activé." });
  setAuthCookies(response, result.data.access, result.data.refresh);
  return response;
}
