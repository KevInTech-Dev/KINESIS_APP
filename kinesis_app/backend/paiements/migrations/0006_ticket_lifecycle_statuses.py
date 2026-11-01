from django.db import migrations


def migrate_ticket_statuses(apps, schema_editor):
    BilletElectronique = apps.get_model("paiements", "BilletElectronique")
    database = schema_editor.connection.alias

    BilletElectronique.objects.using(database).filter(
        date_embarquement__isnull=False,
    ).update(statut="EMBARQUE")
    BilletElectronique.objects.using(database).filter(statut="EXPIRE").update(
        statut="NON_UTILISE",
    )


def reverse_ticket_statuses(apps, schema_editor):
    BilletElectronique = apps.get_model("paiements", "BilletElectronique")
    database = schema_editor.connection.alias

    BilletElectronique.objects.using(database).filter(statut="EMBARQUE").update(
        statut="VALIDE",
    )
    BilletElectronique.objects.using(database).filter(
        statut="NON_UTILISE",
    ).update(statut="EXPIRE")


class Migration(migrations.Migration):
    dependencies = [
        ("paiements", "0005_alter_billetelectronique_statut"),
        ("voyages", "0003_voyage_date_depart_effective_and_more"),
    ]

    operations = [
        migrations.RunPython(migrate_ticket_statuses, reverse_ticket_statuses),
    ]
