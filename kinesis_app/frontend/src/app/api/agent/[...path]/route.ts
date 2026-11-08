import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { readAuthSession } from "@/lib/auth-session";
import { isUserProfile } from "@/lib/user-profile";

type RouteContext = { params: Promise<{ path: string[] }> };

function backendResource(path: string[], method: string): string | null {
  const resource = path.join("/");
  if (resource === "billets" && method === "GET") return "billets/";
  if (resource === "scan" && method === "POST") return "billets/scan/";
  if (resource === "embarquement" && method === "POST") {
    return "billets/embarquement/";
  }
  if (resource === "voyages" && method === "GET") {
    return "compagnies/agents/voyages/";
  }
  const departure = resource.match(/^voyages\/([0-9a-f-]{36})\/depart$/i);
  if (departure && method === "POST") {
    return `billets/voyages/${departure[1]}/depart/`;
  }
  if (resource === "reservations" && method === "GET") {
    return "reservations/";
  }
  if (resource === "bagages" && ["GET", "POST"].includes(method)) {
    return "bagages/";
  }
  const baggageAction = resource.match(
    /^bagages\/([0-9a-f-]{36})\/(paiement-frais|restitution)$/i,
  );
  if (baggageAction && method === "POST") {
    return `bagages/${baggageAction[1]}/${baggageAction[2]}/`;
  }
  const baggage = resource.match(/^bagages\/([0-9a-f-]{36})$/i);
  if (baggage && method === "GET") return `bagages/${baggage[1]}/`;
  if (resource === "notifications" && method === "GET") {
    return "notifications/";
  }
  if (resource === "notifications/lire-tout" && method === "POST") {
    return "notifications/lire-tout/";
  }
  const notificationRead = resource.match(
    /^notifications\/([0-9a-f-]{36})\/lire$/i,
  );
  if (notificationRead && method === "POST") {
    return `notifications/${notificationRead[1]}/lire/`;
  }
  return null;
}

async function proxyAgentRequest(request: Request, context: RouteContext) {
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
  if (auth.session.profile.role !== "AGENT_COMPAGNIE") {
    return NextResponse.json(
      { detail: "Cette opération est réservée aux agents de compagnie." },
      { status: 403 },
    );
  }
  if (auth.session.profile.must_change_password) {
    return NextResponse.json(
      { detail: "Changez votre mot de passe provisoire pour continuer." },
      { status: 403 },
    );
  }

  const { path } = await context.params;
  const method = request.method.toUpperCase();
  const resource = backendResource(path, method);
  if (!resource) {
    return NextResponse.json(
      { detail: "Cette opération n’est pas disponible." },
      { status: 405 },
    );
  }

  const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
  let url: URL;
  try {
    url = new URL(
      `/api/v1/${resource}`,
      `${backendUrl.replace(/\/+$/, "")}/`,
    );
    url.search = new URL(request.url).search;
  } catch (error) {
    console.error("BACKEND_API_URL is not a valid URL", error);
    return NextResponse.json(
      { detail: "L’adresse du serveur Django est mal configurée." },
      { status: 500 },
    );
  }

  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${auth.session.access}`,
  });
  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      try {
        body = await request.formData();
      } catch {
        return NextResponse.json(
          { detail: "Le formulaire transmis est invalide." },
          { status: 400 },
        );
      }
    } else {
      body = await request.text();
      if (contentType) headers.set("Content-Type", contentType);
    }
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error(`Agent API request failed for ${url.pathname}`, error);
    return NextResponse.json(
      {
        detail:
          "Impossible de joindre le service pour le moment. Vérifiez votre connexion et réessayez dans quelques instants.",
      },
      { status: 502 },
    );
  }

  const responseText = await backendResponse.text();
  let data: unknown = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText) as unknown;
    } catch (error) {
      console.error(`Agent API response was not valid JSON for ${url.pathname}`, error);
      data = {
        detail:
          "Une erreur est survenue pendant le traitement. Réessayez dans quelques instants.",
      };
      if (backendResponse.ok) {
        backendResponse = new Response(null, { status: 502 });
      }
    }
  }
  const response =
    backendResponse.status === 204
      ? new NextResponse(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        })
      : NextResponse.json(data, {
          status: backendResponse.status,
          headers: { "Cache-Control": "no-store" },
        });
  if (auth.session.rotated) {
    setAuthCookies(response, auth.session.access, auth.session.refresh);
  }
  return response;
}

export async function GET(request: Request, context: RouteContext) {
  return proxyAgentRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyAgentRequest(request, context);
}
