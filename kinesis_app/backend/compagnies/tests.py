from io import BytesIO
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import RequestFactory, TestCase, override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from .models import AgentCompagnie, Compagnie, PermissionAgent
from .serializers import CompanyRegistrationSerializer
from .storage import AuthenticatedCompanyDocumentStorage

User = get_user_model()


def make_test_image(name):
    buffer = BytesIO()
    Image.new("RGB", (2, 2), color="red").save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


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

    def test_company_documents_use_authenticated_cloudinary_assets(self):
        with patch("compagnies.storage.cloudinary.uploader.upload") as upload:
            upload.return_value = {"public_id": "compagnies/documents/carte"}
            AuthenticatedCompanyDocumentStorage()._upload(
                "compagnies/documents/carte.png",
                make_test_image("carte.png"),
            )

        self.assertEqual(upload.call_args.kwargs["type"], "authenticated")
        self.assertEqual(upload.call_args.kwargs["access_mode"], "authenticated")

        with patch(
            "compagnies.storage.cloudinary_url",
            return_value=("https://cloudinary.example/signed-image", {}),
        ) as cloudinary_url:
            url = AuthenticatedCompanyDocumentStorage()._get_url(
                "compagnies/documents/carte.png"
            )

        self.assertEqual(url, "https://cloudinary.example/signed-image")
        self.assertEqual(cloudinary_url.call_args.kwargs["type"], "authenticated")
        self.assertTrue(cloudinary_url.call_args.kwargs["sign_url"])

    def test_company_admin_hides_user_relation_and_saves_primary_phone(self):
        admin_user = User.objects.create_superuser(
            email="admin@example.com",
            password="Admin!Password-729",
            nom="Admin",
            prenoms="Kinesis",
        )
        company_user = User.objects.create_user(
            email="company-admin@example.com",
            password="Company!Password-729",
            nom="Transport",
            prenoms="",
            telephone="+22890000000",
            role=User.Role.COMPAGNIE,
        )
        company = Compagnie.objects.create(
            utilisateur=company_user,
            raison_sociale="Transport Togo SARL",
            nom_commercial="Kinesis Transport",
        )
        self.client.force_login(admin_user)

        change_url = reverse("admin:compagnies_compagnie_change", args=(company.pk,))
        response = self.client.get(change_url)

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="telephone_principal"')
        self.assertNotContains(response, 'name="utilisateur"')
        self.assertNotContains(response, "Utilisateur:")
        admin_form = admin.site._registry[Compagnie]
        self.assertFalse(
            admin_form.has_add_permission(RequestFactory().get("/admin/"))
        )

        response = self.client.post(
            change_url,
            {
                "raison_sociale": company.raison_sociale,
                "nom_commercial": company.nom_commercial,
                "nif": "",
                "rccm": "",
                "telephone_principal": "+22891112233",
                "telephone_secondaire": "",
                "logo": "",
                "carte_cfe": "",
                "piece_identite_gerant": "",
                "description": "",
                "adresse": "",
                "_save": "Enregistrer",
            },
        )

        self.assertEqual(response.status_code, 302)
        company_user.refresh_from_db()
        self.assertEqual(company_user.telephone, "+22891112233")


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
        with patch(
            "compagnies.storage.AuthenticatedCompanyDocumentStorage.save",
            side_effect=[
                "compagnies/documents/carte-cfe.png",
                "compagnies/documents/piece-identite.png",
            ],
        ):
            response = self.client.post(
                reverse("company-register"),
                {
                    "email": "nouvelle-compagnie@example.com",
                    "raison_sociale": "Transport Togo SARL",
                    "nom_commercial": "Kinesis Transport",
                    "telephone": "+22890000000",
                    "telephone_secondaire": "",
                    "logo": "",
                    "nif": "1234567890",
                    "rccm": "tg-lfw-01-2023-b13-01282",
                    "carte_cfe": make_test_image("carte-cfe.png"),
                    "piece_identite_gerant": make_test_image("piece-identite.png"),
                    "description": "Transport interurbain",
                    "adresse": "Lome",
                    "password": self.password,
                    "password_confirmation": self.password,
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        company = Compagnie.objects.get(
            utilisateur__email="nouvelle-compagnie@example.com"
        )
        self.assertEqual(company.statut, Compagnie.Statut.EN_ATTENTE_VALIDATION)
        self.assertFalse(company.utilisateur.is_active)
        self.assertEqual(company.utilisateur.prenoms, "")
        self.assertEqual(company.utilisateur.nom, "Transport Togo SARL")
        self.assertEqual(company.rccm, "TG-LFW-01-2023-B13-01282")
        self.assertEqual(company.nif, "1234567890")
        self.assertNotIn("carte_cfe", response.data)
        self.assertNotIn("piece_identite_gerant", response.data)

        login_response = self.client.post(
            reverse("token-obtain-pair"),
            {"email": company.utilisateur.email, "password": self.password},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_company_registration_validates_nif_and_rccm_formats(self):
        invalid_numbers = (
            {"nif": "12345678901", "rccm": "TG-LFW-01"},
            {"nif": "12 34", "rccm": "TG-LFW-01"},
            {"nif": "1234", "rccm": "LOM-01-2023"},
            {"nif": "1234", "rccm": "TG-L@M-01"},
        )

        for values in invalid_numbers:
            with self.subTest(values=values):
                serializer = CompanyRegistrationSerializer(data=values)
                self.assertFalse(serializer.is_valid())

        nif_error = CompanyRegistrationSerializer(
            data={"nif": "12345678901", "rccm": "TG-LFW-01"}
        )
        self.assertFalse(nif_error.is_valid())
        self.assertIn("nif", nif_error.errors)

        rccm_error = CompanyRegistrationSerializer(
            data={"nif": "1234", "rccm": "TG-L@M-01"}
        )
        self.assertFalse(rccm_error.is_valid())
        self.assertIn("rccm", rccm_error.errors)

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
        self.assertEqual(response.data["id"], str(agent.utilisateur_id))

        agent_login_response = self.client.post(
            reverse("token-obtain-pair"),
            {
                "email": agent.utilisateur.email,
                "password": "Temporary!Password-729",
            },
            format="json",
        )
        self.assertEqual(agent_login_response.status_code, status.HTTP_200_OK)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(company_user)}"
        )

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
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertEqual(profile_response.data["role"], User.Role.AGENT_COMPAGNIE)
        self.assertTrue(profile_response.data["must_change_password"])

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {agent_login_response.data['access']}"
        )
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
        changed_password_login = self.client.post(
            reverse("token-obtain-pair"),
            {
                "email": agent_user.email,
                "password": "Permanent!Password-835",
            },
            format="json",
        )
        self.assertEqual(changed_password_login.status_code, status.HTTP_200_OK)
        profile_response = self.client.get(reverse("current-user"))
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)

    def test_company_agent_list_includes_ids_and_uses_pagination(self):
        company_user, company = self.create_active_company("pagination@example.com")
        for index in range(2):
            agent_user = User.objects.create_user(
                email=f"agent-{index}@example.com",
                password="Temporary!Password-729",
                nom=f"Agent {index}",
                prenoms="",
                role=User.Role.AGENT_COMPAGNIE,
            )
            AgentCompagnie.objects.create(
                utilisateur=agent_user,
                compagnie=company,
            )

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(company_user)}"
        )
        response = self.client.get(reverse("company-agents"), {"page_size": 1})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertIsNotNone(response.data["next"])
        self.assertEqual(len(response.data["results"]), 1)
        self.assertIn("id", response.data["results"][0])
        self.assertIs(response.data["results"][0]["is_active"], True)

        agent_id = response.data["results"][0]["id"]
        deactivate_response = self.client.patch(
            reverse("company-agent-detail", kwargs={"pk": agent_id}),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(deactivate_response.status_code, status.HTTP_200_OK)
        self.assertIs(deactivate_response.data["is_active"], False)
        agent_user = User.objects.get(pk=agent_id)
        self.assertFalse(agent_user.is_active)

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


class AdminCompanyApiTests(APITestCase):
    password = "Qx7!mR4#vN8p"

    def setUp(self):
        admin_user = User.objects.create_superuser(
            email="admin-api@example.com",
            password=self.password,
            nom="Admin",
            prenoms="Kinesis",
        )
        self.pending_user = User.objects.create_user(
            email="pending-api@example.com",
            password=self.password,
            nom="Transport",
            role=User.Role.COMPAGNIE,
            is_active=False,
        )
        self.pending_company = Compagnie.objects.create(
            utilisateur=self.pending_user,
            raison_sociale="Transport Togo SARL",
            nom_commercial="Kinesis Transport",
            nif="1234567890",
            rccm="TG-LFW-01-2023-B13-01282",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(admin_user)}"
        )

    def test_admin_lists_company_applications_with_signed_private_documents(self):
        self.pending_company.carte_cfe.name = "compagnies/documents/cfe.png"
        self.pending_company.save(update_fields=("carte_cfe",))
        with patch.object(
            AuthenticatedCompanyDocumentStorage,
            "url",
            return_value="https://cloudinary.example/signed-cfe",
        ):
            response = self.client.get(
                reverse("admin-company-list"),
                {"status": Compagnie.Statut.EN_ATTENTE_VALIDATION},
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        application = response.data["results"][0]
        self.assertEqual(application["id"], str(self.pending_company.pk))
        self.assertEqual(application["email"], self.pending_user.email)
        self.assertEqual(
            application["carte_cfe"],
            "https://cloudinary.example/signed-cfe",
        )

    def test_non_administrator_cannot_review_company_applications(self):
        traveler = User.objects.create_user(
            email="traveler-api@example.com",
            password=self.password,
            nom="Voyageur",
            role=User.Role.VOYAGEUR,
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(traveler)}"
        )

        response = self.client.get(reverse("admin-company-list"))
        action_response = self.client.post(
            reverse(
                "admin-company-approve",
                kwargs={"pk": self.pending_company.pk},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(action_response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_admin_approves_company_by_sending_activation_link(self):
        from django.core import mail

        response = self.client.post(
            reverse(
                "admin-company-approve",
                kwargs={"pk": self.pending_company.pk},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["statut"],
            Compagnie.Statut.EN_ATTENTE_ACTIVATION,
        )
        self.assertEqual(len(mail.outbox), 1)
        self.pending_user.refresh_from_db()
        self.assertFalse(self.pending_user.is_active)

        repeated_response = self.client.post(
            reverse(
                "admin-company-approve",
                kwargs={"pk": self.pending_company.pk},
            )
        )
        self.assertEqual(repeated_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(mail.outbox), 1)

    @patch("compagnies.services.send_mail", return_value=0)
    def test_company_stays_pending_when_activation_email_is_not_sent(self, _send_mail):
        response = self.client.post(
            reverse(
                "admin-company-approve",
                kwargs={"pk": self.pending_company.pk},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.pending_company.refresh_from_db()
        self.assertEqual(
            self.pending_company.statut,
            Compagnie.Statut.EN_ATTENTE_VALIDATION,
        )

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_admin_refuses_or_deactivates_company_accounts(self):
        from django.core import mail

        refused = self.client.post(
            reverse(
                "admin-company-refuse",
                kwargs={"pk": self.pending_company.pk},
            )
        )
        self.assertEqual(refused.status_code, status.HTTP_200_OK)
        self.assertEqual(refused.data["statut"], Compagnie.Statut.REFUSEE)
        self.pending_user.refresh_from_db()
        self.assertFalse(self.pending_user.is_active)
        self.assertEqual(len(mail.outbox), 1)

        active_user = User.objects.create_user(
            email="active-api@example.com",
            password=self.password,
            nom="Transport actif",
            role=User.Role.COMPAGNIE,
            is_active=True,
        )
        active_company = Compagnie.objects.create(
            utilisateur=active_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        deactivated = self.client.post(
            reverse(
                "admin-company-deactivate",
                kwargs={"pk": active_company.pk},
            )
        )
        self.assertEqual(deactivated.status_code, status.HTTP_200_OK)
        self.assertEqual(deactivated.data["statut"], Compagnie.Statut.DESACTIVE)
        active_user.refresh_from_db()
        self.assertFalse(active_user.is_active)