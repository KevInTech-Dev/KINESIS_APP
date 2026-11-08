import type { Ville } from "@/lib/types";
import {
  getUserFacingApiError,
  getUserFacingErrorMessage,
} from "@/lib/user-facing-errors";

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
        throw new Error(
          getUserFacingApiError(
            payload,
            "Les villes n’ont pas pu être chargées.",
            response.status,
          ),
        );
      }
      if (!Array.isArray(payload) || !payload.every(isVille)) {
        throw new Error(
          "Les villes reçues sont incomplètes. Réessayez dans quelques instants.",
        );
      }
      cachedCities = payload;
      cacheExpiresAt = Date.now() + CITY_CACHE_DURATION_MS;
      return payload;
    })
    .catch((error: unknown) => {
      throw new Error(
        getUserFacingErrorMessage(
          error,
          "Les villes n’ont pas pu être chargées. Réessayez dans quelques instants.",
        ),
      );
    });

  pendingCitiesRequest = request;
  const clearPendingRequest = () => {
    if (pendingCitiesRequest === request) pendingCitiesRequest = null;
  };
  void request.then(clearPendingRequest, clearPendingRequest);
  return request;
}
