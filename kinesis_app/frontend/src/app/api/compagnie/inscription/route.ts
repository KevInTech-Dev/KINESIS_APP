import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { detail: "Le formulaire d’inscription est invalide." },
      { status: 400 },
    );
  }

  const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
  let url: URL;
  try {
    url = new URL(
      "/api/v1/compagnies/register/",
      `${backendUrl.replace(/\/+$/, "")}/`,
    );
  } catch (error) {
    console.error("BACKEND_API_URL is not a valid URL", error);
    return NextResponse.json(
      { detail: "L’adresse du serveur Django est mal configurée." },
      { status: 500 },
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error("Company registration request failed", error);
    return NextResponse.json(
      { detail: "L’API est temporairement indisponible. Réessayez plus tard." },
      { status: 502 },
    );
  }

  const text = await response.text();
  if (!text) {
    return NextResponse.json(null, { status: response.status });
  }
  try {
    return NextResponse.json(JSON.parse(text) as unknown, {
      status: response.status,
    });
  } catch (error) {
    console.error("Company registration response was not valid JSON", error);
    return NextResponse.json(
      { detail: "La réponse du serveur d’inscription est illisible." },
      { status: 502 },
    );
  }
}
