from django.contrib import admin

from .models import BilletElectronique, Paiement


@admin.register(Paiement)
class PaiementAdmin(admin.ModelAdmin):
    list_display = (
        "reference_interne",
        "fournisseur",
        "reference_fedapay",
        "reference_cinetpay",
        "reservation",
        "montant",
        "statut",
        "date_creation",
        "date_confirmation",
    )
    list_filter = ("fournisseur", "statut", "date_creation")
    search_fields = (
        "reference_interne",
        "reference_fedapay",
        "reference_cinetpay",
        "reservation__reference",
    )
    readonly_fields = tuple(
        field.name
        for field in Paiement._meta.fields
        if field.name != "notify_token_cinetpay"
    )
    actions = ("mark_reconciled_payments_as_refunded",)

    @admin.action(
        permissions=("change",),
        description="Marquer remboursé après remboursement effectif auprès du fournisseur",
    )
    def mark_reconciled_payments_as_refunded(self, request, queryset):
        reconciled = queryset.filter(statut=Paiement.Statut.A_RECONCILIER)
        updated_count = 0
        for payment in reconciled:
            payment.statut = Paiement.Statut.REMBOURSE
            payment.save(update_fields=("statut",))
            self.log_change(
                request,
                payment,
                "Remboursement confirmé manuellement auprès du fournisseur.",
            )
            updated_count += 1
        self.message_user(
            request,
            f"{updated_count} paiement(s) marqué(s) comme remboursé(s).",
        )


@admin.register(BilletElectronique)
class BilletElectroniqueAdmin(admin.ModelAdmin):
    list_display = (
        "code_billet",
        "place",
        "statut",
        "date_creation",
        "date_embarquement",
    )
    list_filter = ("statut", "date_creation")
    search_fields = ("code_billet", "place__reservation__reference")
    readonly_fields = tuple(field.name for field in BilletElectronique._meta.fields)
