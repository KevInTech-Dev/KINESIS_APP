import type { Ville } from "@/lib/types";

const CITY_CACHE_DURATION_MS = 5 * 60 * 1000;

let cachedCities: Ville[] | null = null;
let cacheExpiresAt = 0;
let pendingCitiesRequest: Promise<Ville[]> | null = null;

function isVille(value: unknown): value is Ville {
  return (
    typeof value === "object" &&
    value !== null &&
    "id_ville" in value &&
    typeof value.id_ville === "string" &&
    "nom" in value &&
    typeof value.nom === "string"
  );
}

export function getPublicCities(): Promise<Ville[]> {
  if (cachedCities && Date.now() < cacheExpiresAt) {
    return Promise.resolve(cachedCities);
  }
  if (pendingCitiesRequest) return pendingCitiesRequest;

  const request = fetch("/api/villes", { cache: "no-store" })
    .then(async (response) => {
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail =
          typeof payload === "object" &&
          payload !== null &&
          "detail" in payload &&
          typeof payload.detail === "string"
            ? payload.detail
            : "Les villes n’ont pas pu être chargées.";
        throw new Error(detail);
      }
      if (!Array.isArray(payload) || !payload.every(isVille)) {
        throw new Error("Le format des villes reçu de l’API est invalide.");
      }
      cachedCities = payload;
      cacheExpiresAt = Date.now() + CITY_CACHE_DURATION_MS;
      return payload;
    });

  pendingCitiesRequest = request;
  const clearPendingRequest = () => {
    if (pendingCitiesRequest === request) pendingCitiesRequest = null;
  };
  void request.then(clearPendingRequest, clearPendingRequest);
  return request;
}
