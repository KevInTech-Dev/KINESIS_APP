from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.db import transaction
from django.urls import reverse
from rest_framework.exceptions import ValidationError

from .models import Compagnie

ACTIVATION_TOKEN_SALT = "compagnies.activation"


@transaction.atomic
def approve_company(*, company_id, request):
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
    activation_url = request.build_absolute_uri(reverse("company-activate"))
    activation_url = f"{activation_url}?{urlencode({'token': token})}"
    sent = send_mail(
        subject="Activation de votre compte KINESIS",
        message=(
            f"Salut {company.nom_commercial},\n\n"
            "Votre demande d’inscription a été approuvée. "
            "Activez votre compte avec ce lien, valable 24 heures :\n"
            f"{activation_url}\n"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[company.utilisateur.email],
        fail_silently=False,
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
        from_email=settings.DEFAULT_FROM_EMAIL,
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

    company.statut = Compagnie.Statut.DESACTIVE
    company.save(update_fields=("statut",))
    company.utilisateur.is_active = False
    company.utilisateur.save(update_fields=("is_active",))
    return company
