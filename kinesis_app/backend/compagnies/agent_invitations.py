import logging
import smtplib
import uuid
from email.utils import formataddr
from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.core.signing import BadSignature, SignatureExpired
from django.db import transaction
from django.template.loader import render_to_string
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken

from utilisateurs.models import Utilisateur

from .models import AgentCompagnie

logger = logging.getLogger(__name__)
AGENT_INVITATION_SALT = "compagnies.agent-invitation"


def _invitation_token(user: Utilisateur) -> str:
    return signing.dumps(
        {
            "user_id": str(user.pk),
            "email": user.email,
            "invitation_id": str(user.agent_invitation_id),
        },
        salt=AGENT_INVITATION_SALT,
    )


def send_agent_invitation(agent: AgentCompagnie) -> None:
    user = agent.utilisateur
    user.agent_invitation_id = uuid.uuid4()
    user.save(update_fields=("agent_invitation_id",))

    token = _invitation_token(user)
    activation_url = (
        f"{settings.FRONTEND_BASE_URL.rstrip('/')}/activation-agent?"
        f"{urlencode({'token': token})}"
    )
    message = (
        f"Salut {user.prenoms} {user.nom},\n\n"
        f"La compagnie {agent.compagnie.nom_commercial or agent.compagnie.raison_sociale or 'KINESIS'} "
        "vous invite à rejoindre son espace agent KINESIS.\n\n"
        "Pour choisir votre mot de passe et activer votre compte, ouvrez ce lien "
        f"dans les {settings.AGENT_INVITATION_MAX_AGE // 3600} heures :\n"
        f"{activation_url}\n\n"
        "Si vous n’attendiez pas cette invitation, vous pouvez ignorer cet e-mail.\n\n"
        "L’équipe KINESIS"
    )
    html_message = render_to_string(
        "compagnies/emails/agent_invitation.html",
        {
            "agent_name": f"{user.prenoms} {user.nom}".strip(),
            "company_name": agent.compagnie.nom_commercial
            or agent.compagnie.raison_sociale
            or "KINESIS",
            "activation_url": activation_url,
            "expiration_hours": settings.AGENT_INVITATION_MAX_AGE // 3600,
        },
    )
    try:
        sent = send_mail(
            subject="Votre invitation à rejoindre KINESIS",
            message=message,
            from_email=formataddr(
                (settings.DEFAULT_FROM_NAME, settings.DEFAULT_FROM_EMAIL)
            ),
            recipient_list=[user.email],
            fail_silently=False,
            html_message=html_message,
        )
    except (OSError, smtplib.SMTPException):
        logger.exception("Could not send agent invitation email.")
        raise ValidationError(
            {"email": "L’invitation n’a pas pu être envoyée. Réessayez."}
        )
    if not sent:
        raise ValidationError(
            {"email": "L’invitation n’a pas pu être envoyée. Réessayez."}
        )


def get_agent_from_invitation(token: str) -> AgentCompagnie:
    try:
        payload = signing.loads(
            token,
            salt=AGENT_INVITATION_SALT,
            max_age=settings.AGENT_INVITATION_MAX_AGE,
        )
        user = Utilisateur.objects.select_related("profil_agent__compagnie").get(
            pk=payload["user_id"],
            email=payload["email"],
            role=Utilisateur.Role.AGENT_COMPAGNIE,
            is_active=False,
            agent_invitation_id=payload["invitation_id"],
        )
        if user.has_usable_password():
            raise Utilisateur.DoesNotExist
        return user.profil_agent
    except (
        BadSignature,
        SignatureExpired,
        KeyError,
        TypeError,
        ValueError,
        Utilisateur.DoesNotExist,
        AgentCompagnie.DoesNotExist,
    ):
        raise ValidationError(
            {"token": "Ce lien d’invitation est invalide ou a expiré."}
        )


@transaction.atomic
def resend_agent_invitation(agent: AgentCompagnie) -> None:
    user = agent.utilisateur
    if user.is_active or user.has_usable_password():
        raise ValidationError(
            {"agent": "Cette invitation n’est plus en attente d’activation."}
        )
    send_agent_invitation(agent)


@transaction.atomic
def activate_agent_account(*, token: str, password: str) -> dict[str, str]:
    agent = get_agent_from_invitation(token)
    user = Utilisateur.objects.select_for_update().get(pk=agent.utilisateur_id)
    agent = get_agent_from_invitation(token)
    user.set_password(password)
    user.is_active = True
    user.must_change_password = False
    user.agent_invitation_id = None
    user.save(
        update_fields=(
            "password",
            "is_active",
            "must_change_password",
            "agent_invitation_id",
        )
    )
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}
