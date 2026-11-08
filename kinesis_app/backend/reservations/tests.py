from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from compagnies.models import AgentCompagnie, Compagnie, PermissionAgent
from notifications.models import Notification
from voyages.models import Ville, Voyage

from .models import PlaceReservee, Reservation
from .serializers import ReservationSerializer
from .views import reservations_with_related_data

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
        self.company_user = company_user
        self.company = company
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
        notification = Notification.objects.get(utilisateur=self.traveler)
        self.assertEqual(notification.type, Notification.Type.RESERVATION)
        self.assertEqual(notification.titre, "Réservation créée")

    def test_three_passengers_get_three_seats_and_three_fares(self):
        self.voyage.place_totale = 3
        self.voyage.save(update_fields=("place_totale",))

        response = self.reserve(["Jean", "Kévin", "Julien"])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        reservation = Reservation.objects.get(pk=response.data["id_reservation"])
        self.assertEqual(reservation.montant_total, 15000)
        self.assertEqual(
            list(
                reservation.places.values_list(
                    "numero_siege",
                    "nom_passager",
                )
            ),
            [("S001", "Jean"), ("S002", "Kévin"), ("S003", "Julien")],
        )

    def test_group_reservation_uses_next_contiguous_block_of_seats(self):
        self.voyage.place_totale = 6
        self.voyage.save(update_fields=("place_totale",))
        existing_reservation = Reservation.objects.create(
            reference="RES-EXISTING-SEATS",
            voyageur=self.traveler,
            voyage=self.voyage,
            date_expiration=timezone.now() + timedelta(minutes=5),
            montant_total=10000,
        )
        for seat_number, passenger_name in (
            ("S001", "Occupant un"),
            ("S003", "Occupant trois"),
        ):
            PlaceReservee.objects.create(
                reservation=existing_reservation,
                voyage=self.voyage,
                numero_siege=seat_number,
                nom_passager=passenger_name,
            )

        response = self.reserve(["Jean", "Kévin", "Julien"])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        reservation = Reservation.objects.get(pk=response.data["id_reservation"])
        self.assertEqual(
            list(reservation.places.values_list("numero_siege", flat=True)),
            ["S004", "S005", "S006"],
        )

    def test_group_reservation_rejects_scattered_seats_without_contiguous_block(self):
        self.voyage.place_totale = 5
        self.voyage.save(update_fields=("place_totale",))
        existing_reservation = Reservation.objects.create(
            reference="RES-SCATTERED-SEATS",
            voyageur=self.traveler,
            voyage=self.voyage,
            date_expiration=timezone.now() + timedelta(minutes=5),
            montant_total=10000,
        )
        for seat_number, passenger_name in (
            ("S002", "Occupant deux"),
            ("S004", "Occupant quatre"),
        ):
            PlaceReservee.objects.create(
                reservation=existing_reservation,
                voyage=self.voyage,
                numero_siege=seat_number,
                nom_passager=passenger_name,
            )

        response = self.reserve(["Jean", "Kévin", "Julien"])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Reservation.objects.count(), 1)

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
        agent_user = User.objects.create_user(
            email="agent-reservation-notif@example.com",
            password=self.password,
            nom="Agent",
            role=User.Role.AGENT_COMPAGNIE,
        )
        agent = AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=self.company,
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.ENREGISTRER_BAGAGE,
        )
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
        self.assertEqual(
            Notification.objects.filter(
                utilisateur=self.traveler,
                titre="Réservation annulée",
            ).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(
                utilisateur=self.company_user,
                titre="Réservation annulée",
            ).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(
                utilisateur=agent_user,
                titre="Réservation annulée",
            ).count(),
            1,
        )

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
        self.assertEqual(
            self.client.get(reverse("reservation-list")).data["results"],
            [],
        )

    def test_company_can_list_and_read_reservations_for_its_trips_only(self):
        reservation_response = self.reserve(["Jane Doe"])
        reservation = Reservation.objects.get(
            pk=reservation_response.data["id_reservation"]
        )

        other_company_user = User.objects.create_user(
            email="autre-compagnie@example.com",
            password=self.password,
            nom="Autre",
            prenoms="Compagnie",
            role=User.Role.COMPAGNIE,
        )
        other_company = Compagnie.objects.create(
            utilisateur=other_company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        other_trip = Voyage.objects.create(
            compagnie=other_company,
            ville_depart=self.voyage.ville_depart,
            ville_arrivee=self.voyage.ville_arrivee,
            date_depart=self.voyage.date_depart,
            heure_depart=self.voyage.heure_depart,
            place_totale=2,
            prix="5000",
        )
        other_reservation = Reservation.objects.create(
            reference="RES-OTHER-COMPANY",
            voyageur=self.traveler,
            voyage=other_trip,
            date_expiration=timezone.now() + timedelta(minutes=5),
            montant_total=5000,
        )

        self.authenticate(self.company_user)
        list_response = self.client.get(reverse("reservation-list"))
        detail_response = self.client.get(
            reverse("reservation-detail", kwargs={"pk": reservation.pk})
        )
        foreign_detail_response = self.client.get(
            reverse("reservation-detail", kwargs={"pk": other_reservation.pk})
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 1)
        self.assertEqual(
            [item["id_reservation"] for item in list_response.data["results"]],
            [str(reservation.pk)],
        )
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            foreign_detail_response.status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_agent_with_baggage_registration_permission_can_read_company_reservations(self):
        reservation_response = self.reserve(["Jane Doe"])
        reservation_id = reservation_response.data["id_reservation"]
        agent_user = User.objects.create_user(
            email="agent@example.com",
            password=self.password,
            nom="Agent",
            prenoms="Kinesis",
            role=User.Role.AGENT_COMPAGNIE,
            must_change_password=False,
        )
        agent = AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=self.company,
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.ENREGISTRER_BAGAGE,
        )

        self.authenticate(agent_user)
        list_response = self.client.get(reverse("reservation-list"))
        detail_response = self.client.get(
            reverse("reservation-detail", kwargs={"pk": reservation_id})
        )
        create_response = self.client.post(
            reverse("reservation-list"),
            {"voyage_id": str(self.voyage.pk), "passagers": ["Another traveler"]},
            format="json",
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 1)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_agent_without_reservation_related_permission_cannot_read_reservations(self):
        agent_user = User.objects.create_user(
            email="agent-sans-permission@example.com",
            password=self.password,
            nom="Agent",
            prenoms="Kinesis",
            role=User.Role.AGENT_COMPAGNIE,
            must_change_password=False,
        )
        AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=self.company,
        )

        self.authenticate(agent_user)
        response = self.client.get(reverse("reservation-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_reservation_list_is_paginated_for_company(self):
        for index in range(21):
            Reservation.objects.create(
                reference=f"RES-COMPANY-{index}",
                voyageur=self.traveler,
                voyage=self.voyage,
                date_expiration=timezone.now() + timedelta(minutes=5),
                montant_total=5000,
            )

        self.authenticate(self.company_user)
        response = self.client.get(reverse("reservation-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 21)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNotNone(response.data["next"])

    def test_reservation_list_serializes_voyage_availability_in_three_queries(self):
        for index in range(3):
            Reservation.objects.create(
                reference=f"RES-BATCH-{index}",
                voyageur=self.traveler,
                voyage=self.voyage,
                date_expiration=timezone.now() + timedelta(minutes=5),
                montant_total=5000,
            )

        with CaptureQueriesContext(connection) as queries:
            reservations = reservations_with_related_data(
                Reservation.objects.filter(voyageur=self.traveler)
            )
            serialized = ReservationSerializer(reservations, many=True).data

        self.assertEqual(len(serialized), 3)
        self.assertEqual(
            [reservation["voyage"]["places_disponibles"] for reservation in serialized],
            [2, 2, 2],
        )
        self.assertEqual(len(queries), 3)


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
