from django.contrib import admin
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import RequestFactory, TestCase, override_settings
from django.urls import reverse
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from .models import AgentCompagnie, Compagnie, PermissionAgent


User = get_user_model()


class CompagnieModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="compagnie@example.com",
            password="Qx7!mR4#vN8p",
            nom="Transport",
            prenoms="Kinesis",
            role=User.Role.COMPAGNIE,
        )

    def test_company_starts_pending_validation(self):
        compagnie = Compagnie.objects.create(utilisateur=self.user)

        self.assertEqual(compagnie.statut, Compagnie.Statut.EN_ATTENTE_VALIDATION)
        self.assertEqual(compagnie.utilisateur, self.user)

    def test_agent_has_individual_permissions_and_cannot_duplicate_them(self):
        compagnie = Compagnie.objects.create(utilisateur=self.user)
        agent_user = User.objects.create_user(
            email="agent@example.com",
            password="Qx7!mR4#vN8p",
            nom="Agent",
            prenoms="Kinesis",
            role=User.Role.AGENT_COMPAGNIE,
        )
        agent = AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=compagnie,
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.SCANNER_BILLET,
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.VALIDER_EMBARQUEMENT,
        )

        self.assertEqual(agent.permissions.count(), 2)
        with self.assertRaises(IntegrityError), transaction.atomic():
            PermissionAgent.objects.create(
                agent=agent,
                permission=PermissionAgent.Code.SCANNER_BILLET,
            )


