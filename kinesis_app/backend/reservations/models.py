import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Reservation(models.Model):
    class Statut(models.TextChoices):
        EN_ATTENTE_PAIEMENT = "EN_ATTENTE_PAIEMENT", "En attente de paiement"
        PAYEE = "PAYEE", "Payée"
        EXPIREE = "EXPIREE", "Expirée"
        ANNULEE = "ANNULEE", "Annulée"

    id_reservation = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    reference = models.CharField(max_length=50, unique=True)
    voyageur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    voyage = models.ForeignKey(
        "voyages.Voyage",
        on_delete=models.PROTECT,
        related_name="reservations",
    )
    date_reservation = models.DateTimeField(default=timezone.now)
    date_expiration = models.DateTimeField(null=True, blank=True)
    montant_total = models.DecimalField(
        max_digits=12,
        decimal_places=0,
        validators=[MinValueValidator(0)],
    )
    statut = models.CharField(
        max_length=30,
        choices=Statut.choices,
        default=Statut.EN_ATTENTE_PAIEMENT,
    )

    class Meta:
        ordering = ("-date_reservation",)
        indexes = [
            models.Index(
                fields=("statut", "date_expiration"),
                name="reservation_statut_exp_idx",
            ),
        ]

    def __str__(self):
        return self.reference


class PlaceReservee(models.Model):
    id_place = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    reservation = models.ForeignKey(
        Reservation,
        on_delete=models.CASCADE,
        related_name="places",
    )
    voyage = models.ForeignKey(
        "voyages.Voyage",
        on_delete=models.PROTECT,
        related_name="places_reservees",
    )
    numero_siege = models.CharField(max_length=30)
    nom_passager = models.CharField(max_length=150)
    liberee = models.BooleanField(default=False)

    class Meta:
        ordering = ("numero_siege",)
        constraints = [
            models.UniqueConstraint(
                fields=("voyage", "numero_siege"),
                condition=Q(liberee=False),
                name="unique_siege_voyage_actif",
            ),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.reservation_id and self.voyage_id:
            if self.reservation.voyage_id != self.voyage_id:
                raise ValidationError(
                    {"voyage": "Le voyage doit correspondre à la réservation."}
                )

    def __str__(self):
        return f"{self.numero_siege} - {self.nom_passager}"