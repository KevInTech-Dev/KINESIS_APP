from django.db.models import Count, Exists, F, OuterRef, Q, QuerySet
from django.utils import timezone

from reservations.models import Reservation

from .models import Voyage


def public_voyages_queryset(now=None) -> QuerySet[Voyage]:
    now = now or timezone.localtime()
    public = Q(statut=Voyage.Statut.PUBLIE, compagnie__statut="ACTIVE")
    public &= Q(date_depart__gt=now.date()) | Q(
        date_depart=now.date(),
        heure_depart__gte=now.time().replace(tzinfo=None),
    )
    queryset = Voyage.objects.select_related(
        "compagnie__utilisateur",
        "ville_depart",
        "ville_arrivee",
        "gare_depart__ville",
        "gare_arrivee__ville",
    )
    return with_availability(queryset, now).filter(
        public,
        deleted_at__isnull=True,
        _places_occupees__lt=F("place_totale"),
    )


def with_availability(queryset: QuerySet[Voyage], now) -> QuerySet[Voyage]:
    active_holds = Q(
        places_reservees__reservation__statut="PAYEE",
    ) | Q(
        places_reservees__reservation__statut="EN_ATTENTE_PAIEMENT",
        places_reservees__reservation__date_expiration__gt=now,
    )
    return queryset.annotate(
        _has_reservations=Exists(
            Reservation.objects.filter(voyage_id=OuterRef("pk"))
        ),
        _places_occupees=Count(
            "places_reservees",
            filter=Q(places_reservees__liberee=False) & active_holds,
        )
    )
