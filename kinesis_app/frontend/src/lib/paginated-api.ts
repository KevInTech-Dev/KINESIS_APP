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
    const detail =
      isRecord(payload) && typeof payload.detail === "string"
        ? payload.detail
        : fallbackMessage;
    throw new Error(detail);
  }
  if (!isRecord(payload)) {
    throw new Error("Le format de la réponse paginée est invalide.");
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
    throw new Error("Le format de la réponse paginée est invalide.");
  }

  return { ...payload, count, next, previous, results };
}
