from django.core.management.base import BaseCommand

from paiements.services import expire_unused_tickets_after_departure


class Command(BaseCommand):
    help = "Marque NON_UTILISE les billets valides après le départ réel du voyage."

    def handle(self, *args, **options):
        updated_count = expire_unused_tickets_after_departure()
        self.stdout.write(
            self.style.SUCCESS(f"{updated_count} billet(s) marqué(s) NON_UTILISE.")
        )
