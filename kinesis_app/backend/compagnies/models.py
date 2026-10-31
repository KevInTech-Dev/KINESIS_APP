from django.conf import settings
from django.db import models


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
    description = models.TextField(blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    statut = models.CharField(
        max_length=30,
        choices=Statut.choices,
        default=Statut.EN_ATTENTE_VALIDATION,
    )

    def __str__(self):
        return f"Compagnie de {self.utilisateur.email}"


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