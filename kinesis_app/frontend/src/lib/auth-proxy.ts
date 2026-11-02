type AuthResponse = {
  status: number;
  data: unknown;
};

export async function postAuthToBackend(
  resource: string,
  payload: Record<string, string>,
  accessToken?: string,
): Promise<AuthResponse> {
  const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
  let url: URL;

  try {
    url = new URL(
      `/api/v1/auth/${resource.replace(/^\/+/, "")}`,
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
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
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
