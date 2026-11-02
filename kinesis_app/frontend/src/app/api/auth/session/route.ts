import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  setAuthCookies,
} from "@/lib/auth-cookies";
import { readAuthSession } from "@/lib/auth-session";

export async function GET() {
  const result = await readAuthSession();

  if ("status" in result) {
    const response = NextResponse.json(result.data, { status: result.status });
    if (result.status === 401) {
      clearAuthCookies(response);
    }
    return response;
  }

  const response = NextResponse.json(result.session.profile, {
    headers: { "Cache-Control": "no-store" },
  });
  if (result.session.rotated) {
    setAuthCookies(
      response,
      result.session.access,
      result.session.refresh,
    );
  }
  return response;
}
