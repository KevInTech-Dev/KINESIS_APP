from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("paiements", "0006_ticket_lifecycle_statuses"),
    ]

    operations = [
        migrations.AddField(
            model_name="paiement",
            name="reference_cinetpay",
            field=models.CharField(
                blank=True,
                max_length=128,
                null=True,
                unique=True,
            ),
        ),
        migrations.AddField(
            model_name="paiement",
            name="fournisseur",
            field=models.CharField(
                choices=[("FEDAPAY", "FedaPay"), ("CINETPAY", "CinetPay")],
                default="FEDAPAY",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="paiement",
            name="url_paiement_cinetpay",
            field=models.URLField(blank=True, max_length=2048),
        ),
    ]
