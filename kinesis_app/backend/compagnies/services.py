from email.utils import formataddr
from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from reservations.models import Reservation
from reservations.services import filter_active_reservations
from voyages.models import Voyage

from .models import Compagnie

ACTIVATION_TOKEN_SALT = "compagnies.activation"


def _sender_address():
    return formataddr((settings.DEFAULT_FROM_NAME, settings.DEFAULT_FROM_EMAIL))


@transaction.atomic
def approve_company(*, company_id):
    try:
        company = (
            Compagnie.objects.select_for_update()
            .select_related("utilisateur")
            .get(pk=company_id)
        )
    except Compagnie.DoesNotExist:
        raise ValidationError({"compagnie": "Compagnie introuvable."})
    if company.statut != Compagnie.Statut.EN_ATTENTE_VALIDATION:
        raise ValidationError(
            {"compagnie": "Cette compagnie n’est plus en attente de validation."}
        )

    token = signing.dumps(
        {"compagnie_id": str(company.pk)},
        salt=ACTIVATION_TOKEN_SALT,
    )
    activation_url = (
        f"{settings.FRONTEND_BASE_URL.rstrip('/')}/activation-compagnie"
        f"?{urlencode({'token': token})}"
    )
    html_message = render_to_string(
        "compagnies/emails/company_activation.html",
        {
            "company_name": company.nom_commercial,
            "activation_url": activation_url,
        },
    )
    sent = send_mail(
        subject="Activation de votre compte KINESIS",
        message=(
            f"Salut {company.nom_commercial},\n\n"
            "Votre demande d’inscription a été approuvée. "
            "Cliquez sur le lien ci-dessous pour activer votre compte "
            "dans les prochaines 24 heures :\n"
            "Activer mon compte KINESIS :\n"
            f"{activation_url}\n"
            "\nSi le bouton ne fonctionne pas, copiez le lien ci-dessus "
            "et collez-le dans votre navigateur.\n\n"
            "Si vous n’êtes pas à l’origine de cette demande, ignorez "
            "simplement cet e-mail.\n\n"
            "L’équipe KINESIS"
        ),
        from_email=_sender_address(),
        recipient_list=[company.utilisateur.email],
        fail_silently=False,
        html_message=html_message,
    )
    if not sent:
        raise ValidationError(
            {"email": "Le lien d’activation n’a pas pu être envoyé."}
        )

    company.statut = Compagnie.Statut.EN_ATTENTE_ACTIVATION
    company.save(update_fields=("statut",))
    return company


@transaction.atomic
def refuse_company(*, company_id):
    try:
        company = (
            Compagnie.objects.select_for_update()
            .select_related("utilisateur")
            .get(pk=company_id)
        )
    except Compagnie.DoesNotExist:
        raise ValidationError({"compagnie": "Compagnie introuvable."})
    if company.statut not in (
        Compagnie.Statut.EN_ATTENTE_VALIDATION,
        Compagnie.Statut.EN_ATTENTE_ACTIVATION,
    ):
        raise ValidationError(
            {"compagnie": "Cette compagnie ne peut plus être refusée."}
        )

    sent = send_mail(
        subject="Suite à votre demande d’inscription KINESIS",
        message=(
            f"Salut {company.nom_commercial},\n\n"
            "Après examen de votre demande d’inscription, nous ne pouvons "
            "pas donner suite à la création de votre compte compagnie.\n"
        ),
        from_email=_sender_address(),
        recipient_list=[company.utilisateur.email],
        fail_silently=False,
    )
    if not sent:
        raise ValidationError({"email": "L’avis de refus n’a pas pu être envoyé."})

    company.statut = Compagnie.Statut.REFUSEE
    company.save(update_fields=("statut",))
    company.utilisateur.is_active = False
    company.utilisateur.save(update_fields=("is_active",))
    return company


@transaction.atomic
def deactivate_company(*, company_id):
    try:
        company = (
            Compagnie.objects.select_for_update()
            .select_related("utilisateur")
            .get(pk=company_id)
        )
    except Compagnie.DoesNotExist:
        raise ValidationError({"compagnie": "Compagnie introuvable."})
    if company.statut != Compagnie.Statut.ACTIVE:
        raise ValidationError({"compagnie": "Cette compagnie n’est pas active."})

    now = timezone.now()
    local_now = timezone.localtime(now)
    upcoming_trips = Voyage.objects.filter(
        compagnie=company,
        date_depart_effective__isnull=True,
        date_depart__gte=local_now.date(),
    )
    active_reservations = filter_active_reservations(
        Reservation.objects.filter(voyage__in=upcoming_trips),
        now=now,
    )
    if active_reservations.exists():
        raise ValidationError(
            {
                "compagnie": (
                    "Cette compagnie a des réservations actives ou payées sur "
                    "des trajets à venir. Leur prise en charge est nécessaire "
                    "avant la désactivation."
                )
            }
        )

    company.statut = Compagnie.Statut.DESACTIVE
    company.save(update_fields=("statut",))
    company.utilisateur.is_active = False
    company.utilisateur.save(update_fields=("is_active",))
    return company
