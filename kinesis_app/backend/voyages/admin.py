from django.contrib import admin

from .models import Ville, Voyage


@admin.register(Ville)
class VilleAdmin(admin.ModelAdmin):
    list_display = ("nom", "id_ville")
    search_fields = ("nom",)
    ordering = ("nom",)


@admin.register(Voyage)
class VoyageAdmin(admin.ModelAdmin):
    list_display = (
        "ville_depart",
        "ville_arrivee",
        "date_depart",
        "heure_depart",
        "compagnie",
        "statut",
    )
    list_filter = ("statut", "date_depart", "compagnie")
    search_fields = (
        "ville_depart__nom",
        "ville_arrivee__nom",
        "compagnie__utilisateur__email",
    )