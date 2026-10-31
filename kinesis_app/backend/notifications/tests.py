from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Notification

User = get_user_model()


class NotificationApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="notification-user@example.com",
            password="Secure-test-Password-42!",
            nom="Test",
            prenoms="Voyageur",
        )
        self.other_user = User.objects.create_user(
            email="notification-other@example.com",
            password="Secure-test-Password-42!",
            nom="Autre",
            prenoms="Voyageur",
        )
        self.notification = Notification.objects.create(
            utilisateur=self.user,
            type=Notification.Type.PAIEMENT,
            titre="Paiement confirmé",
            message="Votre réservation est confirmée.",
        )
        self.client.force_authenticate(user=self.user)

    def test_list_contains_only_the_authenticated_users_notifications(self):
        Notification.objects.create(
            utilisateur=self.other_user,
            type=Notification.Type.BILLET,
            titre="Billet disponible",
            message="Votre billet est prêt.",
        )

        response = self.client.get(reverse("notification-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["id_notification"],
            str(self.notification.pk),
        )

    def test_user_can_mark_one_notification_as_read(self):
        response = self.client.post(
            reverse("notification-read", kwargs={"pk": self.notification.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["lue"])
        self.notification.refresh_from_db()
        self.assertTrue(self.notification.lue)

    def test_user_cannot_mark_another_users_notification_as_read(self):
        other_notification = Notification.objects.create(
            utilisateur=self.other_user,
            type=Notification.Type.BILLET,
            titre="Billet disponible",
            message="Votre billet est prêt.",
        )

        response = self.client.post(
            reverse("notification-read", kwargs={"pk": other_notification.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_can_mark_all_notifications_as_read(self):
        Notification.objects.create(
            utilisateur=self.user,
            type=Notification.Type.RESERVATION,
            titre="Réservation créée",
            message="Votre réservation est en attente.",
        )

        response = self.client.post(reverse("notification-read-all"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 2)
        self.assertFalse(
            Notification.objects.filter(utilisateur=self.user, lue=False).exists()
        )
