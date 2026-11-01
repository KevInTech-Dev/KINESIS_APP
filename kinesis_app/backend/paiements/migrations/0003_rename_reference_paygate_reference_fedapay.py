from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("paiements", "0002_billetelectronique_embarque_par"),
    ]

    operations = [
        migrations.RenameField(
            model_name="paiement",
            old_name="reference_paygate",
            new_name="reference_fedapay",
        ),
    ]
