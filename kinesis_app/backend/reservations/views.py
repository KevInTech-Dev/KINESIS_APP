from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Reservation
from .permissions import IsVoyageur
from .serializers import ReservationCreateSerializer, ReservationSerializer
from .services import cancel_reservation, expire_overdue_reservations


class ReservationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsVoyageur]

    def get_queryset(self):
        expire_overdue_reservations(voyageur=self.request.user)
        return (
            Reservation.objects.filter(voyageur=self.request.user)
            .select_related(
                "voyage__compagnie__utilisateur",
                "voyage__ville_depart",
                "voyage__ville_arrivee",
            )
            .prefetch_related("places")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ReservationCreateSerializer
        return ReservationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation = serializer.save()
        response_serializer = ReservationSerializer(
            reservation,
            context=self.get_serializer_context(),
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ReservationDetailView(generics.RetrieveAPIView):
    serializer_class = ReservationSerializer
    permission_classes = [IsAuthenticated, IsVoyageur]

    def get_queryset(self):
        expire_overdue_reservations(voyageur=self.request.user)
        return (
            Reservation.objects.filter(voyageur=self.request.user)
            .select_related(
                "voyage__compagnie__utilisateur",
                "voyage__ville_depart",
                "voyage__ville_arrivee",
            )
            .prefetch_related("places")
        )


class ReservationCancelView(APIView):
    permission_classes = [IsAuthenticated, IsVoyageur]

    @extend_schema(request=None, responses={status.HTTP_200_OK: ReservationSerializer})
    def post(self, request, pk):
        reservation = cancel_reservation(
            reservation_id=pk,
            voyageur=request.user,
        )
        return Response(
            ReservationSerializer(reservation, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )