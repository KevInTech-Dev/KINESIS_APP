from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from reservations.models import PlaceReservee, Reservation
from reservations.services import RESERVATION_HOLD_DURATION, expire_overdue_reservations

from .models import BilletElectronique, Paiement


def start_payment_attempt(*, reservation_id, voyageur, now=None):
    now = now or timezone.now()
    expire_overdue_reservations(voyageur=voyageur, now=now)
    with transaction.atomic():
        reservation = (
            Reservation.objects.select_for_update()
            .select_related("voyage")
            .filter(pk=reservation_id, voyageur=voyageur)
            .first()
        )
        if reservation is None:
            raise ValidationError({"reservation": "Réservation introuvable."})
        if reservation.statut != Reservation.Statut.EN_ATTENTE_PAIEMENT:
            raise ValidationError(
                {"reservation": "Cette réservation n’attend pas un paiement."}
            )
        if reservation.date_expiration is None or reservation.date_expiration <= now:
            raise ValidationError({"reservation": "Le délai de réservation a expiré."})
        if reservation.montant_total <= 0:
            raise ValidationError(
                {"reservation": "Le montant doit être positif pour un paiement PayGate."}
            )

        existing = Paiement.objects.filter(
            reservation=reservation,
            statut=Paiement.Statut.EN_ATTENTE,
        ).first()
        if existing:
            return existing

        reservation.date_expiration = now + RESERVATION_HOLD_DURATION
        reservation.save(update_fields=("date_expiration",))

        return Paiement.objects.create(
            reservation=reservation,
            montant=reservation.montant_total,
        )


def apply_verified_paygate_event(
    *,
    paiement_id,
    reference_paygate,
    event_id,
    montant,
    response_data,
    confirmed_at=None,
):
    """Apply provider data only after a PayGate adapter has authenticated it."""
    if not reference_paygate or not event_id:
        raise ValidationError("La référence et l’identifiant d’événement sont requis.")

    with transaction.atomic():
        payment_ref = Paiement.objects.filter(pk=paiement_id).values(
            "reservation_id",
            "reservation__voyage_id",
        ).first()
        if payment_ref is None:
            raise ValidationError({"paiement": "Paiement introuvable."})

        voyage_id = payment_ref["reservation__voyage_id"]
        from voyages.models import Voyage

        reservation = Reservation.objects.select_for_update().get(
            pk=payment_ref["reservation_id"]
        )
        payment = Paiement.objects.select_for_update().get(pk=paiement_id)

        duplicate_event = Paiement.objects.filter(
            cle_evenement_fournisseur=event_id
        ).first()
        if duplicate_event:
            if duplicate_event.pk == payment.pk and payment.statut == Paiement.Statut.CONFIRME:
                return payment
            raise ValidationError({"event_id": "Cet événement a déjà été traité."})

        if payment.statut == Paiement.Statut.CONFIRME:
            if (
                payment.reference_paygate == reference_paygate
                and payment.montant == montant
            ):
                return payment
            raise ValidationError({"paiement": "Ce paiement est déjà confirmé."})
        if payment.statut != Paiement.Statut.EN_ATTENTE:
            raise ValidationError({"paiement": "Ce paiement n’est plus en attente."})
        if reservation.statut != Reservation.Statut.EN_ATTENTE_PAIEMENT:
            raise ValidationError(
                {"reservation": "La réservation n’attend plus un paiement."}
            )
        if reservation.date_expiration is None or reservation.date_expiration <= timezone.now():
            raise ValidationError(
                {"reservation": "La réservation a expiré; le paiement doit être réconcilié."}
            )
        if payment.montant != montant:
            raise ValidationError({"montant": "Le montant confirmé ne correspond pas."})

        payment.reference_paygate = reference_paygate
        payment.cle_evenement_fournisseur = event_id
        payment.reponse_fournisseur = response_data
        payment.date_confirmation = confirmed_at or timezone.now()
        payment.statut = Paiement.Statut.CONFIRME
        payment.save(
            update_fields=(
                "reference_paygate",
                "cle_evenement_fournisseur",
                "reponse_fournisseur",
                "date_confirmation",
                "statut",
            )
        )
        reservation.statut = Reservation.Statut.PAYEE
        reservation.save(update_fields=("statut",))

        for place in PlaceReservee.objects.filter(
            reservation=reservation,
            liberee=False,
        ):
            BilletElectronique.objects.get_or_create(place=place)

        return payment
