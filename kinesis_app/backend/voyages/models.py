import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower


class Ville(models.Model):
    id_ville = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    nom = models.CharField(max_length=120)

    class Meta:
        ordering = ("nom",)
        constraints = [
            models.UniqueConstraint(
                Lower("nom"),
                name="unique_ville_nom_insensible_casse",
            ),
        ]

    def save(self, *args, **kwargs):
        self.nom = " ".join(self.nom.split())
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nom


class Voyage(models.Model):
    class Statut(models.TextChoices):
        PUBLIE = "PUBLIE", "Publié"
        ARCHIVE = "ARCHIVE", "Archivé"
        EXPIREE = "EXPIREE", "Expiré"
        ANNULEE = "ANNULEE", "Annulé"

    id_voyage = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    compagnie = models.ForeignKey(
        "compagnies.Compagnie",
        on_delete=models.PROTECT,
        related_name="voyages",
    )
    ville_depart = models.ForeignKey(
        Ville,
        on_delete=models.PROTECT,
        related_name="voyages_depart",
    )
    ville_arrivee = models.ForeignKey(
        Ville,
        on_delete=models.PROTECT,
        related_name="voyages_arrivee",
    )
    date_depart = models.DateField()
    heure_depart = models.TimeField()
    place_totale = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    prix = models.DecimalField(
        max_digits=12,
        decimal_places=0,
        validators=[MinValueValidator(0)],
    )
    image = models.ImageField(upload_to="voyages/", blank=True, null=True)
    statut = models.CharField(
        max_length=20,
        choices=Statut.choices,
        default=Statut.PUBLIE,
    )

    class Meta:
        ordering = ("date_depart", "heure_depart")
        constraints = [
            models.CheckConstraint(
                condition=Q(place_totale__gt=0),
                name="voyage_places_total_positive",
            ),
            models.CheckConstraint(
                condition=Q(prix__gte=0),
                name="voyage_prix_non_negatif",
            ),
            models.CheckConstraint(
                condition=~Q(ville_depart=F("ville_arrivee")),
                name="voyage_villes_depart_arrivee_distinctes",
            ),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.ville_depart_id and self.ville_depart_id == self.ville_arrivee_id:
            raise ValidationError(
                {"ville_arrivee": "La ville d’arrivée doit différer du départ."}
            )

    def __str__(self):
        return f"{self.ville_depart} - {self.ville_arrivee} ({self.date_depart})"