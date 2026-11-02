import { forwardBackendGet } from "@/lib/backend-api";

export function GET(request: Request) {
  if (new URL(request.url).search) {
    return Response.json(
      { detail: "Cette ressource n’accepte pas de paramètre de recherche." },
      { status: 400 },
    );
  }

  return forwardBackendGet("villes/");
}
