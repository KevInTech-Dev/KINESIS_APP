from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class UserAuthenticationTests(APITestCase):
	password = "Qx7!mR4#vN8p"

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
