from .models import Notification


def create_notification(*, utilisateur, type, titre, message):
    return Notification.objects.create(
        utilisateur=utilisateur,
        type=type,
        titre=titre,
        message=message,
    )


def notify_company_and_agents(
    *,
    company,
    type,
    titre,
    message,
    any_agent_permissions=(),
    required_agent_permissions=(),
    exclude_user=None,
):
    agent_users = company.agents.filter(utilisateur__is_active=True)
    if any_agent_permissions:
        agent_users = agent_users.filter(
            permissions__permission__in=any_agent_permissions
        )
    for permission in required_agent_permissions:
        agent_users = agent_users.filter(permissions__permission=permission)

    recipient_ids = set(agent_users.values_list("utilisateur_id", flat=True))
    if company.utilisateur.is_active:
        recipient_ids.add(company.utilisateur_id)
    if exclude_user is not None:
        recipient_ids.discard(exclude_user.pk)
    if not recipient_ids:
        return 0

    return len(
        Notification.objects.bulk_create(
            [
                Notification(
                    utilisateur_id=user_id,
                    type=type,
                    titre=titre,
                    message=message,
                )
                for user_id in recipient_ids
            ]
        )
    )