class CompanyApiTests(APITestCase):
    password = "Qx7!mR4#vN8p"

    def create_active_company(self, email):
        user = User.objects.create_user(
            email=email,
            password=self.password,
            nom="Transport",
            prenoms="Kinesis",
            role=User.Role.COMPAGNIE,
            is_active=True,
        )
        company = Compagnie.objects.create(
            utilisateur=user,
            statut=Compagnie.Statut.ACTIVE,
        )
        return user, company

    def test_company_registration_stays_pending_and_cannot_login(self):
        response = self.client.post(
            reverse("company-register"),
            {
                "email": "nouvelle-compagnie@example.com",
                "nom": "Transport",
                "prenoms": "Kinesis",
                "description": "Transport interurbain",
                "adresse": "Lome",
                "password": self.password,
                "password_confirmation": self.password,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        company = Compagnie.objects.get(
            utilisateur__email="nouvelle-compagnie@example.com"
        )
        self.assertEqual(company.statut, Compagnie.Statut.EN_ATTENTE_VALIDATION)
        self.assertFalse(company.utilisateur.is_active)

        login_response = self.client.post(
            reverse("token-obtain-pair"),
            {"email": company.utilisateur.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_401_UNAUTHORIZED)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_admin_approval_sends_one_time_activation_link(self):
        from django.core import mail

        company_user = User.objects.create_user(
            email="pending@example.com",
            password=self.password,
            nom="Transport",
            prenoms="Kinesis",
            role=User.Role.COMPAGNIE,
            is_active=False,
        )
        company = Compagnie.objects.create(utilisateur=company_user)
        request = RequestFactory().post("/admin/compagnies/compagnie/")
        request.user = User.objects.create_superuser(
            email="admin@example.com",
            password=self.password,
            nom="Admin",
            prenoms="Kinesis",
        )
        model_admin = admin.site._registry[Compagnie]

        with patch.object(model_admin, "message_user"):
            model_admin.approve_and_send_activation(
                request,
                Compagnie.objects.filter(pk=company.pk),
            )

        self.assertEqual(len(mail.outbox), 1)
        company.refresh_from_db()
        company_user.refresh_from_db()
        self.assertEqual(company.statut, Compagnie.Statut.EN_ATTENTE_ACTIVATION)
        self.assertFalse(company_user.is_active)

        activation_url = mail.outbox[0].body.splitlines()[-1]
        activation_token = parse_qs(urlparse(activation_url).query)["token"][0]
        activation_response = self.client.get(
            reverse("company-activate"),
            {"token": activation_token},
        )
        self.assertEqual(activation_response.status_code, status.HTTP_200_OK)
        company.refresh_from_db()
        company_user.refresh_from_db()
        self.assertEqual(company.statut, Compagnie.Statut.ACTIVE)
        self.assertTrue(company_user.is_active)

        replay_response = self.client.get(
            reverse("company-activate"),
            {"token": activation_token},
        )
        self.assertEqual(replay_response.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_admin_refusal_sends_email_and_keeps_company_inactive(self):
        from django.core import mail

        company_user = User.objects.create_user(
            email="refused@example.com",
            password=self.password,
            nom="Transport",
            prenoms="Kinesis",
            role=User.Role.COMPAGNIE,
            is_active=False,
        )
        company = Compagnie.objects.create(utilisateur=company_user)
        request = RequestFactory().post("/admin/compagnies/compagnie/")
        request.user = User.objects.create_superuser(
            email="admin@example.com",
            password=self.password,
            nom="Admin",
            prenoms="Kinesis",
        )
        model_admin = admin.site._registry[Compagnie]

        with patch.object(model_admin, "message_user"):
            model_admin.refuse_companies(
                request,
                Compagnie.objects.filter(pk=company.pk),
            )

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("ne pouvons pas donner suite", mail.outbox[0].body)
        company.refresh_from_db()
        company_user.refresh_from_db()
        self.assertEqual(company.statut, Compagnie.Statut.REFUSEE)
        self.assertFalse(company_user.is_active)

    def test_company_can_create_agents_only_with_its_own_permissions(self):
        company_user, company = self.create_active_company("compagnie@example.com")
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(company_user)}"
        )

        response = self.client.post(
            reverse("company-agents"),
            {
                "email": "agent@example.com",
                "nom": "Agent",
                "prenoms": "Kinesis",
                "temporary_password": "Temporary!Password-729",
                "permissions": [
                    PermissionAgent.Code.SCANNER_BILLET,
                    PermissionAgent.Code.VALIDER_EMBARQUEMENT,
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        agent = AgentCompagnie.objects.get(utilisateur__email="agent@example.com")
        self.assertEqual(agent.compagnie, company)
        self.assertEqual(agent.permissions.count(), 2)
        self.assertTrue(agent.utilisateur.must_change_password)
        self.assertTrue(agent.utilisateur.check_password("Temporary!Password-729"))

        update_response = self.client.patch(
            reverse("company-agent-detail", kwargs={"pk": agent.pk}),
            {
                "nom": "Agent modifie",
                "permissions": [PermissionAgent.Code.SCANNER_BILLET],
            },
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        agent.refresh_from_db()
        self.assertEqual(agent.utilisateur.nom, "Agent modifie")
        self.assertEqual(
            list(agent.permissions.values_list("permission", flat=True)),
            [PermissionAgent.Code.SCANNER_BILLET],
        )

        agent_user = agent.utilisateur
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(agent_user)}"
        )
        company_agents_response = self.client.get(reverse("company-agents"))
        self.assertEqual(
            company_agents_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

        profile_response = self.client.get(reverse("current-user"))
        self.assertEqual(profile_response.status_code, status.HTTP_403_FORBIDDEN)

        change_password_response = self.client.post(
            reverse("user-change-password"),
            {
                "old_password": "Temporary!Password-729",
                "new_password": "Permanent!Password-835",
                "password_confirmation": "Permanent!Password-835",
            },
            format="json",
        )
        self.assertEqual(
            change_password_response.status_code,
            status.HTTP_204_NO_CONTENT,
        )
        agent_user.refresh_from_db()
        self.assertFalse(agent_user.must_change_password)
        self.assertTrue(agent_user.check_password("Permanent!Password-835"))
        profile_response = self.client.get(reverse("current-user"))
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)

    def test_company_cannot_retrieve_another_company_agent(self):
        company_user, company = self.create_active_company("compagnie-a@example.com")
        agent_user = User.objects.create_user(
            email="agent-a@example.com",
            password=self.password,
            nom="Agent",
            prenoms="A",
            role=User.Role.AGENT_COMPAGNIE,
        )
        agent = AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=company,
        )
        other_company_user, _ = self.create_active_company("compagnie-b@example.com")
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(other_company_user)}"
        )

        response = self.client.get(
            reverse("company-agent-detail", kwargs={"pk": agent.pk})
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)