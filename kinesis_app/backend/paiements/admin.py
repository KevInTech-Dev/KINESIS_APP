from django.contrib import admin

from .models import BilletElectronique, Paiement


@admin.register(Paiement)
class PaiementAdmin(admin.ModelAdmin):
    list_display = (
        "reference_interne",
        "reservation",
        "montant",
        "statut",
        "date_creation",
        "date_confirmation",
    )
    list_filter = ("statut", "date_creation")
    search_fields = ("reference_interne", "reference_paygate", "reservation__reference")
    readonly_fields = tuple(field.name for field in Paiement._meta.fields)


@admin.register(BilletElectronique)
class BilletElectroniqueAdmin(admin.ModelAdmin):
    list_display = ("code_billet", "place", "statut", "date_creation", "date_embarquement")
    list_filter = ("statut", "date_creation")
    search_fields = ("code_billet", "place__reservation__reference")
    readonly_fields = tuple(field.name for field in BilletElectronique._meta.fields)