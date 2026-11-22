from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("voyages", "0008_remove_cancelled_trip_status"),
    ]

    operations = [
        migrations.AlterField(
            model_name="voyage",
            name="statut",
            field=models.CharField(
                choices=[
                    ("PUBLIE", "Publié"),
                    ("ARCHIVE", "Archivé"),
                    (
                        "DEPART_A_CONFIRMER",
                        "Terminé",
                    ),
                    ("EXPIREE", "Terminé"),
                ],
                default="PUBLIE",
                max_length=20,
            ),
        ),
    ]
