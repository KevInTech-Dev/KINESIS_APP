from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from compagnies.permissions import IsActiveCompany
from compagnies.models import Compagnie
from voyages.models import Voyage

from .models import Bagage, TarifBagage
from .permissions import (
    CanListBaggage,
    CanRecordBaggageFee,
    CanRegisterBaggage,
    CanReturnBaggage,
    baggage_queryset_for_user,
    company_for_user,
)
from .serializers import BagageCreateSerializer, BagageSerializer, TarifBagageSerializer
from .services import delete_tariff, record_manual_fee_payment, return_baggage


class TarifListCreateView(generics.ListCreateAPIView):
    serializer_class = TarifBagageSerializer
    permission_classes = [IsAuthenticated, IsActiveCompany]

    def get_queryset(self):
        company = company_for_user(self.request.user)
        return TarifBagage.objects.filter(compagnie=company)


class VoyageTarifListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, voyage_id):
        voyage = (
            Voyage.objects.select_related("compagnie")
            .filter(
                pk=voyage_id,
                statut=Voyage.Statut.PUBLIE,
                compagnie__statut=Compagnie.Statut.ACTIVE,
            )
            .first()
        )
        if voyage is None:
            return Response(
                {"detail": "Voyage introuvable ou indisponible."},
                status=status.HTTP_404_NOT_FOUND,
            )
        tariffs = TarifBagage.objects.filter(compagnie=voyage.compagnie)
        return Response(TarifBagageSerializer(tariffs, many=True).data)


class TarifDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TarifBagageSerializer
    permission_classes = [IsAuthenticated, IsActiveCompany]

    def get_queryset(self):
        company = company_for_user(self.request.user)
        return TarifBagage.objects.filter(compagnie=company)

    @transaction.atomic
    def perform_destroy(self, instance):
        delete_tariff(actor=self.request.user, tariff_id=instance.pk)


class BagageListCreateView(generics.ListCreateAPIView):
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanRegisterBaggage()]
        return [IsAuthenticated(), CanListBaggage()]

    def get_queryset(self):
        try:
            return (
                baggage_queryset_for_user(self.request.user)
                .select_related(
                    "reservation__voyage",
                    "enregistre_par",
                    "restitue_par",
                )
                .prefetch_related("photos")
            )
        except PermissionDenied:
            return Bagage.objects.none()

    def get_serializer_class(self):
        if self.request.method == "POST":
            return BagageCreateSerializer
        return BagageSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        baggage = serializer.save()
        return Response(
            BagageSerializer(baggage, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )


class BagageDetailView(generics.RetrieveAPIView):
    serializer_class = BagageSerializer
    permission_classes = [IsAuthenticated, CanListBaggage]

    def get_queryset(self):
        try:
            return baggage_queryset_for_user(self.request.user).select_related(
                "reservation__voyage",
                "enregistre_par",
                "restitue_par",
            ).prefetch_related("photos")
        except PermissionDenied:
            return Bagage.objects.none()


class PaiementFraisBagageView(APIView):
    permission_classes = [CanRecordBaggageFee]

    @extend_schema(request=None, responses={status.HTTP_200_OK: BagageSerializer})
    def post(self, request, pk):
        baggage = record_manual_fee_payment(actor=request.user, baggage_id=pk)
        return Response(
            BagageSerializer(baggage, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class RestitutionBagageView(APIView):
    permission_classes = [CanReturnBaggage]

    @extend_schema(request=None, responses={status.HTTP_200_OK: BagageSerializer})
    def post(self, request, pk):
        baggage = return_baggage(actor=request.user, baggage_id=pk)
        return Response(
            BagageSerializer(baggage, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )