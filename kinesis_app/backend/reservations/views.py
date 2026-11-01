from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.pagination import StandardResultsSetPagination
from utilisateurs.models import Utilisateur

from .models import Reservation
from .permissions import CanViewReservations, IsVoyageur, reservation_view_company
from .serializers import ReservationCreateSerializer, ReservationSerializer
from .services import cancel_reservation, expire_overdue_reservations


class ReservationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, CanViewReservations]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        user = self.request.user
        if user.role == Utilisateur.Role.VOYAGEUR:
            expire_overdue_reservations(voyageur=user)
            queryset = Reservation.objects.filter(voyageur=user)
        else:
            company = reservation_view_company(user)
            if company is None:
                return Reservation.objects.none()
            expire_overdue_reservations(company=company)
            queryset = Reservation.objects.filter(voyage__compagnie=company)
        return queryset.select_related(
            "voyage__compagnie__utilisateur",
            "voyage__ville_depart",
            "voyage__ville_arrivee",
            "voyageur",
        ).prefetch_related("places")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ReservationCreateSerializer
        return ReservationSerializer

    @extend_schema(
        description=(
            "Retourne les réservations paginées du voyageur connecté ou celles "
            "des voyages de sa compagnie. Un agent ne peut les consulter que s’il "
            "a la permission ENREGISTRER_BAGAGE ou CONSULTER_BAGAGES. "
            "Paramètres de pagination : page et page_size (maximum 100)."
        )
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    @extend_schema(
        request=ReservationCreateSerializer,
        examples=[
            OpenApiExample(
                "Réserver trois passagers",
                value={
                    "voyage_id": "3004343b-b4a2-4225-9a9a-c972c25851e6",
                    "passagers": ["Jean", "Kévin", "Julien"],
                },
                request_only=True,
                media_type="application/json",
            )
        ]
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

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
    permission_classes = [IsAuthenticated, CanViewReservations]

    def get_queryset(self):
        user = self.request.user
        if user.role == Utilisateur.Role.VOYAGEUR:
            expire_overdue_reservations(voyageur=user)
            queryset = Reservation.objects.filter(voyageur=user)
        else:
            company = reservation_view_company(user)
            if company is None:
                return Reservation.objects.none()
            expire_overdue_reservations(company=company)
            queryset = Reservation.objects.filter(voyage__compagnie=company)
        return queryset.select_related(
            "voyage__compagnie__utilisateur",
            "voyage__ville_depart",
            "voyage__ville_arrivee",
            "voyageur",
        ).prefetch_related("places")


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