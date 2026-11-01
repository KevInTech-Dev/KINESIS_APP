from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
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
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(
            response.data["results"][0]["id_notification"],
            str(self.notification.pk),
        )

    def test_list_filters_unread_and_read_notifications(self):
        self.notification.date_lecture = timezone.now()
        self.notification.save(update_fields=("date_lecture",))
        unread = Notification.objects.create(
            utilisateur=self.user,
            type=Notification.Type.BILLET,
            titre="Billet embarqué",
            message="Embarquement enregistré.",
        )

        unread_response = self.client.get(
            reverse("notification-list"),
            {"non_lues": "true"},
        )
        read_response = self.client.get(
            reverse("notification-list"),
            {"non_lues": "false"},
        )

        self.assertEqual(unread_response.status_code, status.HTTP_200_OK)
        self.assertEqual(unread_response.data["count"], 1)
        self.assertEqual(
            unread_response.data["results"][0]["id_notification"],
            str(unread.pk),
        )
        self.assertEqual(read_response.status_code, status.HTTP_200_OK)
        self.assertEqual(read_response.data["count"], 1)
        self.assertEqual(
            read_response.data["results"][0]["id_notification"],
            str(self.notification.pk),
        )

    def test_list_rejects_invalid_unread_filter(self):
        response = self.client.get(
            reverse("notification-list"),
            {"non_lues": "maybe"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_uses_standard_pagination(self):
        Notification.objects.bulk_create(
            [
                Notification(
                    utilisateur=self.user,
                    type=Notification.Type.VOYAGE,
                    titre=f"Voyage modifié {index}",
                    message="Mise à jour du voyage.",
                )
                for index in range(25)
            ]
        )

        response = self.client.get(
            reverse("notification-list"),
            {"page_size": 5},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 26)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNotNone(response.data["next"])

    def test_user_can_mark_one_notification_as_read(self):
        response = self.client.post(
            reverse("notification-read", kwargs={"pk": self.notification.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["lue"])
        self.assertIsNotNone(response.data["date_lecture"])
        self.notification.refresh_from_db()
        self.assertTrue(self.notification.lue)
        self.assertIsNotNone(self.notification.date_lecture)

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
            Notification.objects.filter(
                utilisateur=self.user,
                date_lecture__isnull=True,
            ).exists()
        )
