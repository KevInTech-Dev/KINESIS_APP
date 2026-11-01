import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    class Type(models.TextChoices):
        RESERVATION = "RESERVATION", "Réservation"
        PAIEMENT = "PAIEMENT", "Paiement"
        BILLET = "BILLET", "Billet"
        VOYAGE = "VOYAGE", "Voyage"
        BAGAGE = "BAGAGE", "Bagage"

    id_notification = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    utilisateur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    titre = models.CharField(max_length=120)
    message = models.TextField()
    date_lecture = models.DateTimeField(null=True, blank=True)
    date_creation = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-date_creation",)
        indexes = [
            models.Index(
                fields=("utilisateur", "date_lecture", "date_creation"),
                name="notif_user_read_date_idx",
            ),
        ]

    @property
    def lue(self):
        return self.date_lecture is not None

    def __str__(self):
        return f"{self.titre} - utilisateur {self.utilisateur_id}"
