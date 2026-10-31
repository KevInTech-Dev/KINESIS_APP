from datetime import datetime

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from compagnies.models import AgentCompagnie, Compagnie, PermissionAgent
from notifications.models import Notification
from reservations.models import PlaceReservee, Reservation
from reservations.services import RESERVATION_HOLD_DURATION, expire_overdue_reservations
from utilisateurs.models import Utilisateur

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

        Notification.objects.create(
            utilisateur=reservation.voyageur,
            type=Notification.Type.PAIEMENT,
            titre="Paiement confirmé",
            message=(
                f"Votre réservation {reservation.reference} est confirmée. "
                "Vos billets sont disponibles."
            ),
        )
        return payment


def _company_for_ticket_permission(actor, permission):
    if not actor or not actor.is_authenticated:
        raise PermissionDenied("Authentification requise.")
    if actor.role != Utilisateur.Role.AGENT_COMPAGNIE:
        raise PermissionDenied("Cette action est réservée aux agents.")
    if actor.must_change_password:
        raise PermissionDenied("Le mot de passe provisoire doit être changé.")

    try:
        agent = actor.profil_agent
    except AgentCompagnie.DoesNotExist:
        raise PermissionDenied("Profil agent introuvable.")

    if agent.compagnie.statut != Compagnie.Statut.ACTIVE:
        raise PermissionDenied("La compagnie n’est pas active.")
    if not agent.permissions.filter(permission=permission).exists():
        raise PermissionDenied("Permission agent manquante.")
    return agent.compagnie


def _get_ticket_for_company(*, code_qr, company, lock=False):
    tickets = BilletElectronique.objects.select_related(
        "place__reservation__voyage__compagnie",
        "place__reservation__voyage__ville_depart",
        "place__reservation__voyage__ville_arrivee",
        "place__reservation",
    )
    if lock:
        tickets = tickets.select_for_update()
    ticket = tickets.filter(
        code_qr=code_qr,
        place__reservation__voyage__compagnie=company,
    ).first()
    if ticket is None:
        raise ValidationError({"code_qr": "Billet invalide ou hors périmètre."})
    return ticket


def _validate_boarding_ticket(ticket, now):
    reservation = ticket.place.reservation
    if reservation.statut != Reservation.Statut.PAYEE:
        raise ValidationError({"code_qr": "Le billet n’est pas payé."})
    if ticket.statut != BilletElectronique.Statut.VALIDE:
        raise ValidationError({"code_qr": "Le billet est expiré ou invalide."})
    if ticket.date_embarquement is not None:
        raise ValidationError({"code_qr": "Ce billet a déjà été utilisé."})

    voyage = reservation.voyage
    departure = timezone.make_aware(
        datetime.combine(voyage.date_depart, voyage.heure_depart),
        timezone.get_current_timezone(),
    )
    if departure <= now:
        raise ValidationError({"code_qr": "Le billet de ce voyage est expiré."})


def scan_ticket(*, actor, code_qr, now=None):
    company = _company_for_ticket_permission(
        actor,
        PermissionAgent.Code.SCANNER_BILLET,
    )
    ticket = _get_ticket_for_company(code_qr=code_qr, company=company)
    _validate_boarding_ticket(ticket, now or timezone.now())
    return ticket


def validate_ticket_boarding(*, actor, code_qr, now=None):
    company = _company_for_ticket_permission(
        actor,
        PermissionAgent.Code.SCANNER_BILLET,
    )
    _company_for_ticket_permission(
        actor,
        PermissionAgent.Code.VALIDER_EMBARQUEMENT,
    )
    now = now or timezone.now()

    with transaction.atomic():
        ticket = _get_ticket_for_company(
            code_qr=code_qr,
            company=company,
            lock=True,
        )
        _validate_boarding_ticket(ticket, now)
        ticket.date_embarquement = now
        ticket.embarque_par = actor
        ticket.save(update_fields=("date_embarquement", "embarque_par"))
        return ticket
