from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from compagnies.models import PermissionAgent
from compagnies.permissions import CanOperateAgentVoyages
from config.pagination import StandardResultsSetPagination
from notifications.models import Notification
from notifications.services import notify_company_and_agents
from reservations.models import Reservation

from .cache import (
    cache_public_cities,
    cache_public_voyages,
    get_cached_public_cities,
    get_cached_public_voyages,
    get_public_voyages_cache_key,
)
from .models import Ville, Voyage
from .permissions import IsActiveCompany, IsOwnerCompany
from .querysets import public_voyages_queryset, with_availability
from .serializers import VilleSerializer, VoyageSearchSerializer, VoyageSerializer


class VilleListView(generics.ListAPIView):
    queryset = Ville.objects.all()
    serializer_class = VilleSerializer
    permission_classes = (AllowAny,)

    def list(self, request, *args, **kwargs):
        cached_data = get_cached_public_cities()
        if cached_data is not None:
            return Response(cached_data)

        response = super().list(request, *args, **kwargs)
        if response.status_code == 200:
            cache_public_cities(response.data)
        return response


class AgentVoyageListView(generics.ListAPIView):
    serializer_class = VoyageSerializer
    permission_classes = (CanOperateAgentVoyages,)
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        queryset = (
            Voyage.objects.filter(
                compagnie=self.request.user.profil_agent.compagnie,
                deleted_at__isnull=True,
            )
            .select_related(
                "compagnie__utilisateur",
                "ville_depart",
                "ville_arrivee",
                "gare_depart__ville",
                "gare_arrivee__ville",
            )
            .order_by("-date_creation", "date_depart", "heure_depart", "pk")
        )
        return with_availability(queryset, timezone.localtime())


class VoyageListCreateView(generics.ListCreateAPIView):
    serializer_class = VoyageSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    pagination_class = StandardResultsSetPagination

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsActiveCompany()]
        return [AllowAny()]

    def get_queryset(self):
        if self.request.method == "POST":
            return Voyage.objects.none()

        now = timezone.localtime()
        queryset = public_voyages_queryset(now)

        search = VoyageSearchSerializer(data=self.request.query_params)
        search.is_valid(raise_exception=True)
        filters = search.validated_data
        if "ville_depart" in filters:
            queryset = queryset.filter(ville_depart_id=filters["ville_depart"])
        if "ville_arrivee" in filters:
            queryset = queryset.filter(ville_arrivee_id=filters["ville_arrivee"])
        if "date_depart" in filters:
            queryset = queryset.filter(date_depart=filters["date_depart"])
        if "date_depart_apres" in filters:
            queryset = queryset.filter(date_depart__gte=filters["date_depart_apres"])
        if "date_depart_avant" in filters:
            queryset = queryset.filter(date_depart__lte=filters["date_depart_avant"])
        if "compagnie" in filters:
            queryset = queryset.filter(compagnie_id=filters["compagnie"])
        if "prix_min" in filters:
            queryset = queryset.filter(prix__gte=filters["prix_min"])
        if "prix_max" in filters:
            queryset = queryset.filter(prix__lte=filters["prix_max"])

        if "places_min" in filters:
            queryset = queryset.filter(
                _places_occupees__lte=F("place_totale") - filters["places_min"]
            )
        user = self.request.user
        if user.is_authenticated and user.role == user.Role.COMPAGNIE:
            own_trips = with_availability(
                Voyage.objects.select_related(
                    "compagnie__utilisateur",
                    "ville_depart",
                    "ville_arrivee",
                    "gare_depart__ville",
                    "gare_arrivee__ville",
                ),
                now,
            ).filter(compagnie__utilisateur=user, deleted_at__isnull=True)
            queryset = queryset | own_trips
        ordering = filters.get("ordering", "date_depart")
        return queryset.order_by(
            "-date_creation",
            ordering,
            "date_depart",
            "heure_depart",
            "pk",
        )

    def list(self, request, *args, **kwargs):
        cache_key = None
        if request.method == "GET" and not request.user.is_authenticated:
            cache_key = get_public_voyages_cache_key(request)
            if cache_key:
                cached_data = get_cached_public_voyages(cache_key)
                if cached_data is not None:
                    return Response(cached_data)

        response = super().list(request, *args, **kwargs)
        if (
            request.query_params.get("include_facets") == "1"
            and isinstance(response.data, dict)
            and "results" in response.data
        ):
            companies = (
                public_voyages_queryset()
                .order_by()
                .values_list("compagnie_id", "compagnie__utilisateur__nom")
                .distinct()
            )
            response.data["companies"] = [
                {"id": str(company_id), "name": company_name}
                for company_id, company_name in companies.order_by(
                    "compagnie__utilisateur__nom",
                    "compagnie_id",
                )
            ]
        if cache_key and response.status_code == 200:
            cache_public_voyages(cache_key, response.data)
        return response

    def perform_create(self, serializer):
        serializer.save(compagnie=self.request.user.profil_compagnie)


class VoyageDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = VoyageSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsActiveCompany(), IsOwnerCompany()]
        return [AllowAny()]

    def get_queryset(self):
        queryset = Voyage.objects.select_related(
            "compagnie__utilisateur",
            "ville_depart",
            "ville_arrivee",
            "gare_depart__ville",
            "gare_arrivee__ville",
        )
        queryset = queryset.filter(deleted_at__isnull=True)
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            if not self.request.user.is_authenticated:
                return queryset.none()
            return queryset.filter(compagnie__utilisateur=self.request.user)

        now = timezone.localtime()
        queryset = public_voyages_queryset(now)
        user = self.request.user
        if user.is_authenticated and user.role == user.Role.COMPAGNIE:
            own_trips = with_availability(
                Voyage.objects.select_related(
                    "compagnie__utilisateur",
                    "ville_depart",
                    "ville_arrivee",
                    "gare_depart__ville",
                    "gare_arrivee__ville",
                ),
                now,
            ).filter(compagnie__utilisateur=user, deleted_at__isnull=True)
            queryset = queryset | own_trips
        return queryset

    @transaction.atomic
    def perform_update(self, serializer):
        voyage = Voyage.objects.select_for_update().get(pk=serializer.instance.pk)
        serializer.instance = voyage
        changed_fields = {
            field
            for field, value in serializer.validated_data.items()
            if getattr(voyage, field) != value
        }
        if not changed_fields:
            return

        if Reservation.objects.filter(voyage=voyage).exists():
            raise ValidationError(
                {
                    "voyage": (
                        "Ce trajet possède déjà des réservations. "
                        "Il ne peut pas être modifié ou archivé."
                    )
                }
            )

        if voyage.date_depart_effective is not None:
            changed_itinerary = changed_fields - {"statut"}
            next_status = serializer.validated_data.get("statut", voyage.statut)
            if changed_itinerary or next_status != Voyage.Statut.ARCHIVE:
                raise ValidationError(
                    {
                        "voyage": (
                            "Après le départ réel, le trajet ne peut plus être "
                            "modifié. Seul son archivage est autorisé."
                        )
                    }
                )

        voyage = serializer.save()
        if (
            voyage.date_depart_effective is not None
            and changed_fields == {"statut"}
            and voyage.statut == Voyage.Statut.ARCHIVE
        ):
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
        titre = (
            "Voyage archivé"
            if voyage.statut == Voyage.Statut.ARCHIVE
            else "Voyage modifié"
        )
        message = (
            f"Le voyage {voyage.ville_depart} - {voyage.ville_arrivee} "
            f"du {voyage.date_depart} a été archivé."
            if voyage.statut == Voyage.Statut.ARCHIVE
            else (
                f"Les informations du voyage {voyage.ville_depart} - "
                f"{voyage.ville_arrivee} du {voyage.date_depart} ont été modifiées."
            )
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

    @transaction.atomic
    def perform_destroy(self, instance):
        voyage = Voyage.objects.select_for_update().get(pk=instance.pk)
        if Reservation.objects.filter(voyage=voyage).exists():
            raise ValidationError(
                {
                    "voyage": (
                        "Ce trajet possède déjà des réservations et ne peut pas "
                        "être supprimé afin de préserver son historique."
                    )
                }
            )
        voyage.deleted_at = timezone.now()
        voyage.save(update_fields=("deleted_at",))
