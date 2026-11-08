from importlib import import_module

from django.apps import AppConfig


class VoyagesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "voyages"

    def ready(self):
        import_module("voyages.signals")
