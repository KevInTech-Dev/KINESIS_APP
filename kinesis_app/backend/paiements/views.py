import json

from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .fedapay import retrieve_transaction, verify_webhook_signature
from .models import BilletElectronique, Paiement
from .permissions import CanScanTicket, CanValidateBoarding, IsVoyageur
from .serializers import (
    BilletElectroniqueSerializer,
    BilletScanRequestSerializer,
    BilletScanSerializer,
    PaiementCheckoutSerializer,
    PaiementSerializer,
)
from .services import (
    create_fedapay_checkout,
    refresh_fedapay_payment,
    scan_ticket,
    start_payment_attempt,
    sync_fedapay_transaction,
    validate_ticket_boarding,
)


class PaiementAttemptView(APIView):
    permission_classes = [IsAuthenticated, IsVoyageur]

    @extend_schema(
        request=None,
        responses={201: PaiementCheckoutSerializer},
        description=(
            "Crée ou reprend une tentative de paiement pour une réservation du "
            "voyageur connecté. La réponse inclut payment_url pour rediriger le "
            "voyageur vers la page sécurisée FedaPay."
        ),
    )
    def post(self, request, reservation_id):
        payment = start_payment_attempt(
            reservation_id=reservation_id,
            voyageur=request.user,
        )
        payment, payment_url = create_fedapay_checkout(paiement_id=payment.pk)
        data = PaiementCheckoutSerializer(
            {
                **PaiementSerializer(payment).data,
                "payment_url": payment_url,
            }
        ).data
        return Response(data, status=201)


class PaiementDetailView(generics.RetrieveAPIView):
    serializer_class = PaiementSerializer
    permission_classes = [IsAuthenticated, IsVoyageur]
    queryset = Paiement.objects.all()
    lookup_field = "pk"
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        return Paiement.objects.filter(
            reservation__voyageur=self.request.user,
        )

    @extend_schema(
        description=(
            "Retourne l’état du paiement du voyageur connecté et le synchronise "
            "auprès de FedaPay lorsqu’une transaction est en attente."
        )
    )
    def retrieve(self, request, *args, **kwargs):
        payment = self.get_object()
        if payment.statut == Paiement.Statut.EN_ATTENTE and payment.reference_fedapay:
            payment = refresh_fedapay_payment(payment=payment)
        return Response(self.get_serializer(payment).data)


class FedaPayWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(exclude=True)
    def post(self, request):
        signature = request.headers.get("X-FEDAPAY-SIGNATURE", "")
        try:
            verify_webhook_signature(request.body, signature)
        except ValueError:
            return Response({"detail": "Signature webhook invalide."}, status=400)

        try:
            event = json.loads(request.body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return Response({"detail": "Contenu webhook invalide."}, status=400)
        if not isinstance(event, dict):
            return Response({"detail": "Contenu webhook invalide."}, status=400)

        event_name = event.get("name")
        if event_name not in {
            "transaction.approved",
            "transaction.declined",
            "transaction.canceled",
        }:
            return Response({"received": True})

        event_object = event.get("object")
        if not isinstance(event_object, dict):
            return Response({"detail": "Objet webhook invalide."}, status=400)
        transaction_id = event_object.get("id")
        if transaction_id is None:
            return Response(
                {"detail": "Identifiant de transaction manquant."}, status=400
            )
        if isinstance(transaction_id, bool) or not str(transaction_id).isdecimal():
            return Response(
                {"detail": "Identifiant de transaction invalide."}, status=400
            )

        payment = Paiement.objects.filter(
            reference_fedapay=str(transaction_id),
        ).first()
        if payment is None:
            return Response({"received": True})
        provider_transaction = retrieve_transaction(transaction_id)
        sync_fedapay_transaction(
            payment=payment,
            provider_transaction=provider_transaction,
        )
        return Response({"received": True})


class BilletListView(generics.ListAPIView):
    serializer_class = BilletElectroniqueSerializer
    permission_classes = [IsAuthenticated, IsVoyageur]

    def get_queryset(self):
        return BilletElectronique.objects.filter(
            place__reservation__voyageur=self.request.user,
        ).select_related(
            "place__reservation__voyage",
            "place__reservation__voyage__compagnie__utilisateur",
            "place__reservation__voyage__ville_depart",
            "place__reservation__voyage__ville_arrivee",
            "place__reservation",
        )


class BilletDetailView(generics.RetrieveAPIView):
    serializer_class = BilletElectroniqueSerializer
    permission_classes = [IsAuthenticated, IsVoyageur]

    def get_queryset(self):
        return BilletElectronique.objects.filter(
            place__reservation__voyageur=self.request.user,
        ).select_related(
            "place__reservation__voyage",
            "place__reservation__voyage__compagnie__utilisateur",
            "place__reservation__voyage__ville_depart",
            "place__reservation__voyage__ville_arrivee",
            "place__reservation",
        )


class BilletScanView(APIView):
    permission_classes = (IsAuthenticated, CanScanTicket)

    @extend_schema(
        request=BilletScanRequestSerializer,
        responses={200: BilletScanSerializer},
    )
    def post(self, request):
        serializer = BilletScanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = scan_ticket(
            actor=request.user,
            code_qr=serializer.validated_data["code_qr"],
        )
        return Response(BilletScanSerializer(ticket).data)


class BilletBoardingView(APIView):
    permission_classes = (IsAuthenticated, CanValidateBoarding)

    @extend_schema(
        request=BilletScanRequestSerializer,
        responses={200: BilletScanSerializer},
    )
    def post(self, request):
        serializer = BilletScanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = validate_ticket_boarding(
            actor=request.user,
            code_qr=serializer.validated_data["code_qr"],
        )
        return Response(BilletScanSerializer(ticket).data)
