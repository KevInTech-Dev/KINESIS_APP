import secrets
import uuid

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


def generate_payment_reference():
    return f"KIN-{uuid.uuid4().hex[:20].upper()}"


def generate_ticket_code():
    return f"TKT-{uuid.uuid4().hex[:24].upper()}"


def generate_qr_token():
    return secrets.token_urlsafe(32)


class Paiement(models.Model):
    class Statut(models.TextChoices):
        EN_ATTENTE = "EN_ATTENTE", "En attente"
        CONFIRME = "CONFIRME", "Confirmé"
        REJETE = "REJETE", "Rejeté"
        ECHEC = "ECHEC", "Échec"
        REMBOURSE = "REMBOURSE", "Remboursé"

    id_paiement = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    reservation = models.ForeignKey(
        "reservations.Reservation",
        on_delete=models.PROTECT,
        related_name="paiements",
    )
    reference_interne = models.CharField(
        max_length=64,
        unique=True,
        default=generate_payment_reference,
    )
    reference_paygate = models.CharField(
        max_length=128,
        unique=True,
        null=True,
        blank=True,
    )
    montant = models.DecimalField(
        max_digits=12,
        decimal_places=0,
        validators=[MinValueValidator(1)],
    )
    date_creation = models.DateTimeField(default=timezone.now)
    date_confirmation = models.DateTimeField(null=True, blank=True)
    reponse_fournisseur = models.JSONField(null=True, blank=True)
    cle_evenement_fournisseur = models.CharField(
        max_length=128,
        unique=True,
        null=True,
        blank=True,
    )
    statut = models.CharField(
        max_length=20,
        choices=Statut.choices,
        default=Statut.EN_ATTENTE,
    )

    class Meta:
        ordering = ("-date_creation",)
        constraints = [
            models.CheckConstraint(
                condition=Q(montant__gt=0),
                name="paiement_montant_positif",
            ),
            models.UniqueConstraint(
                fields=("reservation",),
                condition=Q(statut="EN_ATTENTE"),
                name="unique_paiement_attente_reservation",
            ),
        ]

    def __str__(self):
        return self.reference_interne


class BilletElectronique(models.Model):
    class Statut(models.TextChoices):
        VALIDE = "VALIDE", "Valide"
        EXPIRE = "EXPIRE", "Expiré"

    id_billet = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    place = models.OneToOneField(
        "reservations.PlaceReservee",
        on_delete=models.PROTECT,
        related_name="billet",
    )
    code_billet = models.CharField(
        max_length=100,
        unique=True,
        default=generate_ticket_code,
    )
    code_qr = models.CharField(
        max_length=255,
        unique=True,
        default=generate_qr_token,
    )
    statut = models.CharField(
        max_length=20,
        choices=Statut.choices,
        default=Statut.VALIDE,
    )
    date_creation = models.DateTimeField(default=timezone.now)
    date_embarquement = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-date_creation",)

    def __str__(self):
        return self.code_billet