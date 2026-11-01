from urllib.parse import urlencode

from django import forms
from django.conf import settings
from django.contrib import admin
from django.core import signing
from django.core.mail import send_mail
from django.urls import reverse

from .models import AgentCompagnie, Compagnie, PermissionAgent

ACTIVATION_TOKEN_SALT = "compagnies.activation"


class CompagnieAdminForm(forms.ModelForm):
    telephone_principal = forms.CharField(
        label="Téléphone principal",
        max_length=30,
    )

    class Meta:
        model = Compagnie
        exclude = ("utilisateur",)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields["telephone_principal"].initial = (
                self.instance.utilisateur.telephone
            )


class PermissionAgentInline(admin.TabularInline):
    model = PermissionAgent
    extra = 0


@admin.register(Compagnie)
class CompagnieAdmin(admin.ModelAdmin):
    form = CompagnieAdminForm
    list_display = ("nom_commercial", "raison_sociale", "nif", "rccm", "statut")
    list_filter = ("statut",)
    search_fields = (
        "utilisateur__email",
        "raison_sociale",
        "nom_commercial",
        "nif",
        "rccm",
    )
    readonly_fields = ("statut",)
    fields = (
        "raison_sociale",
        "nom_commercial",
        "nif",
        "rccm",
        "telephone_principal",
        "telephone_secondaire",
        "logo",
        "carte_cfe",
        "piece_identite_gerant",
        "description",
        "adresse",
        "statut",
    )
    actions = ("approve_and_send_activation", "refuse_companies", "deactivate_companies")

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        obj.utilisateur.telephone = form.cleaned_data["telephone_principal"]
        obj.utilisateur.save(update_fields=("telephone",))

    @admin.action(description="Valider et envoyer le lien d’activation")
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
                    f"Bonjour {compagnie.nom_commercial},\n\n"
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
                    f"Bonjour {compagnie.nom_commercial},\n\n"
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