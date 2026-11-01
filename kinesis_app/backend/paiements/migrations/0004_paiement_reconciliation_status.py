from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("paiements", "0003_rename_reference_paygate_reference_fedapay"),
    ]

    operations = [
        migrations.AlterField(
            model_name="paiement",
            name="statut",
            field=models.CharField(
                choices=[
                    ("EN_ATTENTE", "En attente"),
                    ("CONFIRME", "Confirmé"),
                    ("REJETE", "Rejeté"),
                    ("ECHEC", "Échec"),
                    ("A_RECONCILIER", "À réconcilier"),
                    ("REMBOURSE", "Remboursé"),
                ],
                default="EN_ATTENTE",
                max_length=20,
            ),
        ),
    ]
