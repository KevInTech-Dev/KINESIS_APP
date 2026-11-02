type AuthResponse = {
  status: number;
  data: unknown;
};

async function requestAuthBackend(
  resource: string,
  method: "GET" | "POST" | "PATCH",
  payload?: Record<string, unknown>,
  accessToken?: string,
  apiPrefix = "auth/",
  rawBody?: BodyInit,
): Promise<AuthResponse> {
  const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
  let url: URL;

  try {
    url = new URL(
      `/api/v1/${apiPrefix}${resource.replace(/^\/+/, "")}`,
      `${backendUrl.replace(/\/+$/, "")}/`,
    );
  } catch (error) {
    console.error("BACKEND_API_URL is not a valid URL", error);
    return {
      status: 500,
      data: { detail: "L’adresse du serveur Django est mal configurée." },
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(payload || typeof rawBody === "string"
          ? { "Content-Type": "application/json" }
          : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(payload
        ? { body: JSON.stringify(payload) }
        : rawBody
          ? { body: rawBody }
          : {}),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error(`Backend auth request failed for ${url.pathname}`, error);
    return {
      status: 502,
      data: {
        detail: "L’API est temporairement indisponible. Réessayez plus tard.",
      },
    };
  }

  const responseText = await response.text();
  if (!responseText) {
    return { status: response.status, data: null };
  }

  try {
    return { status: response.status, data: JSON.parse(responseText) as unknown };
  } catch (error) {
    console.error(`Backend auth response was not valid JSON for ${url.pathname}`, error);
    return {
      status: 502,
      data: { detail: "La réponse du serveur d’authentification est illisible." },
    };
  }
}

export function getAuthFromBackend(
  resource: string,
  accessToken: string,
) {
  return requestAuthBackend(resource, "GET", undefined, accessToken);
}

export function getBackendResource(
  resource: string,
  accessToken: string,
) {
  return requestAuthBackend(resource, "GET", undefined, accessToken, "");
}

export function postBackendResource(
  resource: string,
  payload: Record<string, unknown>,
  accessToken: string,
) {
  return requestAuthBackend(
    resource,
    "POST",
    payload,
    accessToken,
    "",
  );
}

export function patchBackendResource(
  resource: string,
  body: FormData,
  accessToken: string,
) {
  return requestAuthBackend(
    resource,
    "PATCH",
    undefined,
    accessToken,
    "",
    body,
  );
}

export function postAuthToBackend(
  resource: string,
  payload: Record<string, string>,
  accessToken?: string,
) {
  return requestAuthBackend(resource, "POST", payload, accessToken);
}

export function isTokenPair(
  value: unknown,
): value is { access: string; refresh: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "access" in value &&
    typeof value.access === "string" &&
    "refresh" in value &&
    typeof value.refresh === "string"
  );
}
