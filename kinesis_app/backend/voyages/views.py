from django.db import transaction
from django.db.models import Count, F, Q
from django.utils import timezone
from rest_framework import generics
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny

from compagnies.models import PermissionAgent
from notifications.models import Notification
from notifications.services import notify_company_and_agents
from reservations.models import Reservation

from .models import Ville, Voyage
from .permissions import IsActiveCompany, IsOwnerCompany
from .serializers import VilleSerializer, VoyageSearchSerializer, VoyageSerializer


def _with_availability(queryset, now):
    active_holds = Q(
        places_reservees__reservation__statut="PAYEE",
    ) | Q(
        places_reservees__reservation__statut="EN_ATTENTE_PAIEMENT",
        places_reservees__reservation__date_expiration__gt=now,
    )
    return queryset.annotate(
        _places_occupees=Count(
            "places_reservees",
            filter=Q(places_reservees__liberee=False) & active_holds,
        )
    )


class VilleListView(generics.ListAPIView):
    queryset = Ville.objects.all()
    serializer_class = VilleSerializer
    permission_classes = [AllowAny]


class VoyageListCreateView(generics.ListCreateAPIView):
    serializer_class = VoyageSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsActiveCompany()]
        return [AllowAny()]

    def get_queryset(self):
        queryset = Voyage.objects.select_related(
            "compagnie__utilisateur",
            "ville_depart",
            "ville_arrivee",
        )
        if self.request.method == "POST":
            return queryset.none()

        now = timezone.localtime()
        public = Q(statut=Voyage.Statut.PUBLIE)
        public &= Q(compagnie__statut="ACTIVE")
        public &= Q(date_depart__gt=now.date()) | Q(
            date_depart=now.date(),
            heure_depart__gte=now.time().replace(tzinfo=None),
        )

        search = VoyageSearchSerializer(data=self.request.query_params)
        search.is_valid(raise_exception=True)
        filters = search.validated_data
        if "ville_depart" in filters:
            public &= Q(ville_depart_id=filters["ville_depart"])
        if "ville_arrivee" in filters:
            public &= Q(ville_arrivee_id=filters["ville_arrivee"])
        if "date_depart" in filters:
            public &= Q(date_depart=filters["date_depart"])

        queryset = _with_availability(queryset, now).filter(public)
        queryset = queryset.filter(_places_occupees__lt=F("place_totale"))
        user = self.request.user
        if user.is_authenticated and user.role == user.Role.COMPAGNIE:
            own_trips = _with_availability(
                Voyage.objects.select_related(
                    "compagnie__utilisateur",
                    "ville_depart",
                    "ville_arrivee",
                ),
                now,
            ).filter(compagnie__utilisateur=user)
            queryset = queryset | own_trips
        return queryset

    def perform_create(self, serializer):
        serializer.save(compagnie=self.request.user.profil_compagnie)


class VoyageDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = VoyageSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH"):
            return [IsActiveCompany(), IsOwnerCompany()]
        return [AllowAny()]

    def get_queryset(self):
        queryset = Voyage.objects.select_related(
            "compagnie__utilisateur",
            "ville_depart",
            "ville_arrivee",
        )
        if self.request.method in ("PUT", "PATCH"):
            if not self.request.user.is_authenticated:
                return queryset.none()
            return queryset.filter(compagnie__utilisateur=self.request.user)

        now = timezone.localtime()
        public = Q(statut=Voyage.Statut.PUBLIE, compagnie__statut="ACTIVE")
        public &= Q(date_depart__gt=now.date()) | Q(
            date_depart=now.date(),
            heure_depart__gte=now.time().replace(tzinfo=None),
        )
        queryset = _with_availability(queryset, now).filter(public)
        queryset = queryset.filter(_places_occupees__lt=F("place_totale"))
        user = self.request.user
        if user.is_authenticated and user.role == user.Role.COMPAGNIE:
            own_trips = _with_availability(
                Voyage.objects.select_related(
                    "compagnie__utilisateur",
                    "ville_depart",
                    "ville_arrivee",
                ),
                now,
            ).filter(compagnie__utilisateur=user)
            queryset = queryset | own_trips
        return queryset

    @transaction.atomic
    def perform_update(self, serializer):
        voyage = serializer.instance
        changed = any(
            getattr(voyage, field) != value
            for field, value in serializer.validated_data.items()
        )
        voyage = serializer.save()
        if not changed:
            return

        reservation_statuses = Q(statut=Reservation.Statut.PAYEE) | Q(
            statut=Reservation.Statut.EN_ATTENTE_PAIEMENT,
            date_expiration__gt=timezone.now(),
        )
        voyageurs = (
            Reservation.objects.filter(voyage=voyage)
            .filter(reservation_statuses)
            .values_list("voyageur_id", flat=True)
            .distinct()
        )
        if voyage.statut == Voyage.Statut.ANNULEE:
            titre = "Voyage annulé"
            message = (
                f"Le voyage {voyage.ville_depart} - {voyage.ville_arrivee} "
                f"du {voyage.date_depart} a été annulé."
            )
        else:
            titre = "Voyage modifié"
            message = (
                f"Les informations du voyage {voyage.ville_depart} - "
                f"{voyage.ville_arrivee} du {voyage.date_depart} ont été modifiées."
            )
        Notification.objects.bulk_create(
            [
                Notification(
                    utilisateur_id=voyageur_id,
                    type=Notification.Type.VOYAGE,
                    titre=titre,
                    message=message,
                )
                for voyageur_id in voyageurs
            ]
        )
        notify_company_and_agents(
            company=voyage.compagnie,
            type=Notification.Type.VOYAGE,
            titre=titre,
            message=message,
            any_agent_permissions=(
                PermissionAgent.Code.ENREGISTRER_BAGAGE,
                PermissionAgent.Code.CONSULTER_BAGAGES,
                PermissionAgent.Code.SCANNER_BILLET,
                PermissionAgent.Code.VALIDER_EMBARQUEMENT,
            ),
            exclude_user=self.request.user,
        )
