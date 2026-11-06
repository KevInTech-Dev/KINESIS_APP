from django.db.models import Count, Q, QuerySet

from .models import Voyage


def with_availability(queryset: QuerySet[Voyage], now) -> QuerySet[Voyage]:
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
