from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("utilisateurs", "0003_alter_utilisateur_prenoms"),
    ]

    operations = [
        migrations.AddField(
            model_name="utilisateur",
            name="date_creation",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AlterField(
            model_name="utilisateur",
            name="date_creation",
            field=models.DateTimeField(
                blank=True,
                default=django.utils.timezone.now,
                editable=False,
                null=True,
            ),
        ),
    ]
