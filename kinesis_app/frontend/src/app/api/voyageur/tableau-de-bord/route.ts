import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { accessCookieName } from "@/lib/auth-cookies";
import { getBackendResource } from "@/lib/auth-proxy";
import { readAuthSession } from "@/lib/auth-session";
import { isUserProfile } from "@/lib/user-profile";

const dashboardResources = {
  tickets: "billets/?page_size=100",
  baggages: "bagages/",
  notifications: "notifications/?page_size=100",
} as const;

async function fetchDashboardResources(accessToken: string) {
  const entries = Object.entries(dashboardResources);
  const results = await Promise.all(
    entries.map(async ([key, resource]) => [
      key,
      await getBackendResource(resource, accessToken),
    ] as const),
  );
  return Object.fromEntries(results);
}

export async function GET() {
  const cookieStore = await cookies();
  const originalAccess = cookieStore.get(accessCookieName)?.value;
  const [auth, initialResults] = await Promise.all([
    readAuthSession(),
    originalAccess
      ? fetchDashboardResources(originalAccess)
      : Promise.resolve(null),
  ]);
  if ("status" in auth) {
    const response = NextResponse.json(auth.data, { status: auth.status });
    if (auth.status === 401) clearAuthCookies(response);
    return response;
  }
  if (
    !isUserProfile(auth.session.profile) ||
    auth.session.profile.role !== "VOYAGEUR"
  ) {
    return NextResponse.json(
      { detail: "Le tableau de bord est réservé aux comptes voyageurs." },
      { status: 403 },
    );
  }

  const results =
    auth.session.access === originalAccess && initialResults
      ? initialResults
      : await fetchDashboardResources(auth.session.access);
  const response = NextResponse.json(
    { resources: results },
    { headers: { "Cache-Control": "no-store" } },
  );
  if (auth.session.rotated) {
    setAuthCookies(response, auth.session.access, auth.session.refresh);
  }
  return response;
}
