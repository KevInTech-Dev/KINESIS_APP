import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { readAuthSession } from "@/lib/auth-session";
import { isUserProfile } from "@/lib/user-profile";

type RouteContext = { params: Promise<{ path: string[] }> };

function isAllowedResource(path: string[], method: string) {
  const resource = path.join("/");
  if (resource === "me") return ["GET", "PATCH", "PUT"].includes(method);
  if (resource === "agents") return ["GET", "POST"].includes(method);
  if (/^agents\/[0-9a-f-]{36}$/i.test(resource)) {
    return ["GET", "PATCH", "PUT", "DELETE"].includes(method);
  }
  if (resource === "voyages") return ["GET", "POST"].includes(method);
  if (/^voyages\/[0-9a-f-]{36}$/i.test(resource)) {
    return ["GET", "PATCH", "PUT"].includes(method);
  }
  if (resource === "paiements" && method === "GET") return true;
  if (resource === "reservations" && method === "GET") return true;
  if (resource === "notifications" && method === "GET") return true;
  if (resource === "notifications/lire-tout" && method === "POST") return true;
  if (/^notifications\/[0-9a-f-]{36}\/lire$/i.test(resource)) {
    return method === "POST";
  }
  if (resource === "bagages/tarifs") return ["GET", "POST"].includes(method);
  if (/^bagages\/tarifs\/[0-9a-f-]{36}$/i.test(resource)) {
    return ["GET", "PATCH", "PUT", "DELETE"].includes(method);
  }
  return false;
}

async function proxyCompanyRequest(request: Request, context: RouteContext) {
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
  if (auth.session.profile.role !== "COMPAGNIE") {
    return NextResponse.json(
      { detail: "Cet espace est réservé aux comptes compagnie." },
      { status: 403 },
    );
  }

  const { path } = await context.params;
  const method = request.method.toUpperCase();
  if (!isAllowedResource(path, method)) {
    return NextResponse.json(
      { detail: "Cette opération n’est pas disponible." },
      { status: 405 },
    );
  }

  const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
  const resource =
    path[0] === "me" || path[0] === "agents"
      ? `compagnies/${path.join("/")}`
      : path.join("/");
  let url: URL;
  try {
    url = new URL(
      `/api/v1/${resource}/`,
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

  let body: BodyInit | undefined;
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${auth.session.access}`,
  });
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
    console.error(`Company API request failed for ${url.pathname}`, error);
    return NextResponse.json(
      { detail: "L’API est temporairement indisponible. Réessayez plus tard." },
      { status: 502 },
    );
  }

  const responseText = await backendResponse.text();
  let data: unknown = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText) as unknown;
    } catch (error) {
      console.error(`Company API response was not valid JSON for ${url.pathname}`, error);
      data = { detail: "La réponse du serveur est illisible." };
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
  return proxyCompanyRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyCompanyRequest(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxyCompanyRequest(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return proxyCompanyRequest(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxyCompanyRequest(request, context);
}
