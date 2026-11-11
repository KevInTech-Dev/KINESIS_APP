import logging
import secrets
import smtplib
from datetime import timedelta
from email.utils import formataddr

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.exceptions import Throttled, ValidationError

from .models import EmailVerification

logger = logging.getLogger(__name__)


def send_verification_code(user, *, reuse_valid=False):
    now = timezone.now()
    code = f"{secrets.randbelow(1_000_000):06d}"

    with transaction.atomic():
        verification, created = EmailVerification.objects.select_for_update().get_or_create(
            user=user,
            defaults={
                "code_hash": make_password(code),
                "expires_at": now
                + timedelta(seconds=settings.EMAIL_VERIFICATION_CODE_TTL),
                "attempts": 0,
                "window_started_at": now,
                "sends_in_window": 0,
                "last_sent_at": now,
            },
        )
        if not created:
            if (
                reuse_valid
                and verification.expires_at > now
                and verification.attempts < settings.EMAIL_VERIFICATION_MAX_ATTEMPTS
            ):
                return False
            window = timedelta(seconds=settings.EMAIL_VERIFICATION_SEND_WINDOW)
            if now - verification.window_started_at >= window:
                verification.window_started_at = now
                verification.sends_in_window = 0
            if (
                verification.sends_in_window
                >= settings.EMAIL_VERIFICATION_MAX_SENDS_PER_WINDOW
            ):
                wait = max(
                    0,
                    (
                        window
                        - (now - verification.window_started_at)
                    ).total_seconds(),
                )
                raise Throttled(
                    wait=wait,
                    detail=(
                        "Vous avez atteint la limite de 5 codes en 15 minutes. "
                        "Réessayez après le délai indiqué."
                    ),
                )
            verification.code_hash = make_password(code)
            verification.expires_at = now + timedelta(
                seconds=settings.EMAIL_VERIFICATION_CODE_TTL
            )
            verification.attempts = 0
            verification.sends_in_window += 1
            verification.last_sent_at = now
            verification.save()
        else:
            verification.sends_in_window = 1
            verification.save(update_fields=("sends_in_window",))

    name = f"{user.prenoms} {user.nom}".strip() or user.nom
    html_message = render_to_string(
        "utilisateurs/emails/email_verification.html",
        {
            "user_name": name,
            "verification_code": code,
            "expiration_minutes": settings.EMAIL_VERIFICATION_CODE_TTL // 60,
        },
    )
    message = (
        f"Bonjour {name},\n\n"
        f"Votre code de vérification KINESIS est : {code}\n"
        f"Il est valable pendant {settings.EMAIL_VERIFICATION_CODE_TTL // 60} minutes. "
        "Ne le partagez avec personne.\n\n"
        "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.\n\n"
        "L’équipe KINESIS"
    )
    try:
        sent = send_mail(
            "Vérifiez votre adresse e-mail - KINESIS",
            message,
            formataddr((settings.DEFAULT_FROM_NAME, settings.DEFAULT_FROM_EMAIL)),
            [user.email],
            fail_silently=False,
            html_message=html_message,
        )
    except (OSError, smtplib.SMTPException):
        logger.exception("Could not send email verification message.")
        raise ValidationError(
            {"email": "Le code de vérification n’a pas pu être envoyé. Réessayez."}
        )
    if sent != 1:
        raise ValidationError(
            {"email": "Le code de vérification n’a pas pu être envoyé. Réessayez."}
        )
    return True


def verify_email_code(email, code, *, on_company_verified):
    now = timezone.now()
    error = ValidationError(
        {"code": "Code invalide ou expiré. Vérifiez le code reçu ou demandez-en un nouveau."}
    )
    user = None
    with transaction.atomic():
        verification = (
            EmailVerification.objects.select_for_update()
            .select_related("user")
            .filter(
                user__email__iexact=email,
                user__role__in=("VOYAGEUR", "COMPAGNIE"),
            )
            .first()
        )
        if verification and verification.user.role == "COMPAGNIE":
            from compagnies.models import Compagnie

            if not Compagnie.objects.filter(
                pk=verification.user_id,
                statut=Compagnie.Statut.EN_ATTENTE_VERIFICATION_EMAIL,
            ).exists():
                verification = None
        if verification and (
            verification.expires_at <= now
            or verification.attempts >= settings.EMAIL_VERIFICATION_MAX_ATTEMPTS
        ):
            verification = None
        if verification and not check_password(code, verification.code_hash):
            verification.attempts += 1
            verification.save(update_fields=("attempts",))
            verification = None
        elif verification:
            user = verification.user
            user.email_verified = True
            update_fields = ["email_verified"]
            if user.role == "VOYAGEUR":
                user.is_active = True
                update_fields.append("is_active")
            user.save(update_fields=update_fields)
            if user.role == "COMPAGNIE":
                on_company_verified(user=user)
            verification.delete()
    if user is None:
        raise error
    return user
