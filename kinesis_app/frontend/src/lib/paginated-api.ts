import { getUserFacingApiError } from "@/lib/user-facing-errors";

export type PaginatedApiResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchPaginatedApiResponse<T>(
  url: string,
  isItem: (value: unknown) => value is T,
  fallbackMessage: string,
): Promise<PaginatedApiResponse<T>> {
  const response = await fetch(url, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      getUserFacingApiError(payload, fallbackMessage, response.status),
    );
  }
  if (!isRecord(payload)) {
    throw new Error(
      "Les voyages reçus sont incomplets. Réessayez dans quelques instants.",
    );
  }

  const { count, next, previous, results } = payload;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 0 ||
    (next !== null && typeof next !== "string") ||
    (previous !== null && typeof previous !== "string") ||
    !Array.isArray(results) ||
    !results.every(isItem)
  ) {
    throw new Error(
      "Les voyages reçus sont incomplets. Réessayez dans quelques instants.",
    );
  }

  return { ...payload, count, next, previous, results };
}
