from io import BytesIO
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from compagnies.models import AgentCompagnie, Compagnie

User = get_user_model()


class UserAuthenticationTests(APITestCase):
	password = "Qx7!mR4#vN8p"

	def test_registration_allows_missing_first_names(self):
		response = self.client.post(
			reverse("user-register"),
			{
				"email": "sans-prenoms@example.com",
				"nom": "Doe",
				"password": self.password,
				"password_confirmation": self.password,
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertEqual(
			User.objects.get(email="sans-prenoms@example.com").prenoms,
			"",
		)

	def test_registration_creates_a_traveler_and_hashes_password(self):
		response = self.client.post(
			reverse("user-register"),
			{
				"email": "voyageur@example.com",
				"nom": "Doe",
				"prenoms": "Jane",
				"password": self.password,
				"password_confirmation": self.password,
				"role": User.Role.ADMINISTRATEUR,
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		user = User.objects.get(email="voyageur@example.com")
		self.assertEqual(user.role, User.Role.VOYAGEUR)
		self.assertTrue(user.check_password(self.password))
		self.assertNotIn("password", response.data)

	def test_password_confirmation_must_match(self):
		response = self.client.post(
			reverse("user-register"),
			{
				"email": "voyageur@example.com",
				"nom": "Doe",
				"prenoms": "Jane",
				"password": self.password,
				"password_confirmation": "Different-Password#5",
			},
			format="json",
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertFalse(User.objects.filter(email="voyageur@example.com").exists())

	def test_login_returns_tokens_and_profile_requires_authentication(self):
		user = User.objects.create_user(
			email="voyageur@example.com",
			password=self.password,
			nom="Doe",
			prenoms="Jane",
		)

		anonymous_response = self.client.get(reverse("current-user"))
		self.assertEqual(anonymous_response.status_code, status.HTTP_401_UNAUTHORIZED)

		login_response = self.client.post(
			reverse("token-obtain-pair"),
			{"email": user.email, "password": self.password},
			format="json",
		)
		self.assertEqual(login_response.status_code, status.HTTP_200_OK)
		self.assertIn("access", login_response.data)
		self.assertIn("refresh", login_response.data)

		self.client.credentials(
			HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}"
		)
		profile_response = self.client.get(reverse("current-user"))
		self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
		self.assertEqual(profile_response.data["email"], user.email)

	def test_profile_updates_persist_for_every_role_and_photo_survives_reload(self):
		with TemporaryDirectory() as media_root, override_settings(
			MEDIA_ROOT=media_root,
			STORAGES={
				"default": {
					"BACKEND": "django.core.files.storage.FileSystemStorage",
				},
				"staticfiles": {
					"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
				},
			},
		):
			for role in User.Role.values:
				with self.subTest(role=role):
					user = User.objects.create_user(
						email=f"profile-{role.lower()}@example.com",
						password=self.password,
						nom="Nom initial",
						prenoms="Prénom initial",
						role=role,
					)
					self.client.force_authenticate(user=user)
					response = self.client.patch(
						reverse("current-user"),
						{
							"nom": "Nom modifié",
							"prenoms": "Prénom modifié",
							"telephone": "+22890000000",
						},
						format="multipart",
					)

					self.assertEqual(response.status_code, status.HTTP_200_OK)
					user.refresh_from_db()
					self.assertEqual(user.nom, "Nom modifié")
					self.assertEqual(user.prenoms, "Prénom modifié")
					self.assertEqual(user.telephone, "+22890000000")

					if role == User.Role.COMPAGNIE:
						image = BytesIO()
						Image.new("RGB", (2, 2), color="green").save(
							image,
							format="PNG",
						)
						photo_response = self.client.patch(
							reverse("current-user"),
							{
								"photo_profil": SimpleUploadedFile(
									"profile.png",
									image.getvalue(),
									content_type="image/png",
								),
							},
							format="multipart",
						)
						self.assertEqual(
							photo_response.status_code,
							status.HTTP_200_OK,
						)
						user.refresh_from_db()
						self.assertTrue(user.photo_profil.name)

						reloaded_profile = self.client.get(reverse("current-user"))
						self.assertEqual(
							reloaded_profile.data["photo_profil"],
							photo_response.data["photo_profil"],
						)

	def test_logout_revokes_the_refresh_token(self):
		user = User.objects.create_user(
			email="voyageur@example.com",
			password=self.password,
			nom="Doe",
			prenoms="Jane",
		)
		login_response = self.client.post(
			reverse("token-obtain-pair"),
			{"email": user.email, "password": self.password},
			format="json",
		)
		self.client.credentials(
			HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}"
		)

		logout_response = self.client.post(
			reverse("user-logout"),
			{"refresh": login_response.data["refresh"]},
			format="json",
		)
		self.assertEqual(logout_response.status_code, status.HTTP_205_RESET_CONTENT)

		refresh_response = self.client.post(
			reverse("token-refresh"),
			{"refresh": login_response.data["refresh"]},
			format="json",
		)
		self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

	def test_agent_must_change_password_can_read_identity_but_not_edit_profile(self):
		company_user = User.objects.create_user(
			email="company-profile@example.com",
			password=self.password,
			nom="Transport",
			role=User.Role.COMPAGNIE,
		)
		company = Compagnie.objects.create(
			utilisateur=company_user,
			nom_commercial="Transport Demo",
		)
		agent_user = User.objects.create_user(
			email="agent-profile@example.com",
			password=self.password,
			nom="Agent",
			role=User.Role.AGENT_COMPAGNIE,
			must_change_password=True,
		)
		AgentCompagnie.objects.create(utilisateur=agent_user, compagnie=company)
		self.client.credentials(
			HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(agent_user)}"
		)

		profile_response = self.client.get(reverse("current-user"))
		self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
		self.assertEqual(profile_response.data["role"], User.Role.AGENT_COMPAGNIE)
		self.assertTrue(profile_response.data["must_change_password"])
		self.assertEqual(profile_response.data["agent_permissions"], [])
		self.assertEqual(profile_response.data["compagnie_nom"], "Transport Demo")

		update_response = self.client.patch(
			reverse("current-user"),
			{"nom": "Modification interdite"},
			format="json",
		)
		self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)


class UserAdminPrivacyTests(TestCase):
	def setUp(self):
		self.admin = User.objects.create_superuser(
			email="admin@example.com",
			password="Secure-admin-Password-42!",
			nom="Admin",
			prenoms="Kinesis",
		)
		self.traveler = User.objects.create_user(
			email="traveler-private@example.com",
			password="Secure-user-Password-42!",
			nom="NomConfidentiel",
			prenoms="PrenomConfidentiel",
			telephone="+22800000000",
		)
		self.client.force_login(self.admin)

	def test_admin_can_change_traveler_status_without_seeing_profile_details(self):
		response = self.client.get(
			reverse("admin:utilisateurs_utilisateur_change", args=[self.traveler.pk])
		)

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, "is_active")
		self.assertNotContains(response, self.traveler.email)
		self.assertNotContains(response, "NomConfidentiel")
		self.assertNotContains(response, "PrenomConfidentiel")
		self.assertNotContains(response, "+22800000000")


class AdminUserListTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_superuser(
			email="api-admin@example.com",
			password="Admin!Password-729",
			nom="Admin",
			prenoms="Kinesis",
		)
		company_user = User.objects.create_user(
			email="company-list@example.com",
			password="Company!Password-729",
			nom="Transport",
			prenoms="",
			telephone="+22890000000",
			role=User.Role.COMPAGNIE,
		)
		Compagnie.objects.create(
			utilisateur=company_user,
			raison_sociale="Transport Togo SARL",
			nom_commercial="Kinesis Transport",
			nif="1234567890",
			rccm="TG-LFW-01-2023-B13-01282",
		)
		agent_user = User.objects.create_user(
			email="agent-list@example.com",
			password="Temporary!Password-729",
			nom="Agent",
			prenoms="",
			role=User.Role.AGENT_COMPAGNIE,
		)
		AgentCompagnie.objects.create(
			utilisateur=agent_user,
			compagnie=company_user.profil_compagnie,
		)
		User.objects.create_user(
			email="traveler-list@example.com",
			password="Traveler!Password-729",
			nom="Voyageur",
			prenoms="Test",
			role=User.Role.VOYAGEUR,
		)
		self.client.credentials(
			HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.admin)}"
		)

	def test_admin_can_filter_users_by_role_and_page_through_results(self):
		response = self.client.get(
			reverse("admin-user-list"),
			{"role": User.Role.COMPAGNIE, "page_size": 1},
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["count"], 1)
		self.assertIsNone(response.data["next"])
		company_data = response.data["results"][0]
		self.assertEqual(company_data["role"], User.Role.COMPAGNIE)
		self.assertIn("photo_profil", company_data)
		self.assertIsNone(company_data["photo_profil"])
		self.assertEqual(company_data["compagnie"]["nom_commercial"], "Kinesis Transport")
		self.assertEqual(company_data["compagnie"]["telephone_principal"], "+22890000000")

		all_users_response = self.client.get(
			reverse("admin-user-list"),
			{"page_size": 2},
		)
		self.assertEqual(all_users_response.data["count"], 4)
		self.assertIsNotNone(all_users_response.data["next"])

	def test_admin_can_read_user_counts_by_role(self):
		response = self.client.get(
			reverse("admin-user-summary"),
			{"days": 7},
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["total"], 4)
		self.assertEqual(
			response.data["roles"],
			{
				User.Role.VOYAGEUR: 1,
				User.Role.COMPAGNIE: 1,
				User.Role.AGENT_COMPAGNIE: 1,
				User.Role.ADMINISTRATEUR: 1,
			},
		)
		self.assertTrue(response.data["registrations"])
		self.assertTrue(
			all(
				set(item) == {"date", "count"}
				for item in response.data["registrations"]
			)
		)
		invalid_range = self.client.get(
			reverse("admin-user-summary"),
			{"days": 14},
		)
		self.assertEqual(invalid_range.status_code, status.HTTP_400_BAD_REQUEST)

	def test_admin_can_search_users_by_identity_or_company_name(self):
		response = self.client.get(
			reverse("admin-user-list"),
			{"search": "Kinesis Transport"},
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["count"], 2)
		self.assertEqual(
			{user["role"] for user in response.data["results"]},
			{User.Role.COMPAGNIE, User.Role.AGENT_COMPAGNIE},
		)

		agent_response = self.client.get(
			reverse("admin-user-list"),
			{"search": "agent-list"},
		)
		self.assertEqual(agent_response.data["count"], 1)
		self.assertEqual(
			agent_response.data["results"][0]["role"],
			User.Role.AGENT_COMPAGNIE,
		)

		oversized_search_response = self.client.get(
			reverse("admin-user-list"),
			{"search": "x" * 101},
		)
		self.assertEqual(
			oversized_search_response.status_code,
			status.HTTP_400_BAD_REQUEST,
		)

	def test_user_listing_rejects_invalid_role_and_non_admins(self):
		invalid_role_response = self.client.get(
			reverse("admin-user-list"),
			{"role": "UNKNOWN"},
		)
		self.assertEqual(
			invalid_role_response.status_code,
			status.HTTP_400_BAD_REQUEST,
		)

		traveler = User.objects.get(email="traveler-list@example.com")
		self.client.credentials(
			HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(traveler)}"
		)
		response = self.client.get(reverse("admin-user-list"))
		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
		summary_response = self.client.get(reverse("admin-user-summary"))
		self.assertEqual(summary_response.status_code, status.HTTP_403_FORBIDDEN)
