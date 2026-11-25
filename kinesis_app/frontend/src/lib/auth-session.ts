import { cookies } from "next/headers";
import {
  accessCookieName,
  refreshCookieName,
} from "@/lib/auth-cookies";
import {
  getAuthFromBackend,
  isTokenPair,
  postAuthToBackend,
} from "@/lib/auth-proxy";

type AuthSession = {
  access: string;
  refresh: string;
  profile: unknown;
  rotated: boolean;
};

type AuthTokenPair = {
  access: string;
  refresh: string;
};

type AuthTokensResult =
  | { tokens: AuthTokenPair }
  | { status: number; data: unknown };

type AuthSessionResult =
  | { session: AuthSession }
  | { status: number; data: unknown };

export async function readAuthTokens(): Promise<AuthTokensResult> {
  const cookieStore = await cookies();
  const access = cookieStore.get(accessCookieName)?.value;
  const refresh = cookieStore.get(refreshCookieName)?.value;

  if (!access || !refresh) {
    return {
      status: 401,
      data: { detail: "Vous devez vous connecter pour continuer." },
    };
  }

  return { tokens: { access, refresh } };
}

export async function refreshAuthTokens(
  refresh: string,
): Promise<AuthTokensResult> {
  const refreshed = await postAuthToBackend("token/refresh/", { refresh });

  if (refreshed.status < 200 || refreshed.status >= 300) {
    return { status: refreshed.status, data: refreshed.data };
  }

  if (!isTokenPair(refreshed.data)) {
    console.error("Backend refresh response did not contain both tokens.");
    return {
      status: 502,
      data: { detail: "La réponse de renouvellement de session est invalide." },
    };
  }

  return { tokens: refreshed.data };
}

export async function readAuthSession(): Promise<AuthSessionResult> {
  const tokenResult = await readAuthTokens();
  if ("status" in tokenResult) {
    return tokenResult;
  }

  let activeAccess = tokenResult.tokens.access;
  let activeRefresh = tokenResult.tokens.refresh;
  let rotated = false;
  let profile = await getAuthFromBackend("me/", activeAccess);

  if (profile.status === 401) {
    const refreshed = await refreshAuthTokens(activeRefresh);
    if ("status" in refreshed) {
      return refreshed;
    }

    activeAccess = refreshed.tokens.access;
    activeRefresh = refreshed.tokens.refresh;
    rotated = true;
    profile = await getAuthFromBackend("me/", activeAccess);
  }

  if (profile.status < 200 || profile.status >= 300) {
    return { status: profile.status, data: profile.data };
  }

  return {
    session: {
      access: activeAccess,
      refresh: activeRefresh,
      profile: profile.data,
      rotated,
    },
  };
}
