const SERVICE_UNAVAILABLE_MESSAGE =
  "Le service est momentanément indisponible. Vérifiez votre connexion et réessayez dans quelques instants.";
const SERVER_ERROR_MESSAGE =
  "Une erreur temporaire empêche le traitement de votre demande. Réessayez dans quelques instants.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractMessage(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value instanceof Error) return value.message.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractMessage(item);
      if (message) return message;
    }
  }
  if (isRecord(value)) {
    for (const key of ["detail", "message", "error"]) {
      if (key in value) {
        const message = extractMessage(value[key]);
        if (message) return message;
      }
    }
    for (const child of Object.values(value)) {
      const message = extractMessage(child);
      if (message) return message;
    }
  }
  return null;
}

function makeUserFriendly(message: string, fallback: string): string {
  if (
    /failed to fetch|networkerror|network request failed|fetch failed|timeout|timed out|temporarily unavailable|api est temporairement indisponible|serveur est inaccessible|non-json|not valid json|unexpected token|<!doctype|stack trace|traceback|internal server error|page html|serveur api a renvoyé|format (?:de la )?réponse.*invalide|(?:données|informations|liste|profil|répartition).{0,100}(?:reçu|reçue|reçus|reçues).{0,30}invalide|(?:reçu|reçue|reçus|reçues) du serveur est invalide|format des données reçu de l’api est invalide/i.test(
      message,
    )
  ) {
    return SERVICE_UNAVAILABLE_MESSAGE;
  }
  return message || fallback;
}

export function getUserFacingErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const message = extractMessage(error);
  return message ? makeUserFriendly(message, fallback) : fallback;
}

export function getUserFacingApiError(
  payload: unknown,
  fallback: string,
  status?: number,
): string {
  if (status === 401) {
    return "Votre session a expiré. Reconnectez-vous puis réessayez.";
  }
  if (status === 403) {
    return "Vous n’avez pas l’autorisation d’effectuer cette action.";
  }
  if (status === 404) {
    return "L’élément demandé est introuvable. Actualisez la page puis réessayez.";
  }
  if (status !== undefined && status >= 500) return SERVER_ERROR_MESSAGE;

  const message = extractMessage(payload);
  if (!message) return fallback;
  return makeUserFriendly(message, fallback);
}
