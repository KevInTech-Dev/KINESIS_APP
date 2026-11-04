import { forwardBackendGet } from "@/lib/backend-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json(
      { detail: "Identifiant de voyage invalide." },
      { status: 400 },
    );
  }
  return forwardBackendGet(`bagages/tarifs/voyage/${id}/`);
}
