export async function forwardBackendGet(
  resource: string,
  query?: URLSearchParams,
) {
  const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
  let url: URL;

  try {
    url = new URL(
      `/api/v1/${resource.replace(/^\/+/, "")}`,
      `${backendUrl.replace(/\/+$/, "")}/`,
    );
  } catch (error) {
    console.error("BACKEND_API_URL is not a valid URL", error);
    return Response.json(
      { detail: "L’adresse du serveur Django est mal configurée." },
      { status: 500 },
    );
  }

  if (query) {
    url.search = query.toString();
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`Backend request failed for ${url.pathname}`, error);
    return Response.json(
      {
        detail:
          "Impossible de joindre le service pour le moment. Vérifiez votre connexion et réessayez dans quelques instants.",
      },
      { status: 502 },
    );
  }
}
