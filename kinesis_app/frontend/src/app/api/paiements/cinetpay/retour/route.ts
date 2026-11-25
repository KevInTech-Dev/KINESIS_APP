import { NextResponse } from "next/server";

const paymentIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function paymentReturnResponse(request: Request) {
  const requestUrl = new URL(request.url);
  const paymentId = requestUrl.searchParams.get("payment_id");
  if (!paymentId || !paymentIdPattern.test(paymentId)) {
    return NextResponse.json(
      { detail: "Référence de paiement CinetPay invalide." },
      { status: 400 },
    );
  }

  const returnUrl = new URL("/paiement/retour", request.url);
  returnUrl.searchParams.set("payment_id", paymentId);
  return NextResponse.redirect(returnUrl, 303);
}

export async function GET(request: Request) {
  return paymentReturnResponse(request);
}

export async function POST(request: Request) {
  return paymentReturnResponse(request);
}
