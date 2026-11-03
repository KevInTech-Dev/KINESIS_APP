import { forwardBackendGet } from "@/lib/backend-api";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return Response.json(
      { detail: "Le lien d’activation est incomplet." },
      { status: 400 },
    );
  }

  return forwardBackendGet(
    "compagnies/activate/",
    new URLSearchParams({ token }),
  );
}
