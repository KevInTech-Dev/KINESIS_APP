import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import {
  readAuthTokens,
  refreshAuthTokens,
} from "@/lib/auth-session";

type RouteContext = { params: Promise<{ path: string[] }> };
type ProxyAuth = {
  access: string;
  refresh: string;
  rotated: boolean;
};
type BackendRequestResult =
  | { response: Response }
  | { authError: { status: number; data: unknown } };

function authErrorResponse(error: { status: number; data: unknown }) {
  const response = NextResponse.json(error.data, { status: error.status });
  if (error.status === 401) clearAuthCookies(response);
  return response;
}

function finalizeAuthResponse(response: NextResponse, auth: ProxyAuth) {
  if (auth.rotated) {
    if (response.status === 401) {
      clearAuthCookies(response);
    } else {
      setAuthCookies(response, auth.access, auth.refresh);
    }
  }
  return response;
}

async function fetchWithAuth(
  url: URL,
  init: RequestInit,
  auth: ProxyAuth,
): Promise<BackendRequestResult> {
  const makeRequest = () => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${auth.access}`);
    return fetch(url, { ...init, headers });
  };

  const response = await makeRequest();
  if (response.status !== 401) return { response };

  const refreshed = await refreshAuthTokens(auth.refresh);
  if ("status" in refreshed) return { authError: refreshed };

  auth.access = refreshed.tokens.access;
  auth.refresh = refreshed.tokens.refresh;
  auth.rotated = true;
  return { response: await makeRequest() };
}

function isAllowedResource(path: string[], method: string) {
  const resource = path.join("/");
  if (resource === "tableau-de-bord") return method === "GET";
  if (resource === "me") return ["GET", "PATCH", "PUT"].includes(method);
  if (resource === "agents") return ["GET", "POST"].includes(method);
  if (/^agents\/[0-9a-f-]{36}$/i.test(resource)) {
    return ["GET", "PATCH", "PUT", "DELETE"].includes(method);
  }
  if (/^agents\/[0-9a-f-]{36}\/resend-invitation$/i.test(resource)) {
    return method === "POST";
  }
  if (resource === "voyages") return ["GET", "POST"].includes(method);
  if (/^voyages\/[0-9a-f-]{36}$/i.test(resource)) {
    return ["GET", "PATCH", "PUT", "DELETE"].includes(method);
  }
  if (resource === "stations") return ["GET", "POST"].includes(method);
  if (/^stations\/[0-9a-f-]{36}$/i.test(resource)) {
    return ["GET", "PATCH", "DELETE"].includes(method);
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
  // Django validates the token and endpoint permissions on the actual request.
  const tokenResult = await readAuthTokens();
  if ("status" in tokenResult) {
    return authErrorResponse(tokenResult);
  }
  const auth: ProxyAuth = { ...tokenResult.tokens, rotated: false };

  const { path } = await context.params;
  const method = request.method.toUpperCase();
  if (!isAllowedResource(path, method)) {
    return NextResponse.json(
      { detail: "Cette opération n’est pas disponible." },
      { status: 405 },
    );
  }

  const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
  let backendBaseUrl: URL;
  try {
    backendBaseUrl = new URL(`${backendUrl.replace(/\/+$/, "")}/`);
  } catch (error) {
    console.error("BACKEND_API_URL is not a valid URL", error);
    return NextResponse.json(
      { detail: "L’adresse du serveur Django est mal configurée." },
      { status: 500 },
    );
  }

  if (path.length === 1 && path[0] === "tableau-de-bord") {
    const resources = {
      trips: "voyages",
      agents: "compagnies/agents",
      reservations: "reservations",
      payments: "paiements",
    } as const;
    const fetchDashboardResources = async () =>
      Promise.all(
        Object.entries(resources).map(async ([key, resource]) => {
          const url = new URL(
            `/api/v1/${resource}/`,
            backendBaseUrl,
          );
          url.searchParams.set("page_size", "100");
          const response = await fetch(url, {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${auth.access}`,
            },
            cache: "no-store",
            signal: AbortSignal.timeout(20_000),
          });
          const responseText = await response.text();
          let data: unknown = null;
          if (responseText) {
            try {
              data = JSON.parse(responseText) as unknown;
            } catch (error) {
              console.error(`Company dashboard response was not valid JSON for ${url.pathname}`, error);
              return {
                key,
                status: 502,
                data: {
                  detail:
                    "Une erreur est survenue pendant le chargement. Réessayez dans quelques instants.",
                },
              };
            }
          }
          return { key, status: response.status, data };
        }),
      );

    try {
      let results = await fetchDashboardResources();
      if (results.some((result) => result.status === 401)) {
        const refreshed = await refreshAuthTokens(auth.refresh);
        if ("status" in refreshed) return authErrorResponse(refreshed);
        auth.access = refreshed.tokens.access;
        auth.refresh = refreshed.tokens.refresh;
        auth.rotated = true;
        results = await fetchDashboardResources();
      }

      const failure = results.find(
        (result) => result.status < 200 || result.status >= 300,
      );
      const response = failure
        ? NextResponse.json(failure.data, {
            status: failure.status,
            headers: { "Cache-Control": "no-store" },
          })
        : NextResponse.json(
            Object.fromEntries(results.map(({ key, data }) => [key, data])),
            { headers: { "Cache-Control": "no-store" } },
          );
      return finalizeAuthResponse(response, auth);
    } catch (error) {
      console.error("Company dashboard request failed", error);
      return finalizeAuthResponse(NextResponse.json(
        {
          detail:
            "Impossible de joindre le service pour le moment. Vérifiez votre connexion et réessayez dans quelques instants.",
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      ), auth);
    }
  }

  const resource =
    path[0] === "me" || path[0] === "agents" || path[0] === "stations"
      ? `compagnies/${path.join("/")}`
      : path.join("/");
  let url: URL;
  try {
    url = new URL(
      `/api/v1/${resource}/`,
      backendBaseUrl,
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
    const result = await fetchWithAuth(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    }, auth);
    if ("authError" in result) return authErrorResponse(result.authError);
    backendResponse = result.response;
  } catch (error) {
    console.error(`Company API request failed for ${url.pathname}`, error);
    return finalizeAuthResponse(NextResponse.json(
      {
        detail:
          "Impossible de joindre le service pour le moment. Vérifiez votre connexion et réessayez dans quelques instants.",
      },
      { status: 502 },
    ), auth);
  }

  const responseText = await backendResponse.text();
  let data: unknown = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText) as unknown;
    } catch (error) {
      const contentType = backendResponse.headers.get("content-type");
      console.error("Company API returned a non-JSON response", {
        path: url.pathname,
        status: backendResponse.status,
        contentType,
        error,
      });
      data = {
        detail:
          "Une erreur est survenue pendant l’enregistrement. Vérifiez les informations puis réessayez. Si le problème persiste, contactez le support.",
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
  return finalizeAuthResponse(response, auth);
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
