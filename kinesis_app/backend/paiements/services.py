from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import PermissionDenied, ValidationError

from compagnies.models import AgentCompagnie, Compagnie, PermissionAgent
from notifications.models import Notification
from notifications.services import notify_company_and_agents
from reservations.models import PlaceReservee, Reservation
from reservations.services import RESERVATION_HOLD_DURATION, expire_overdue_reservations
from utilisateurs.models import Utilisateur
from voyages.models import Voyage

from .fedapay import create_payment_link, create_transaction
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
                {
                    "reservation": "Le montant doit être positif pour un paiement FedaPay."
                }
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


def create_fedapay_checkout(*, paiement_id):
    with transaction.atomic():
        payment = (
            Paiement.objects.select_for_update()
            .select_related("reservation__voyageur")
            .get(pk=paiement_id)
        )
        if payment.statut != Paiement.Statut.EN_ATTENTE:
            raise ValidationError({"paiement": "Ce paiement n’est plus en attente."})
        if not payment.reference_fedapay:
            payment.reference_fedapay = create_transaction(payment)
            payment.save(update_fields=("reference_fedapay",))
        transaction_id = payment.reference_fedapay

    return payment, create_payment_link(transaction_id)


def _sanitize_fedapay_response(provider_transaction):
    allowed_fields = (
        "id",
        "reference",
        "status",
        "amount",
        "currency_id",
        "approved_at",
        "canceled_at",
        "declined_at",
    )
    return {
        key: provider_transaction[key]
        for key in allowed_fields
        if key in provider_transaction
    }


def _reconcile_mismatched_fedapay_payment(*, payment, provider_transaction):
    event_id = f"transaction.approved:{payment.reference_fedapay}"
    confirmed_at = parse_datetime(provider_transaction.get("approved_at") or "")
    confirmation_time = confirmed_at or timezone.now()
    with transaction.atomic():
        reservation = Reservation.objects.select_for_update().get(
            paiements__pk=payment.pk,
        )
        payment = Paiement.objects.select_for_update().get(pk=payment.pk)
        if payment.statut in (
            Paiement.Statut.CONFIRME,
            Paiement.Statut.A_RECONCILIER,
        ):
            return payment

        if (
            reservation.statut == Reservation.Statut.EN_ATTENTE_PAIEMENT
            and reservation.date_expiration is not None
            and confirmation_time >= reservation.date_expiration
        ):
            reservation.statut = Reservation.Statut.EXPIREE
            reservation.save(update_fields=("statut",))
            PlaceReservee.objects.filter(
                reservation=reservation,
                liberee=False,
            ).update(liberee=True)

        payment.statut = Paiement.Statut.A_RECONCILIER
        payment.cle_evenement_fournisseur = event_id
        payment.reponse_fournisseur = _sanitize_fedapay_response(provider_transaction)
        payment.date_confirmation = confirmation_time
        payment.save(
            update_fields=(
                "statut",
                "cle_evenement_fournisseur",
                "reponse_fournisseur",
                "date_confirmation",
            )
        )
        Notification.objects.create(
            utilisateur=reservation.voyageur,
            type=Notification.Type.PAIEMENT,
            titre="Paiement à réconcilier",
            message=(
                f"FedaPay a confirmé un montant différent pour la réservation "
                f"{reservation.reference}. Aucun billet n’a été émis. Le paiement "
                "doit être vérifié manuellement."
            ),
        )
        notify_company_and_agents(
            company=reservation.voyage.compagnie,
            type=Notification.Type.PAIEMENT,
            titre="Paiement à réconcilier",
            message=(
                f"Le paiement de la réservation {reservation.reference} est à "
                "réconcilier manuellement."
            ),
        )
    return payment


