import re

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

from .storage import AuthenticatedCompanyDocumentStorage

nif_validator = RegexValidator(
    regex=r"^[0-9]{1,10}$",
    message="Le NIF doit contenir au maximum 10 chiffres, sans espace.",
)
rccm_validator = RegexValidator(
    regex=r"^TG-[A-Za-z0-9-]+$",
    message="Le RCCM doit commencer par TG- et contenir uniquement des lettres, chiffres et tirets.",
    flags=re.IGNORECASE | re.ASCII,
)


class Compagnie(models.Model):
    class Statut(models.TextChoices):
        EN_ATTENTE_VALIDATION = "EN_ATTENTE_VALIDATION", "En attente de validation"
        EN_ATTENTE_ACTIVATION = "EN_ATTENTE_ACTIVATION", "En attente d’activation"
        ACTIVE = "ACTIVE", "Active"
        DESACTIVE = "DESACTIVE", "Désactivée"
        REFUSEE = "REFUSEE", "Refusée"

    utilisateur = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="profil_compagnie",
    )
    raison_sociale = models.CharField(max_length=150, blank=True, null=True)
    nom_commercial = models.CharField(max_length=150, blank=True, null=True)
    nif = models.CharField(
        max_length=10,
        unique=True,
        validators=[nif_validator],
        blank=True,
        null=True,
    )
    rccm = models.CharField(
        max_length=50,
        unique=True,
        validators=[rccm_validator],
        blank=True,
        null=True,
    )
    telephone_secondaire = models.CharField(max_length=30, blank=True)
    logo = models.ImageField(upload_to="compagnies/logos/", blank=True, null=True)
    carte_cfe = models.ImageField(
        upload_to="compagnies/documents/",
        storage=AuthenticatedCompanyDocumentStorage(),
        blank=True,
        null=True,
    )
    piece_identite_gerant = models.ImageField(
        upload_to="compagnies/documents/",
        storage=AuthenticatedCompanyDocumentStorage(),
        blank=True,
        null=True,
    )
    description = models.TextField(blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    statut = models.CharField(
        max_length=30,
        choices=Statut.choices,
        default=Statut.EN_ATTENTE_VALIDATION,
    )

    def __str__(self):
        return self.nom_commercial or self.raison_sociale or self.utilisateur.email


class AgentCompagnie(models.Model):
    utilisateur = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="profil_agent",
    )
    compagnie = models.ForeignKey(
        Compagnie,
        on_delete=models.CASCADE,
        related_name="agents",
    )

    def __str__(self):
        return f"Agent {self.utilisateur.email}"


class PermissionAgent(models.Model):
    class Code(models.TextChoices):
        ENREGISTRER_BAGAGE = "ENREGISTRER_BAGAGE", "Enregistrer un bagage"
        SCANNER_BILLET = "SCANNER_BILLET", "Scanner un billet"
        VALIDER_EMBARQUEMENT = "VALIDER_EMBARQUEMENT", "Valider un embarquement"
        CONSULTER_BAGAGES = "CONSULTER_BAGAGES", "Consulter les bagages"
        RESTITUER_BAGAGE = "RESTITUER_BAGAGE", "Restituer un bagage"

    agent = models.ForeignKey(
        AgentCompagnie,
        on_delete=models.CASCADE,
        related_name="permissions",
    )
    permission = models.CharField(max_length=30, choices=Code.choices)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("agent", "permission"),
                name="unique_agent_permission",
            ),
        ]

    def __str__(self):
        return f"{self.agent} - {self.get_permission_display()}"