import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from compagnies.models import Compagnie

from .storage import AuthenticatedBagageStorage


class TarifBagage(models.Model):
    id_tarif = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    compagnie = models.ForeignKey(
        Compagnie,
        on_delete=models.CASCADE,
        related_name="tarifs_bagages",
    )
    poids_min = models.DecimalField(
        max_digits=7,
        decimal_places=0,
        validators=[MinValueValidator(0)],
    )
    poids_max = models.DecimalField(
        max_digits=7,
        decimal_places=0,
        validators=[MinValueValidator(1)],
    )
    prix = models.DecimalField(
        max_digits=10,
        decimal_places=0,
        validators=[MinValueValidator(0)],
    )
    date_creation = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ("-date_creation", "poids_min")
        constraints = [
            models.CheckConstraint(
                condition=Q(poids_min__gte=0),
                name="tarif_poids_min_non_negatif",
            ),
            models.CheckConstraint(
                condition=Q(poids_max__gt=F("poids_min")),
                name="tarif_poids_max_superieur_min",
            ),
            models.CheckConstraint(
                condition=Q(prix__gte=0),
                name="tarif_prix_non_negatif",
            ),
        ]

    def __str__(self):
        return f"{self.compagnie} - {self.poids_min} à {self.poids_max} kg"


class Bagage(models.Model):
    class Statut(models.TextChoices):
        ENREGISTRE = "ENREGISTRE", "Enregistré"
        RESTITUE = "RESTITUE", "Restitué"

    id_bagage = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    reservation = models.ForeignKey(
        "reservations.Reservation",
        on_delete=models.PROTECT,
        related_name="bagages",
    )
    description = models.TextField(blank=True)
    poids = models.DecimalField(
        max_digits=7,
        decimal_places=0,
        validators=[MinValueValidator(0)],
    )
    tarif_applique = models.ForeignKey(
        TarifBagage,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="bagages",
    )
    poids_min_applique = models.DecimalField(
        max_digits=7,
        decimal_places=0,
        null=True,
        blank=True,
    )
    poids_max_applique = models.DecimalField(
        max_digits=7,
        decimal_places=0,
        null=True,
        blank=True,
    )
    prix_tarif_applique = models.DecimalField(
        max_digits=10,
        decimal_places=0,
        null=True,
        blank=True,
    )
    tarif_special = models.BooleanField(default=False)
    motif_tarif_special = models.CharField(max_length=255, blank=True)
    frais_total = models.DecimalField(
        max_digits=10,
        decimal_places=0,
        default=0,
        validators=[MinValueValidator(0)],
    )
    frais_payes = models.BooleanField(default=False)
    date_paiement_frais = models.DateTimeField(null=True, blank=True)
    paiement_enregistre_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="paiements_frais_bagages_enregistres",
    )
    statut = models.CharField(
        max_length=20,
        choices=Statut.choices,
        default=Statut.ENREGISTRE,
    )
    date_restitution = models.DateTimeField(null=True, blank=True)
    restitue_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="bagages_restitues",
    )
    enregistre_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="bagages_enregistres",
    )
    date_creation = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-date_creation",)
        constraints = [
            models.CheckConstraint(
                condition=Q(poids__gte=0),
                name="bagage_poids_non_negatif",
            ),
            models.CheckConstraint(
                condition=Q(frais_total__gte=0),
                name="bagage_frais_non_negatifs",
            ),
        ]

    def __str__(self):
        return f"Bagage de {self.reservation.reference}"


class PhotoBagage(models.Model):
    id_photobagage = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    bagage = models.ForeignKey(
        Bagage,
        on_delete=models.CASCADE,
        related_name="photos",
    )
    image = models.ImageField(
        storage=AuthenticatedBagageStorage(),
        upload_to="bagages/",
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("created_at",)

    def __str__(self):
        return f"Photo de {self.bagage_id}"
