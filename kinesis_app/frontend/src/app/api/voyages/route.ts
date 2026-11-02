import { forwardBackendGet } from "@/lib/backend-api";

const searchFields = ["ville_depart", "ville_arrivee", "date_depart"] as const;

export function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const filters = new URLSearchParams();

  for (const field of searchFields) {
    const value = input.get(field);
    if (value) {
      filters.set(field, value);
    }
  }

  if (filters.size > 0) {
    if (searchFields.some((field) => !filters.has(field))) {
      return Response.json(
        { detail: "Le départ, l’arrivée et la date sont obligatoires." },
        { status: 400 },
      );
    }

    if (filters.get("ville_depart") === filters.get("ville_arrivee")) {
      return Response.json(
        { detail: "Les villes de départ et d’arrivée doivent être différentes." },
        { status: 400 },
      );
    }

    const date = filters.get("date_depart") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json(
        { detail: "La date de départ doit être au format AAAA-MM-JJ." },
        { status: 400 },
      );
    }
  }

  return forwardBackendGet("voyages/", filters);
}
