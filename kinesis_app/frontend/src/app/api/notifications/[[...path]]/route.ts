import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { getBackendResource, postBackendResource } from "@/lib/auth-proxy";
import { readAuthSession } from "@/lib/auth-session";
import { isUserProfile } from "@/lib/user-profile";

type RouteContext = { params: Promise<{ path?: string[] }> };

function backendResource(path: string[], method: string) {
  const resource = path.join("/");
  if (resource === "" && method === "GET") return "notifications/";
  if (resource === "lire-tout" && method === "POST") {
    return "notifications/lire-tout/";
  }
  const read = resource.match(/^([0-9a-f-]{36})\/lire$/i);
  if (read && method === "POST") {
    return `notifications/${read[1]}/lire/`;
  }
  return null;
}

async function proxyNotificationRequest(request: Request, context: RouteContext) {
  const auth = await readAuthSession();
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }
  if (!isUserProfile(auth.session.profile) || auth.session.profile.role !== "VOYAGEUR") {
    return NextResponse.json(
      { detail: "Les notifications sont réservées aux comptes voyageurs." },
      { status: 403 },
    );
  }

  const { path = [] } = await context.params;
  const method = request.method.toUpperCase();
  const resource = backendResource(path, method);
  if (!resource) {
    return NextResponse.json(
      { detail: "Cette opération n’est pas disponible." },
      { status: 405 },
    );
  }
  const query = new URL(request.url).search;
  const result =
    method === "GET"
      ? await getBackendResource(`${resource}${query}`, auth.session.access)
      : await postBackendResource(resource, {}, auth.session.access);
  const response = NextResponse.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
  if (auth.session.rotated) {
    setAuthCookies(response, auth.session.access, auth.session.refresh);
  }
  return response;
}

export async function GET(request: Request, context: RouteContext) {
  return proxyNotificationRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyNotificationRequest(request, context);
}
