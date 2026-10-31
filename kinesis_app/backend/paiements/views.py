from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BilletElectronique
from .permissions import CanScanTicket, CanValidateBoarding, IsVoyageur
from .serializers import (
    BilletElectroniqueSerializer,
    BilletScanRequestSerializer,
    BilletScanSerializer,
)
from .services import scan_ticket, validate_ticket_boarding


class BilletListView(generics.ListAPIView):
    serializer_class = BilletElectroniqueSerializer
    permission_classes = [IsAuthenticated, IsVoyageur]

    def get_queryset(self):
        return (
            BilletElectronique.objects.filter(
                place__reservation__voyageur=self.request.user,
            )
            .select_related(
                "place__reservation__voyage",
                "place__reservation__voyage__compagnie__utilisateur",
                "place__reservation__voyage__ville_depart",
                "place__reservation__voyage__ville_arrivee",
                "place__reservation",
            )
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