from django.db import migrations, models

TICKET_PERMISSIONS = {
    "SCANNER_BILLET",
    "VALIDER_EMBARQUEMENT",
}
BAGGAGE_PERMISSIONS = {
    "ENREGISTRER_BAGAGE",
    "CONSULTER_BAGAGES",
    "RESTITUER_BAGAGE",
}
LEGACY_PERMISSIONS = TICKET_PERMISSIONS | BAGGAGE_PERMISSIONS


def group_agent_permissions(apps, schema_editor):
    PermissionAgent = apps.get_model("compagnies", "PermissionAgent")
    database = schema_editor.connection.alias
    permissions = {}

    for agent_id, code in (
        PermissionAgent.objects.using(database)
        .filter(permission__in=LEGACY_PERMISSIONS)
        .values_list("agent_id", "permission")
    ):
        permissions.setdefault(agent_id, set()).add(code)

    replacements = []
    for agent_id, codes in permissions.items():
        if TICKET_PERMISSIONS.issubset(codes):
            replacements.append(
                PermissionAgent(agent_id=agent_id, permission="GERER_BILLETS")
            )
        if BAGGAGE_PERMISSIONS.issubset(codes):
            replacements.append(
                PermissionAgent(agent_id=agent_id, permission="GERER_BAGAGES")
            )

    PermissionAgent.objects.using(database).filter(
        permission__in=LEGACY_PERMISSIONS
    ).delete()
    PermissionAgent.objects.using(database).bulk_create(replacements)


def ungroup_agent_permissions(apps, schema_editor):
    PermissionAgent = apps.get_model("compagnies", "PermissionAgent")
    database = schema_editor.connection.alias
    grouped = {
        "GERER_BILLETS": TICKET_PERMISSIONS,
        "GERER_BAGAGES": BAGGAGE_PERMISSIONS,
    }
    replacements = []

    for agent_id, code in (
        PermissionAgent.objects.using(database)
        .filter(permission__in=grouped)
        .values_list("agent_id", "permission")
    ):
        replacements.extend(
            PermissionAgent(agent_id=agent_id, permission=legacy_code)
            for legacy_code in grouped[code]
        )

    PermissionAgent.objects.using(database).filter(permission__in=grouped).delete()
    PermissionAgent.objects.using(database).bulk_create(replacements)


class Migration(migrations.Migration):
    dependencies = [
        ("compagnies", "0008_alter_compagnie_statut"),
    ]

    operations = [
        migrations.AlterField(
            model_name="permissionagent",
            name="permission",
            field=models.CharField(
                choices=[
                    ("GERER_BILLETS", "Gérer les billets et les embarquements"),
                    ("GERER_BAGAGES", "Gérer les bagages"),
                ],
                max_length=30,
            ),
        ),
        migrations.RunPython(
            group_agent_permissions,
            reverse_code=ungroup_agent_permissions,
        ),
    ]
