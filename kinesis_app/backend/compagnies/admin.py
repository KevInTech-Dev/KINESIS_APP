from django import forms
from django.contrib import admin

from .models import AgentCompagnie, Compagnie, PermissionAgent
from .services import approve_company, deactivate_company, refuse_company


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
    actions = (
        "approve_and_send_activation",
        "refuse_companies",
        "deactivate_companies",
    )

    def has_add_permission(self, request):
        return False

    def get_queryset(self, request):
        return super().get_queryset(request).filter(utilisateur__email_verified=True)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        obj.utilisateur.telephone = form.cleaned_data["telephone_principal"]
        obj.utilisateur.save(update_fields=("telephone",))

    @admin.action(description="Valider et envoyer le lien d’activation")
    def approve_and_send_activation(self, request, queryset):
        approved = 0
        for compagnie in queryset.filter(
            statut=Compagnie.Statut.EN_ATTENTE_VALIDATION
        ).only("pk"):
            approve_company(company_id=compagnie.pk)
            approved += 1

        self.message_user(request, f"{approved} lien(s) d’activation envoyé(s).")

    @admin.action(description="Refuser les demandes sélectionnées")
    def refuse_companies(self, request, queryset):
        refused = 0
        for compagnie in queryset.filter(
            statut__in=(
                Compagnie.Statut.EN_ATTENTE_VALIDATION,
                Compagnie.Statut.EN_ATTENTE_ACTIVATION,
            )
        ).only("pk"):
            refuse_company(company_id=compagnie.pk)
            refused += 1
        self.message_user(request, f"{refused} demande(s) refusée(s).")

    @admin.action(description="Désactiver les compagnies sélectionnées")
    def deactivate_companies(self, request, queryset):
        companies = queryset.filter(statut=Compagnie.Statut.ACTIVE).select_related(
            "utilisateur",
        ).only("pk")
        count = 0
        for compagnie in companies:
            deactivate_company(company_id=compagnie.pk)
            count += 1
        self.message_user(request, f"{count} compagnie(s) désactivée(s).")


@admin.register(AgentCompagnie)
class AgentCompagnieAdmin(admin.ModelAdmin):
    list_display = ("utilisateur", "compagnie")
    list_filter = ("compagnie__statut",)
    search_fields = ("utilisateur__email", "utilisateur__nom")
    inlines = (PermissionAgentInline,)