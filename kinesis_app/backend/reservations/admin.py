from django.contrib import admin

from .models import PlaceReservee, Reservation


class PlaceReserveeInline(admin.TabularInline):
    model = PlaceReservee
    extra = 0
    readonly_fields = ("id_place", "voyage", "numero_siege", "nom_passager", "liberee")


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "voyageur",
        "voyage",
        "montant_total",
        "statut",
        "date_reservation",
        "date_expiration",
    )
    list_filter = ("statut", "date_reservation")
    search_fields = ("reference", "voyageur__email")
    readonly_fields = (
        "id_reservation",
        "reference",
        "voyageur",
        "voyage",
        "date_reservation",
        "date_expiration",
        "montant_total",
        "statut",
    )
    inlines = (PlaceReserveeInline,)