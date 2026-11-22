from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class AgentPermissionGroupingMigrationTests(TransactionTestCase):
    migrate_from = ("compagnies", "0008_alter_compagnie_statut")
    migrate_to = ("compagnies", "0009_group_agent_permissions")

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        current_apps = executor.loader.project_state(
            executor.loader.graph.leaf_nodes()
        ).apps
        User = current_apps.get_model("utilisateurs", "Utilisateur")
        Compagnie = current_apps.get_model("compagnies", "Compagnie")
        AgentCompagnie = current_apps.get_model("compagnies", "AgentCompagnie")
        PermissionAgent = current_apps.get_model("compagnies", "PermissionAgent")

        company_user = User.objects.create(
            email="migration-company@example.com",
            password="!",
            nom="Compagnie test",
            role="COMPAGNIE",
        )
        company = Compagnie.objects.create(
            utilisateur=company_user,
            statut="ACTIVE",
        )
        cases = {
            "ticket_complete": {"SCANNER_BILLET", "VALIDER_EMBARQUEMENT"},
            "ticket_partial": {"SCANNER_BILLET"},
            "baggage_complete": {
                "ENREGISTRER_BAGAGE",
                "CONSULTER_BAGAGES",
                "RESTITUER_BAGAGE",
            },
            "baggage_partial": {"ENREGISTRER_BAGAGE", "CONSULTER_BAGAGES"},
            "both_complete": {
                "SCANNER_BILLET",
                "VALIDER_EMBARQUEMENT",
                "ENREGISTRER_BAGAGE",
                "CONSULTER_BAGAGES",
                "RESTITUER_BAGAGE",
            },
        }
        self.agent_ids = {}
        self.expected_permissions = {
            "ticket_complete": {"GERER_BILLETS"},
            "ticket_partial": set(),
            "baggage_complete": {"GERER_BAGAGES"},
            "baggage_partial": set(),
            "both_complete": {"GERER_BILLETS", "GERER_BAGAGES"},
        }

        for case, codes in cases.items():
            user = User.objects.create(
                email=f"{case}@example.com",
                password="!",
                nom=case,
                role="AGENT_COMPAGNIE",
            )
            agent = AgentCompagnie.objects.create(
                utilisateur=user,
                compagnie=company,
            )
            self.agent_ids[case] = agent.pk
            PermissionAgent.objects.bulk_create(
                [
                    PermissionAgent(agent=agent, permission=code)
                    for code in codes
                ]
            )

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def test_only_complete_legacy_permission_sets_are_migrated(self):
        PermissionAgent = MigrationExecutor(connection).loader.project_state(
            [self.migrate_to]
        ).apps.get_model("compagnies", "PermissionAgent")

        for case, agent_id in self.agent_ids.items():
            actual = set(
                PermissionAgent.objects.filter(agent_id=agent_id).values_list(
                    "permission",
                    flat=True,
                )
            )
            self.assertEqual(actual, self.expected_permissions[case], case)
