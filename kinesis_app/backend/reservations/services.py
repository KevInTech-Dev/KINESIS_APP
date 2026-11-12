import uuid
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from compagnies.models import Compagnie, PermissionAgent
from notifications.models import Notification
from notifications.services import notify_company_and_agents
from voyages.models import Voyage

from .models import PlaceReservee, Reservation

RESERVATION_HOLD_DURATION = timedelta(minutes=10)


def filter_active_reservations(queryset, *, now=None):
    now = now or timezone.now()
    return queryset.filter(
        Q(statut=Reservation.Statut.PAYEE)
        | Q(
            statut=Reservation.Statut.EN_ATTENTE_PAIEMENT,
            date_expiration__gt=now,
        )
    )


def _expire_for_voyage(voyage, now):
    expired_ids = list(
        Reservation.objects.select_for_update()
        .filter(
            voyage=voyage,
            statut=Reservation.Statut.EN_ATTENTE_PAIEMENT,
            date_expiration__lte=now,
        )
        .values_list("pk", flat=True)
    )
    if not expired_ids:
        return

    Reservation.objects.filter(pk__in=expired_ids).update(
        statut=Reservation.Statut.EXPIREE
    )
    PlaceReservee.objects.filter(
        reservation_id__in=expired_ids,
        liberee=False,
    ).update(liberee=True)


def expire_overdue_reservations(*, voyageur=None, company=None, now=None):
    now = now or timezone.now()
    reservations = Reservation.objects.filter(
        statut=Reservation.Statut.EN_ATTENTE_PAIEMENT,
        date_expiration__lte=now,
    )
    if voyageur is not None:
        reservations = reservations.filter(voyageur=voyageur)
    if company is not None:
        reservations = reservations.filter(voyage__compagnie=company)

    with transaction.atomic():
        expired_ids = list(
            reservations.select_for_update().values_list("pk", flat=True)
        )
        if not expired_ids:
            return 0
        Reservation.objects.filter(pk__in=expired_ids).update(
            statut=Reservation.Statut.EXPIREE
        )
        PlaceReservee.objects.filter(
            reservation_id__in=expired_ids,
            liberee=False,
        ).update(liberee=True)
    return len(expired_ids)


def create_reservation(*, voyageur, voyage_id, passenger_names, now=None):
    now = now or timezone.now()

    with transaction.atomic():
        try:
            voyage = Voyage.objects.select_for_update().select_related(
                "compagnie"
            ).get(pk=voyage_id, deleted_at__isnull=True)
        except (Voyage.DoesNotExist, ValueError):
            raise ValidationError({"voyage_id": "Voyage introuvable."})

        _expire_for_voyage(voyage, now)

        if voyage.compagnie.statut != Compagnie.Statut.ACTIVE:
            raise ValidationError({"voyage_id": "Cette compagnie n’est pas active."})
        if voyage.statut != Voyage.Statut.PUBLIE:
            raise ValidationError({"voyage_id": "Ce voyage n’est pas ouvert aux réservations."})

        departure = timezone.make_aware(
            datetime.combine(voyage.date_depart, voyage.heure_depart),
            timezone.get_current_timezone(),
        )
        if departure <= now:
            raise ValidationError({"voyage_id": "Ce voyage est déjà passé."})

        occupied_seats = set(
            PlaceReservee.objects.filter(voyage=voyage, liberee=False).values_list(
                "numero_siege",
                flat=True,
            )
        )
        seat_count = len(passenger_names)
        seat_numbers = []
        for first_seat in range(1, voyage.place_totale - seat_count + 2):
            candidate = [
                f"S{seat_number:03d}"
                for seat_number in range(first_seat, first_seat + seat_count)
            ]
            if not occupied_seats.intersection(candidate):
                seat_numbers = candidate
                break

        if not seat_numbers:
            raise ValidationError(
                {
                    "passagers": (
                        "Il n’y a pas assez de places consécutives disponibles "
                        "pour tous les passagers."
                    )
                }
            )

        reservation = Reservation.objects.create(
            reference=f"RES-{uuid.uuid4().hex[:16].upper()}",
            voyageur=voyageur,
            voyage=voyage,
            date_expiration=now + RESERVATION_HOLD_DURATION,
            montant_total=voyage.prix * len(passenger_names),
            statut=Reservation.Statut.EN_ATTENTE_PAIEMENT,
        )
        PlaceReservee.objects.bulk_create(
            [
                PlaceReservee(
                    reservation=reservation,
                    voyage=voyage,
                    numero_siege=seat_number,
                    nom_passager=passenger_name,
                )
                for seat_number, passenger_name in zip(seat_numbers, passenger_names)
            ]
        )
        Notification.objects.create(
            utilisateur=voyageur,
            type=Notification.Type.RESERVATION,
            titre="Réservation créée",
            message=(
                f"Votre réservation {reservation.reference} est créée et attend "
                "le paiement."
            ),
        )
        return reservation


def cancel_reservation(*, reservation_id, voyageur, now=None):
    now = now or timezone.now()
    try:
        voyage_id = Reservation.objects.values_list("voyage_id", flat=True).get(
            pk=reservation_id,
            voyageur=voyageur,
        )
    except (Reservation.DoesNotExist, ValueError):
        raise ValidationError({"reservation": "Réservation introuvable."})

    with transaction.atomic():
        try:
            voyage = Voyage.objects.select_for_update().get(pk=voyage_id)
            reservation = Reservation.objects.select_for_update().get(
                pk=reservation_id,
                voyageur=voyageur,
            )
        except (Voyage.DoesNotExist, Reservation.DoesNotExist):
            raise ValidationError({"reservation": "Réservation introuvable."})

        _expire_for_voyage(voyage, now)
        reservation.refresh_from_db()
        if reservation.statut != Reservation.Statut.EN_ATTENTE_PAIEMENT:
            raise ValidationError(
                {"reservation": "Seule une réservation en attente peut être annulée."}
            )

        reservation.statut = Reservation.Statut.ANNULEE
        reservation.save(update_fields=("statut",))
        reservation.places.filter(liberee=False).update(liberee=True)
        message = (
            f"La réservation {reservation.reference} du voyage "
            f"{voyage.ville_depart} - {voyage.ville_arrivee} a été annulée."
        )
        Notification.objects.create(
            utilisateur=voyageur,
            type=Notification.Type.RESERVATION,
            titre="Réservation annulée",
            message=f"Votre réservation {reservation.reference} a été annulée.",
        )
        notify_company_and_agents(
            company=voyage.compagnie,
            type=Notification.Type.RESERVATION,
            titre="Réservation annulée",
            message=message,
            any_agent_permissions=(
                PermissionAgent.Code.ENREGISTRER_BAGAGE,
                PermissionAgent.Code.CONSULTER_BAGAGES,
            ),
            exclude_user=voyageur,
        )
        return reservation
