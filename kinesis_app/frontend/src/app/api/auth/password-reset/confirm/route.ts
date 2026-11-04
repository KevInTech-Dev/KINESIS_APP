import { postAuthToBackend } from "@/lib/auth-proxy";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { detail: "Le lien ou les informations de réinitialisation sont invalides." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("uid" in body) ||
    typeof body.uid !== "string" ||
    !("token" in body) ||
    typeof body.token !== "string" ||
    !("new_password" in body) ||
    typeof body.new_password !== "string" ||
    !("password_confirmation" in body) ||
    typeof body.password_confirmation !== "string" ||
    !body.uid ||
    !body.token ||
    !body.new_password ||
    !body.password_confirmation
  ) {
    return Response.json(
      { detail: "Le lien ou les informations de réinitialisation sont invalides." },
      { status: 400 },
    );
  }

  const result = await postAuthToBackend("password-reset/confirm/", {
    uid: body.uid,
    token: body.token,
    new_password: body.new_password,
    password_confirmation: body.password_confirmation,
  });
  if (result.status === 204) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
