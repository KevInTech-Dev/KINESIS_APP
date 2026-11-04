import { postAuthToBackend } from "@/lib/auth-proxy";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { detail: "Saisissez une adresse e-mail valide." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("email" in body) ||
    typeof body.email !== "string" ||
    !body.email.trim()
  ) {
    return Response.json(
      { detail: "Saisissez une adresse e-mail valide." },
      { status: 400 },
    );
  }

  const result = await postAuthToBackend("password-reset/", {
    email: body.email.trim(),
  });
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
