import { forwardBackendGet } from "@/lib/backend-api";

const searchFields = [
  "ville_depart",
  "ville_arrivee",
  "date_depart",
  "date_depart_apres",
  "date_depart_avant",
  "compagnie",
  "prix_min",
  "prix_max",
  "places_min",
  "ordering",
] as const;

export function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const filters = new URLSearchParams();

  for (const field of searchFields) {
    const value = input.get(field);
    if (value) {
      filters.set(field, value);
    }
  }

  if (
    filters.has("ville_depart") &&
    filters.has("ville_arrivee") &&
    filters.get("ville_depart") === filters.get("ville_arrivee")
  ) {
    return Response.json(
      { detail: "Les villes de départ et d’arrivée doivent être différentes." },
      { status: 400 },
    );
  }

  for (const field of ["date_depart", "date_depart_apres", "date_depart_avant"]) {
    const date = filters.get(field);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json(
        { detail: "La date de départ doit être au format AAAA-MM-JJ." },
        { status: 400 },
      );
    }
  }

  return forwardBackendGet("voyages/", filters.size ? filters : undefined);
}
