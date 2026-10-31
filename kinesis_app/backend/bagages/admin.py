from django.contrib import admin

from .models import Bagage, PhotoBagage, TarifBagage


class PhotoBagageInline(admin.TabularInline):
    model = PhotoBagage
    extra = 0
    readonly_fields = ("id_photobagage", "created_at")


@admin.register(TarifBagage)
class TarifBagageAdmin(admin.ModelAdmin):
    list_display = ("compagnie", "poids_min", "poids_max", "prix")
    list_filter = ("compagnie",)


@admin.register(Bagage)
class BagageAdmin(admin.ModelAdmin):
    list_display = (
        "id_bagage",
        "reservation",
        "poids",
        "frais_total",
        "frais_payes",
        "statut",
    )
    list_filter = ("statut", "frais_payes")
    search_fields = ("reservation__reference",)
    readonly_fields = tuple(field.name for field in Bagage._meta.fields)
    inlines = (PhotoBagageInline,)
