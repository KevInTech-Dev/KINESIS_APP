from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("paiements", "0007_cinetpay_provider"),
    ]

    operations = [
        migrations.AddField(
            model_name="paiement",
            name="notify_token_cinetpay",
            field=models.CharField(blank=True, editable=False, max_length=255),
        ),
    ]
