import { postAuthToBackend } from "@/lib/auth-proxy";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { detail: "Les informations d’inscription sont invalides." },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return Response.json(
      { detail: "Les informations d’inscription sont invalides." },
      { status: 400 },
    );
  }

  const fields = [
    "email",
    "nom",
    "prenoms",
    "telephone",
    "password",
    "password_confirmation",
  ] as const;
  const payload: Record<string, string> = {};

  for (const field of fields) {
    if (field in body && typeof body[field] === "string") {
      payload[field] =
        field === "password" || field === "password_confirmation"
          ? body[field]
          : body[field].trim();
    } else if (field === "password" || field === "password_confirmation") {
      return Response.json(
        { detail: "Tous les champs du formulaire sont obligatoires." },
        { status: 400 },
      );
    }
  }

  if (
    !payload.email ||
    !payload.nom ||
    !payload.password ||
    !payload.password_confirmation
  ) {
    return Response.json(
      { detail: "Renseignez votre nom, votre e-mail et votre mot de passe." },
      { status: 400 },
    );
  }

  const result = await postAuthToBackend("register/", payload);
  if (result.status < 200 || result.status >= 300) {
    return Response.json(result.data, { status: result.status });
  }

  return Response.json(
    {
      detail:
        "Un code de vérification a été envoyé à votre adresse e-mail. Il est valable 10 minutes.",
    },
    { status: result.status },
  );
}
