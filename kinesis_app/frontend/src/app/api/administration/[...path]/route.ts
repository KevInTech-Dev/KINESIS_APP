import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { readAuthSession } from "@/lib/auth-session";
import { isUserProfile } from "@/lib/user-profile";

type RouteContext = { params: Promise<{ path: string[] }> };

function backendResource(path: string[], method: string): string | null {
  if (
    path.length === 2 &&
    path[0] === "comptes" &&
    path[1] === "summary" &&
    method === "GET"
  ) {
    return "auth/users/summary/";
  }
  if (path.length === 1 && path[0] === "comptes" && method === "GET") {
    return "auth/users/";
  }
  if (path.length === 1 && path[0] === "compagnies" && method === "GET") {
    return "compagnies/admin/companies/";
  }
  if (
    path.length === 3 &&
    path[0] === "compagnies" &&
    /^[0-9a-f-]{36}$/i.test(path[1]) &&
    ["approve", "refuse", "deactivate"].includes(path[2]) &&
    method === "POST"
  ) {
    return `compagnies/admin/companies/${path[1]}/${path[2]}/`;
  }
  return null;
}

async function proxyAdministrationRequest(
  request: Request,
  context: RouteContext,
) {
  const auth = await readAuthSession();
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }
  if (
    !isUserProfile(auth.session.profile) ||
    auth.session.profile.role !== "ADMINISTRATEUR"
  ) {
    return NextResponse.json(
      { detail: "Cette opération est réservée à l’administration KINESIS." },
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

  let backendResponse: Response;
  try {
    backendResponse = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${auth.session.access}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error(`Administration API request failed for ${url.pathname}`, error);
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
      console.error(
        `Administration API response was not valid JSON for ${url.pathname}`,
        error,
      );
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
  return proxyAdministrationRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyAdministrationRequest(request, context);
}
