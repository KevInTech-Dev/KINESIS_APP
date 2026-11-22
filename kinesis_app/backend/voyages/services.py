from django.db.models import Q
from django.utils import timezone

from .cache import invalidate_public_voyages_cache
from .models import Voyage


def synchronize_due_departures(*, company=None, now=None):
    local_now = timezone.localtime(now or timezone.now())
    due_departures = Q(date_depart__lt=local_now.date()) | Q(
        date_depart=local_now.date(),
        heure_depart__lte=local_now.time().replace(tzinfo=None),
    )
    voyages = Voyage.objects.filter(
        statut=Voyage.Statut.PUBLIE,
        deleted_at__isnull=True,
    )
    if company is not None:
        voyages = voyages.filter(compagnie=company)

    finished_count = voyages.filter(date_depart_effective__isnull=False).update(
        statut=Voyage.Statut.EXPIREE
    )
    awaiting_confirmation_count = (
        voyages.filter(
            date_depart_effective__isnull=True,
        )
        .filter(due_departures)
        .update(statut=Voyage.Statut.DEPART_A_CONFIRMER)
    )

    if finished_count or awaiting_confirmation_count:
        invalidate_public_voyages_cache()

    return finished_count + awaiting_confirmation_count
