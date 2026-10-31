from .models import Notification


def create_notification(*, utilisateur, type, titre, message):
    return Notification.objects.create(
        utilisateur=utilisateur,
        type=type,
        titre=titre,
        message=message,
    )
