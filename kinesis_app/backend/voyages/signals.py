from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from compagnies.models import Compagnie, Gare

from .cache import invalidate_public_cities_cache, invalidate_public_voyages_cache
from .models import Ville, Voyage


def _invalidate_public_catalog():
    invalidate_public_voyages_cache()


def _invalidate_public_city_data():
    invalidate_public_cities_cache()
    invalidate_public_voyages_cache()


@receiver((post_save, post_delete), sender=Voyage)
@receiver((post_save, post_delete), sender=Gare)
@receiver((post_save, post_delete), sender=Compagnie)
def invalidate_public_voyages(sender, **kwargs):
    transaction.on_commit(_invalidate_public_catalog)


@receiver((post_save, post_delete), sender=Ville)
def invalidate_public_cities(sender, **kwargs):
    transaction.on_commit(_invalidate_public_city_data)
