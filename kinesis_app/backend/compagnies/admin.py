from urllib.parse import urlencode

from django.contrib import admin
from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.urls import reverse

from .models import AgentCompagnie, Compagnie, PermissionAgent

ACTIVATION_TOKEN_SALT = "compagnies.activation"


class PermissionAgentInline(admin.TabularInline):
    model = PermissionAgent
    extra = 0


@admin.register(Compagnie)
class CompagnieAdmin(admin.ModelAdmin):
    list_display = ("utilisateur", "statut", "adresse")
    list_filter = ("statut",)
    search_fields = ("utilisateur__email", "utilisateur__nom", "adresse")
    readonly_fields = ("statut",)
    actions = ("approve_and_send_activation", "refuse_companies", "deactivate_companies")

    @admin.action(description="Approuver et envoyer le lien d’activation")
    def approve_and_send_activation(self, request, queryset):
        approved = 0
        for compagnie in queryset.filter(
            statut=Compagnie.Statut.EN_ATTENTE_VALIDATION
        ).select_related("utilisateur"):
            token = signing.dumps(
                {"compagnie_id": str(compagnie.pk)},
                salt=ACTIVATION_TOKEN_SALT,
            )
            activation_path = reverse("company-activate")
            activation_url = request.build_absolute_uri(activation_path)
            activation_url = f"{activation_url}?{urlencode({'token': token})}"
            sent = send_mail(
                subject="Activation de votre compte KINESIS",
                message=(
                    f"Bonjour {compagnie.utilisateur.prenoms},\n\n"
                    "Votre demande d’inscription a été approuvée. "
                    "Activez votre compte avec ce lien, valable 24 heures :\n"
                    f"{activation_url}\n"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[compagnie.utilisateur.email],
                fail_silently=False,
            )
            if sent:
                compagnie.statut = Compagnie.Statut.EN_ATTENTE_ACTIVATION
                compagnie.save(update_fields=("statut",))
                approved += 1

        self.message_user(request, f"{approved} lien(s) d’activation envoyé(s).")

    @admin.action(description="Refuser les demandes sélectionnées")
    def refuse_companies(self, request, queryset):
        refused = list(
            queryset.filter(
                statut__in=(
                Compagnie.Statut.EN_ATTENTE_VALIDATION,
                Compagnie.Statut.EN_ATTENTE_ACTIVATION,
                )
            ).select_related("utilisateur")
        )
        for compagnie in refused:
            send_mail(
                subject="Suite à votre demande d’inscription KINESIS",
                message=(
                    f"Bonjour {compagnie.utilisateur.prenoms},\n\n"
                    "Après examen de votre demande d’inscription, nous ne pouvons "
                    "pas donner suite à la création de votre compte compagnie.\n"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[compagnie.utilisateur.email],
                fail_silently=False,
            )
            compagnie.statut = Compagnie.Statut.REFUSEE
            compagnie.save(update_fields=("statut",))
            compagnie.utilisateur.is_active = False
            compagnie.utilisateur.save(update_fields=("is_active",))
        self.message_user(request, f"{len(refused)} demande(s) refusée(s).")

    @admin.action(description="Désactiver les compagnies sélectionnées")
    def deactivate_companies(self, request, queryset):
        companies = queryset.filter(statut=Compagnie.Statut.ACTIVE).select_related(
            "utilisateur"
        )
        count = 0
        for compagnie in companies:
            compagnie.statut = Compagnie.Statut.DESACTIVE
            compagnie.save(update_fields=("statut",))
            compagnie.utilisateur.is_active = False
            compagnie.utilisateur.save(update_fields=("is_active",))
            count += 1
        self.message_user(request, f"{count} compagnie(s) désactivée(s).")


@admin.register(AgentCompagnie)
class AgentCompagnieAdmin(admin.ModelAdmin):
    list_display = ("utilisateur", "compagnie")
    list_filter = ("compagnie__statut",)
    search_fields = ("utilisateur__email", "utilisateur__nom")
    inlines = (PermissionAgentInline,)