from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from compagnies.models import Compagnie
from voyages.models import Ville, Voyage

from .models import PlaceReservee, Reservation


User = get_user_model()


class ReservationApiTests(APITestCase):
    password = "Qx7!mR4#vN8p"

    def setUp(self):
        company_user = User.objects.create_user(
            email="compagnie@example.com",
            password=self.password,
            nom="Transport Kinesis",
            prenoms="Admin",
            role=User.Role.COMPAGNIE,
        )
        company = Compagnie.objects.create(
            utilisateur=company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        departure = Ville.objects.create(nom="Lome")
        arrival = Ville.objects.create(nom="Sokode")
        self.voyage = Voyage.objects.create(
            compagnie=company,
            ville_depart=departure,
            ville_arrivee=arrival,
            date_depart=timezone.localdate() + timedelta(days=3),
            heure_depart=time(9, 0),
            place_totale=2,
            prix="5000",
        )
        self.traveler = User.objects.create_user(
            email="voyageur@example.com",
            password=self.password,
            nom="Doe",
            prenoms="Jane",
            role=User.Role.VOYAGEUR,
        )
        self.authenticate(self.traveler)

    def authenticate(self, user):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}"
        )

    def reserve(self, passengers):
        return self.client.post(
            reverse("reservation-list"),
            {"voyage_id": str(self.voyage.pk), "passagers": passengers},
            format="json",
        )

    def test_group_reservation_assigns_unique_seats_and_snapshots_total(self):
        response = self.reserve(["Jane Doe", "John Doe"])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        reservation = Reservation.objects.get(pk=response.data["id_reservation"])
        self.assertEqual(reservation.voyageur, self.traveler)
        self.assertEqual(reservation.statut, Reservation.Statut.EN_ATTENTE_PAIEMENT)
        self.assertEqual(reservation.montant_total, 10000)
        self.assertEqual(
            list(reservation.places.values_list("numero_siege", flat=True)),
            ["S001", "S002"],
        )
        self.assertTrue(
            reservation.date_expiration
            <= timezone.now() + timedelta(minutes=10, seconds=2)
        )

    def test_expired_reservation_releases_seat_for_reuse(self):
        first_response = self.reserve(["Jane Doe"])
        first = Reservation.objects.get(pk=first_response.data["id_reservation"])
        first.date_expiration = timezone.now() - timedelta(seconds=1)
        first.save(update_fields=("date_expiration",))

        self.client.get(reverse("reservation-list"))
        first.refresh_from_db()
        first_place = first.places.get()
        self.assertEqual(first.statut, Reservation.Statut.EXPIREE)
        self.assertTrue(first_place.liberee)

        second_response = self.reserve(["John Doe"])
        second = Reservation.objects.get(pk=second_response.data["id_reservation"])
        self.assertEqual(second.places.get().numero_siege, "S001")

    def test_full_voyage_rejects_another_reservation(self):
        self.reserve(["Jane Doe", "John Doe"])

        response = self.reserve(["Third Passenger"])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Reservation.objects.count(), 1)

    def test_cancellation_releases_the_seat(self):
        response = self.reserve(["Jane Doe"])
        reservation_id = response.data["id_reservation"]

        cancel_response = self.client.post(
            reverse("reservation-cancel", kwargs={"pk": reservation_id})
        )
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            cancel_response.data["statut"],
            Reservation.Statut.ANNULEE,
        )
        self.assertTrue(Reservation.objects.get(pk=reservation_id).places.get().liberee)

        new_response = self.reserve(["John Doe"])
        new_reservation = Reservation.objects.get(pk=new_response.data["id_reservation"])
        self.assertEqual(new_reservation.places.get().numero_siege, "S001")

    def test_traveler_cannot_read_another_travelers_reservation(self):
        response = self.reserve(["Jane Doe"])
        other_traveler = User.objects.create_user(
            email="autre@example.com",
            password=self.password,
            nom="Autre",
            prenoms="Voyageur",
            role=User.Role.VOYAGEUR,
        )
        self.authenticate(other_traveler)

        detail_response = self.client.get(
            reverse("reservation-detail", kwargs={"pk": response.data["id_reservation"]})
        )
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(reverse("reservation-list")).data, [])


class ReservationModelTests(TestCase):
    def test_reserved_seat_is_unique_per_trip_until_released(self):
        company_user = User.objects.create_user(
            email="company@example.com",
            password="Qx7!mR4#vN8p",
            nom="Transport",
            prenoms="Admin",
            role=User.Role.COMPAGNIE,
        )
        company = Compagnie.objects.create(
            utilisateur=company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        traveler = User.objects.create_user(
            email="traveler@example.com",
            password="Qx7!mR4#vN8p",
            nom="Doe",
            prenoms="Jane",
            role=User.Role.VOYAGEUR,
        )
        depart = Ville.objects.create(nom="Kara")
        arrivee = Ville.objects.create(nom="Atakpame")
        voyage = Voyage.objects.create(
            compagnie=company,
            ville_depart=depart,
            ville_arrivee=arrivee,
            date_depart=timezone.localdate() + timedelta(days=3),
            heure_depart=time(9, 0),
            place_totale=2,
            prix="5000",
        )
        reservation = Reservation.objects.create(
            reference="RES-TEST-1",
            voyageur=traveler,
            voyage=voyage,
            montant_total=5000,
            date_expiration=timezone.now() + timedelta(minutes=10),
        )
        PlaceReservee.objects.create(
            reservation=reservation,
            voyage=voyage,
            numero_siege="S001",
            nom_passager="Jane Doe",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PlaceReservee.objects.create(
                reservation=reservation,
                voyage=voyage,
                numero_siege="S001",
                nom_passager="John Doe",
            )