def apply_verified_fedapay_event(
    *,
    paiement_id,
    reference_fedapay,
    event_id,
    montant,
    response_data,
    confirmed_at=None,
):
    """Apply provider data only after its signature and transaction are verified."""
    if not reference_fedapay or not event_id:
        raise ValidationError("La référence et l’identifiant d’événement sont requis.")

    with transaction.atomic():
        reservation = Reservation.objects.select_for_update().get(
            paiements__pk=paiement_id,
        )
        payment = Paiement.objects.select_for_update().get(pk=paiement_id)
        if payment.reference_fedapay != reference_fedapay:
            raise ValidationError(
                {"reference_fedapay": "La référence FedaPay ne correspond pas."}
            )

        duplicate_event = Paiement.objects.filter(
            cle_evenement_fournisseur=event_id
        ).first()
        if duplicate_event:
            if duplicate_event.pk == payment.pk and payment.statut in (
                Paiement.Statut.CONFIRME,
                Paiement.Statut.A_RECONCILIER,
            ):
                return payment
            raise ValidationError({"event_id": "Cet événement a déjà été traité."})

        if payment.statut == Paiement.Statut.CONFIRME:
            if (
                payment.reference_fedapay == reference_fedapay
                and payment.montant == montant
            ):
                return payment
            raise ValidationError({"paiement": "Ce paiement est déjà confirmé."})
        if payment.montant != montant:
            raise ValidationError({"montant": "Le montant confirmé ne correspond pas."})

        if payment.statut in (
            Paiement.Statut.CONFIRME,
            Paiement.Statut.A_RECONCILIER,
        ):
            return payment

        now = timezone.now()
        confirmation_time = confirmed_at or now
        reservation_expired = (
            reservation.date_expiration is None
            or confirmation_time >= reservation.date_expiration
            or reservation.statut != Reservation.Statut.EN_ATTENTE_PAIEMENT
        )
        if payment.statut != Paiement.Statut.EN_ATTENTE or reservation_expired:
            if (
                reservation.statut == Reservation.Statut.EN_ATTENTE_PAIEMENT
                and reservation.date_expiration is not None
                and confirmation_time >= reservation.date_expiration
            ):
                reservation.statut = Reservation.Statut.EXPIREE
                reservation.save(update_fields=("statut",))
                PlaceReservee.objects.filter(
                    reservation=reservation,
                    liberee=False,
                ).update(liberee=True)

            payment.statut = Paiement.Statut.A_RECONCILIER
            payment.cle_evenement_fournisseur = event_id
            payment.reponse_fournisseur = _sanitize_fedapay_response(response_data)
            payment.date_confirmation = confirmation_time
            payment.save(
                update_fields=(
                    "statut",
                    "cle_evenement_fournisseur",
                    "reponse_fournisseur",
                    "date_confirmation",
                )
            )
            Notification.objects.create(
                utilisateur=reservation.voyageur,
                type=Notification.Type.PAIEMENT,
                titre="Paiement à réconcilier",
                message=(
                    f"FedaPay a confirmé le paiement de la réservation "
                    f"{reservation.reference}, mais celle-ci n’est plus valide. "
                    "Aucun billet n’a été émis. Le paiement doit être vérifié "
                    "manuellement."
                ),
            )
            notify_company_and_agents(
                company=reservation.voyage.compagnie,
                type=Notification.Type.PAIEMENT,
                titre="Paiement à réconcilier",
                message=(
                    f"Le paiement de la réservation {reservation.reference} est "
                    "confirmé, mais la réservation n’est plus valide."
                ),
            )
            return payment

        payment.cle_evenement_fournisseur = event_id
        payment.reponse_fournisseur = _sanitize_fedapay_response(response_data)
        payment.date_confirmation = confirmation_time
        payment.statut = Paiement.Statut.CONFIRME
        payment.save(
            update_fields=(
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
        notify_company_and_agents(
            company=reservation.voyage.compagnie,
            type=Notification.Type.RESERVATION,
            titre="Nouvelle réservation payée",
            message=(
                f"La réservation {reservation.reference} est confirmée pour le "
                f"voyage {reservation.voyage.ville_depart} - "
                f"{reservation.voyage.ville_arrivee}."
            ),
            any_agent_permissions=(
                PermissionAgent.Code.ENREGISTRER_BAGAGE,
                PermissionAgent.Code.CONSULTER_BAGAGES,
            ),
        )
        return payment


def sync_fedapay_transaction(*, payment, provider_transaction):
    if str(provider_transaction.get("id")) != payment.reference_fedapay:
        raise ValidationError(
            {"transaction": "La transaction FedaPay ne correspond pas au paiement."}
        )

    try:
        amount = Decimal(str(provider_transaction["amount"]))
    except (KeyError, InvalidOperation, TypeError, ValueError) as error:
        raise ValidationError(
            {"transaction": "Le montant de la transaction FedaPay est invalide."}
        ) from error
    status = provider_transaction.get("status")
    if amount != payment.montant:
        if status == "approved":
            return _reconcile_mismatched_fedapay_payment(
                payment=payment,
                provider_transaction=provider_transaction,
            )
        raise ValidationError(
            {"transaction": "Le montant confirmé ne correspond pas au paiement."}
        )

    if status not in ("approved", "declined", "canceled"):
        return payment

    event_id = f"transaction.{status}:{payment.reference_fedapay}"
    if status == "approved":
        confirmed_at = parse_datetime(
            provider_transaction.get("approved_at") or "",
        )
        return apply_verified_fedapay_event(
            paiement_id=payment.pk,
            reference_fedapay=payment.reference_fedapay,
            event_id=event_id,
            montant=amount,
            response_data=provider_transaction,
            confirmed_at=confirmed_at,
        )

    with transaction.atomic():
        payment = Paiement.objects.select_for_update().get(pk=payment.pk)
        if payment.statut != Paiement.Statut.EN_ATTENTE:
            return payment
        payment.statut = (
            Paiement.Statut.REJETE if status == "declined" else Paiement.Statut.ECHEC
        )
        payment.cle_evenement_fournisseur = event_id
        payment.reponse_fournisseur = _sanitize_fedapay_response(provider_transaction)
        payment.save(
            update_fields=(
                "statut",
                "cle_evenement_fournisseur",
                "reponse_fournisseur",
            )
        )
        Notification.objects.create(
            utilisateur=payment.reservation.voyageur,
            type=Notification.Type.PAIEMENT,
            titre="Paiement non confirmé",
            message=(
                f"Le paiement de la réservation {payment.reservation.reference} "
                "n’a pas été confirmé. Vérifiez son statut avant de réessayer."
            ),
        )
    return payment


def refresh_fedapay_payment(*, payment):
    from .fedapay import retrieve_transaction

    provider_transaction = retrieve_transaction(payment.reference_fedapay)
    return sync_fedapay_transaction(
        payment=payment,
        provider_transaction=provider_transaction,
    )


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


def _validate_boarding_ticket(ticket):
    reservation = ticket.place.reservation
    if reservation.voyage.statut == Voyage.Statut.ARCHIVE:
        raise ValidationError({"code_qr": "Le voyage associé à ce billet est archivé."})
    if reservation.statut != Reservation.Statut.PAYEE:
        raise ValidationError({"code_qr": "Le billet n’est pas payé."})
    if ticket.statut == BilletElectronique.Statut.EMBARQUE:
        raise ValidationError({"code_qr": "Ce billet a déjà été utilisé."})
    if ticket.statut == BilletElectronique.Statut.NON_UTILISE:
        raise ValidationError(
            {"code_qr": "Ce billet n’a pas été utilisé avant le départ réel."}
        )
    if ticket.statut != BilletElectronique.Statut.VALIDE:
        raise ValidationError({"code_qr": "Le billet est expiré ou invalide."})
    if ticket.date_embarquement is not None:
        raise ValidationError({"code_qr": "Ce billet a déjà été utilisé."})

    if reservation.voyage.date_depart_effective is not None:
        raise ValidationError({"code_qr": "Le voyage a déjà quitté la gare."})


def scan_ticket(*, actor, code_qr):
    company = _company_for_ticket_permission(
        actor,
        PermissionAgent.Code.SCANNER_BILLET,
    )
    ticket = _get_ticket_for_company(code_qr=code_qr, company=company)
    _validate_boarding_ticket(ticket)
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
        ticket = _get_ticket_for_company(code_qr=code_qr, company=company)
        voyage = Voyage.objects.select_for_update().get(
            pk=ticket.place.reservation.voyage_id,
        )
        ticket = _get_ticket_for_company(
            code_qr=code_qr,
            company=company,
            lock=True,
        )
        _validate_boarding_ticket(ticket)
        if timezone.localtime(now).date() < voyage.date_depart:
            raise ValidationError(
                {"code_qr": "L’embarquement n’est pas encore ouvert pour ce voyage."}
            )
        ticket.date_embarquement = now
        ticket.embarque_par = actor
        ticket.statut = BilletElectronique.Statut.EMBARQUE
        ticket.save(update_fields=("statut", "date_embarquement", "embarque_par"))
        reservation = ticket.place.reservation
        Notification.objects.create(
            utilisateur=reservation.voyageur,
            type=Notification.Type.BILLET,
            titre="Embarquement confirmé",
            message=(
                f"L’embarquement de {ticket.place.nom_passager} pour la "
                f"réservation {reservation.reference} a été enregistré."
            ),
        )
        notify_company_and_agents(
            company=company,
            type=Notification.Type.BILLET,
            titre="Embarquement validé",
            message=(
                f"L’embarquement de {ticket.place.nom_passager} "
                f"(réservation {reservation.reference}) a été validé."
            ),
            required_agent_permissions=(
                PermissionAgent.Code.SCANNER_BILLET,
                PermissionAgent.Code.VALIDER_EMBARQUEMENT,
            ),
            exclude_user=actor,
        )
        return ticket


def register_voyage_departure(*, actor, voyage_id, now=None):
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
        voyage = (
            Voyage.objects.select_for_update()
            .filter(pk=voyage_id, compagnie=company)
            .first()
        )
        if voyage is None:
            raise ValidationError({"voyage": "Voyage introuvable ou hors périmètre."})
        if voyage.statut == Voyage.Statut.ARCHIVE:
            raise ValidationError(
                {"voyage": "Un voyage archivé ne peut pas être déclaré parti."}
            )
        if voyage.date_depart_effective is not None:
            return voyage, 0
        if timezone.localtime(now).date() < voyage.date_depart:
            raise ValidationError(
                {
                    "voyage": "Le départ réel ne peut pas être enregistré avant le jour prévu."
                }
            )

        voyage.date_depart_effective = now
        voyage.depart_effectue_par = actor
        voyage.statut = Voyage.Statut.EXPIREE
        voyage.save(
            update_fields=("date_depart_effective", "depart_effectue_par", "statut")
        )
        expired_count = expire_unused_tickets_after_departure(
            now=now,
            voyage_id=voyage.pk,
        )
        notify_company_and_agents(
            company=company,
            type=Notification.Type.VOYAGE,
            titre="Départ réel enregistré",
            message=(
                f"Le départ réel du voyage {voyage.ville_depart} - "
                f"{voyage.ville_arrivee} a été enregistré."
            ),
            required_agent_permissions=(
                PermissionAgent.Code.SCANNER_BILLET,
                PermissionAgent.Code.VALIDER_EMBARQUEMENT,
            ),
            exclude_user=actor,
        )
        return voyage, expired_count


@transaction.atomic
def expire_unused_tickets_after_departure(*, now=None, voyage_id=None):
    now = now or timezone.now()
    tickets = BilletElectronique.objects.filter(
        statut=BilletElectronique.Statut.VALIDE,
        date_embarquement__isnull=True,
        place__reservation__statut=Reservation.Statut.PAYEE,
        place__reservation__voyage__date_depart_effective__lte=now,
    )
    if voyage_id is not None:
        tickets = tickets.filter(place__reservation__voyage_id=voyage_id)
    affected_reservations = list(
        tickets.values(
            "place__reservation__voyageur_id",
            "place__reservation__reference",
        )
        .annotate(ticket_count=Count("pk"))
    )
    updated_count = tickets.update(statut=BilletElectronique.Statut.NON_UTILISE)
    for reservation in affected_reservations:
        Notification.objects.create(
            utilisateur_id=reservation["place__reservation__voyageur_id"],
            type=Notification.Type.BILLET,
            titre="Billet non utilisé",
            message=(
                f"{reservation['ticket_count']} billet(s) de la réservation "
                f"{reservation['place__reservation__reference']} sont passés "
                "à NON_UTILISE après le départ réel du bus."
            ),
        )
    return updated_count
