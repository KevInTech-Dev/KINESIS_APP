from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_remove_notification_notif_user_read_date_idx_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="type",
            field=models.CharField(
                choices=[
                    ("RESERVATION", "Réservation"),
                    ("PAIEMENT", "Paiement"),
                    ("BILLET", "Billet"),
                    ("VOYAGE", "Voyage"),
                    ("BAGAGE", "Bagage"),
                    ("ADMINISTRATION", "Administration"),
                ],
                max_length=20,
            ),
        ),
    ]
