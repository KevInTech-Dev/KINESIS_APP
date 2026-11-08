from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from compagnies.models import AgentCompagnie, Compagnie, Gare, PermissionAgent
from notifications.models import Notification
from reservations.models import PlaceReservee, Reservation

from .models import Ville, Voyage

User = get_user_model()


class VilleModelTests(TestCase):
    def test_city_names_are_unique_without_case_sensitivity(self):
        Ville.objects.create(nom="Lome")

        with self.assertRaises(IntegrityError), transaction.atomic():
            Ville.objects.create(nom="LOME")


class VoyageApiTests(APITestCase):
    password = "Qx7!mR4#vN8p"

    def setUp(self):
        cache.clear()
        self.company_user = User.objects.create_user(
            email="compagnie@example.com",
            password=self.password,
            nom="Transport Kinesis",
            prenoms="Admin",
            role=User.Role.COMPAGNIE,
        )
        self.company = Compagnie.objects.create(
            utilisateur=self.company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        self.depart = Ville.objects.create(nom="Lome")
        self.arrivee = Ville.objects.create(nom="Sokode")
        self.gare_depart = Gare.objects.create(
            compagnie=self.company,
            ville=self.depart,
            nom="Gare de Lome",
            adresse="Centre de Lome",
            latitude="6.1319",
            longitude="1.2228",
        )
        self.gare_arrivee = Gare.objects.create(
            compagnie=self.company,
            ville=self.arrivee,
            nom="Gare de Sokode",
            adresse="Centre de Sokode",
        )
        self.future_date = timezone.localdate() + timedelta(days=2)
        self.voyage = Voyage.objects.create(
            compagnie=self.company,
            ville_depart=self.depart,
            ville_arrivee=self.arrivee,
            date_depart=self.future_date,
            heure_depart=time(10, 0),
            place_totale=45,
            prix="5000",
        )

    def authenticate_company(self, email):
        user = User.objects.create_user(
            email=email,
            password=self.password,
            nom="Autre transport",
            prenoms="Admin",
            role=User.Role.COMPAGNIE,
        )
        Compagnie.objects.create(utilisateur=user, statut=Compagnie.Statut.ACTIVE)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}"
        )

    def test_agent_with_boarding_permissions_only_lists_company_trips(self):
        other_company_user = User.objects.create_user(
            email="autre-compagnie@example.com",
            password=self.password,
            nom="Autre transport",
            prenoms="Admin",
            role=User.Role.COMPAGNIE,
        )
        other_company = Compagnie.objects.create(
            utilisateur=other_company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        other_trip = Voyage.objects.create(
            compagnie=other_company,
            ville_depart=self.depart,
            ville_arrivee=self.arrivee,
            date_depart=self.future_date,
            heure_depart=time(11, 0),
            place_totale=30,
            prix="4500",
        )
        agent_user = User.objects.create_user(
            email="agent-voyages@example.com",
            password=self.password,
            nom="Agent",
            prenoms="Test",
            role=User.Role.AGENT_COMPAGNIE,
        )
        agent = AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=self.company,
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.SCANNER_BILLET,
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.VALIDER_EMBARQUEMENT,
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(agent_user)}"
        )

        response = self.client.get(reverse("agent-voyage-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        trip_ids = [item["id_voyage"] for item in response.data["results"]]
        self.assertIn(str(self.voyage.pk), trip_ids)
        self.assertNotIn(str(other_trip.pk), trip_ids)

    def test_agent_trip_list_does_not_add_queries_per_trip(self):
        agent_user = User.objects.create_user(
            email="agent-performance@example.com",
            password=self.password,
            nom="Agent",
            prenoms="Performance",
            role=User.Role.AGENT_COMPAGNIE,
        )
        agent = AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=self.company,
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.SCANNER_BILLET,
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.VALIDER_EMBARQUEMENT,
        )
        for index in range(4):
            Voyage.objects.create(
                compagnie=self.company,
                ville_depart=self.depart,
                ville_arrivee=self.arrivee,
                date_depart=self.future_date + timedelta(days=index + 1),
                heure_depart=time(10, 0),
                place_totale=20,
                prix="5000",
            )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(agent_user)}"
        )

        with CaptureQueriesContext(connection) as single_trip_queries:
            single_trip_response = self.client.get(
                reverse("agent-voyage-list"),
                {"page_size": 1},
            )
        with CaptureQueriesContext(connection) as multiple_trip_queries:
            multiple_trip_response = self.client.get(
                reverse("agent-voyage-list"),
                {"page_size": 5},
            )

        self.assertEqual(single_trip_response.status_code, status.HTTP_200_OK)
        self.assertEqual(multiple_trip_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(single_trip_response.data["results"]), 1)
        self.assertEqual(len(multiple_trip_response.data["results"]), 5)
        self.assertEqual(
            len(single_trip_queries.captured_queries),
            len(multiple_trip_queries.captured_queries),
        )

    def test_agent_without_both_boarding_permissions_cannot_list_trips(self):
        agent_user = User.objects.create_user(
            email="agent-voyages@example.com",
            password=self.password,
            nom="Agent",
            prenoms="Test",
            role=User.Role.AGENT_COMPAGNIE,
        )
        AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=self.company,
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(agent_user)}"
        )

        response = self.client.get(reverse("agent-voyage-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_public_search_returns_only_published_future_trips_and_filters(self):
        Voyage.objects.create(
            compagnie=self.company,
            ville_depart=self.depart,
            ville_arrivee=self.arrivee,
            date_depart=self.future_date,
            heure_depart=time(12, 0),
            place_totale=20,
            prix="6000",
            statut=Voyage.Statut.ARCHIVE,
        )
        other_depart = Ville.objects.create(nom="Kara")
        Voyage.objects.create(
            compagnie=self.company,
            ville_depart=other_depart,
            ville_arrivee=self.arrivee,
            date_depart=self.future_date,
            heure_depart=time(14, 0),
            place_totale=20,
            prix="6000",
        )

        response = self.client.get(
            reverse("voyage-list"),
            {
                "ville_depart": str(self.depart.pk),
                "ville_arrivee": str(self.arrivee.pk),
                "date_depart": self.future_date.isoformat(),
                "include_facets": "1",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(
            response.data["results"][0]["id_voyage"],
            str(self.voyage.pk),
        )
        self.assertEqual(
            response.data["companies"],
            [{"id": str(self.company.pk), "name": self.company_user.nom}],
        )

    def test_public_catalog_cache_avoids_repeating_database_queries(self):
        url = reverse("voyage-list")
        first_response = self.client.get(url, {"page_size": 5})

        with CaptureQueriesContext(connection) as repeated_queries:
            cached_response = self.client.get(url, {"page_size": 5})

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cached_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cached_response.json(), first_response.json())
        self.assertEqual(len(repeated_queries.captured_queries), 0)

    def test_public_catalog_cache_is_invalidated_after_trip_update(self):
        url = reverse("voyage-list")
        first_response = self.client.get(url)
        self.assertEqual(first_response.data["count"], 1)

        self.client.force_authenticate(user=self.company_user)
        with self.captureOnCommitCallbacks(execute=True):
            update_response = self.client.patch(
                reverse("voyage-detail", kwargs={"pk": self.voyage.pk}),
                {"statut": Voyage.Statut.ARCHIVE},
                format="json",
            )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=None)
        refreshed_response = self.client.get(url)
        self.assertEqual(refreshed_response.status_code, status.HTTP_200_OK)
        self.assertEqual(refreshed_response.data["count"], 0)

    def test_public_catalog_cache_is_invalidated_after_city_update(self):
        url = reverse("voyage-list")
        first_response = self.client.get(url)
        self.assertEqual(first_response.data["results"][0]["ville_depart_nom"], "Lome")

        with self.captureOnCommitCallbacks(execute=True):
            self.depart.nom = "Grand Lome"
            self.depart.save(update_fields=("nom",))

        refreshed_response = self.client.get(url)
        self.assertEqual(refreshed_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            refreshed_response.data["results"][0]["ville_depart_nom"],
            "Grand Lome",
        )

    def test_authenticated_company_catalog_does_not_use_public_cache(self):
        self.client.get(reverse("voyage-list"))
        archived_trip = Voyage.objects.create(
            compagnie=self.company,
            ville_depart=self.depart,
            ville_arrivee=self.arrivee,
            date_depart=self.future_date + timedelta(days=1),
            heure_depart=time(10, 0),
            place_totale=30,
            prix="4500",
            statut=Voyage.Statut.ARCHIVE,
        )

        self.client.force_authenticate(user=self.company_user)
        response = self.client.get(reverse("voyage-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        trip_ids = {item["id_voyage"] for item in response.data["results"]}
        self.assertIn(str(archived_trip.pk), trip_ids)

    def test_public_catalog_accepts_optional_filters_and_minimum_seats(self):
        response = self.client.get(
            reverse("voyage-list"),
            {
                "ville_depart": str(self.depart.pk),
                "prix_min": "4500",
                "prix_max": "5500",
                "date_depart_apres": self.future_date.isoformat(),
                "date_depart_avant": (self.future_date + timedelta(days=1)).isoformat(),
                "places_min": "45",
                "ordering": "-prix",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(
            response.data["results"][0]["id_voyage"],
            str(self.voyage.pk),
        )

        no_match = self.client.get(
            reverse("voyage-list"),
            {"places_min": "46"},
        )
        self.assertEqual(no_match.status_code, status.HTTP_200_OK)
        self.assertEqual(no_match.data["count"], 0)
        self.assertEqual(no_match.data["results"], [])

    def test_public_catalog_rejects_reversed_price_ranges(self):
        response = self.client.get(
            reverse("voyage-list"),
            {"prix_min": "6000", "prix_max": "5000"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_catalog_paginates_results_and_keeps_pages_stable(self):
        created_at = timezone.now()
        created_trips = []
        for index in range(21):
            created_trips.append(
                Voyage.objects.create(
                    compagnie=self.company,
                    ville_depart=self.depart,
                    ville_arrivee=self.arrivee,
                    date_depart=self.future_date + timedelta(days=index + 1),
                    heure_depart=time(9, 0),
                    place_totale=20,
                    prix="5000",
                    date_creation=created_at + timedelta(seconds=index),
                )
            )

        first_page = self.client.get(
            reverse("voyage-list"),
            {"page": 1, "page_size": 5},
        )
        second_page = self.client.get(
            reverse("voyage-list"),
            {"page": 2, "page_size": 5},
        )

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 22)
        self.assertEqual(len(first_page.data["results"]), 5)
        self.assertEqual(
            first_page.data["results"][0]["id_voyage"],
            str(created_trips[-1].pk),
        )
        self.assertNotIn("companies", first_page.data)
        self.assertIsNotNone(first_page.data["next"])
        self.assertIsNone(first_page.data["previous"])
        self.assertEqual(len(second_page.data["results"]), 5)
        self.assertIsNotNone(second_page.data["next"])
        self.assertIsNotNone(second_page.data["previous"])
        first_ids = {item["id_voyage"] for item in first_page.data["results"]}
        second_ids = {item["id_voyage"] for item in second_page.data["results"]}
        self.assertFalse(first_ids & second_ids)

        default_page = self.client.get(reverse("voyage-list"))
        self.assertEqual(len(default_page.data["results"]), 5)
        self.assertEqual(default_page.data["count"], 22)

    def test_public_results_show_remaining_seats_and_hide_full_trips(self):
        self.voyage.place_totale = 2
        self.voyage.save(update_fields=("place_totale",))
        traveler = User.objects.create_user(
            email="reservation@example.com",
            password=self.password,
            nom="Doe",
            prenoms="Jane",
            role=User.Role.VOYAGEUR,
        )
        reservation = Reservation.objects.create(
            reference="RES-AVAIL-1",
            voyageur=traveler,
            voyage=self.voyage,
            montant_total=5000,
            date_expiration=timezone.now() + timedelta(minutes=10),
        )
        PlaceReservee.objects.create(
            reservation=reservation,
            voyage=self.voyage,
            numero_siege="S001",
            nom_passager="Jane Doe",
        )

        full_trip = Voyage.objects.create(
            compagnie=self.company,
            ville_depart=self.depart,
            ville_arrivee=self.arrivee,
            date_depart=self.future_date + timedelta(days=1),
            heure_depart=time(9, 0),
            place_totale=1,
            prix="5000",
        )
        full_reservation = Reservation.objects.create(
            reference="RES-AVAIL-2",
            voyageur=traveler,
            voyage=full_trip,
            montant_total=5000,
            date_expiration=timezone.now() + timedelta(minutes=10),
        )
        PlaceReservee.objects.create(
            reservation=full_reservation,
            voyage=full_trip,
            numero_siege="S001",
            nom_passager="Jane Doe",
        )

        response = self.client.get(reverse("voyage-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        trips = {item["id_voyage"]: item for item in response.data["results"]}
        self.assertIn(str(self.voyage.pk), trips)
        self.assertEqual(trips[str(self.voyage.pk)]["places_disponibles"], 1)
        self.assertNotIn(str(full_trip.pk), trips)

    def test_company_creates_a_trip_owned_by_its_authenticated_profile(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.company_user)}"
        )

        response = self.client.post(
            reverse("voyage-list"),
            {
                "ville_depart": str(self.depart.pk),
                "ville_arrivee": str(self.arrivee.pk),
                "gare_depart_id": str(self.gare_depart.pk),
                "gare_arrivee_id": str(self.gare_arrivee.pk),
                "date_depart": (timezone.localdate() + timedelta(days=3)).isoformat(),
                "heure_depart": "09:00:45",
                "place_totale": 32,
                "prix": "7500",
                "compagnie": "00000000-0000-0000-0000-000000000001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["heure_depart"], "09:00")
        created = Voyage.objects.get(pk=response.data["id_voyage"])
        self.assertEqual(created.heure_depart, time(9, 0))
        self.assertEqual(created.compagnie, self.company)
        self.assertEqual(created.statut, Voyage.Statut.PUBLIE)
        self.assertEqual(response.data["gare_depart"]["nom"], "Gare de Lome")
        self.assertIn("google.com/maps", response.data["gare_depart"]["maps_url"])

    def test_company_cannot_create_trip_with_station_from_another_city_or_company(self):
        other_city = Ville.objects.create(nom="Kara")
        other_station = Gare.objects.create(
            compagnie=self.company,
            ville=other_city,
            nom="Gare de Kara",
            adresse="Centre de Kara",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.company_user)}"
        )
        payload = {
            "ville_depart": str(self.depart.pk),
            "ville_arrivee": str(self.arrivee.pk),
            "gare_depart_id": str(other_station.pk),
            "gare_arrivee_id": str(self.gare_arrivee.pk),
            "date_depart": (timezone.localdate() + timedelta(days=3)).isoformat(),
            "heure_depart": "09:00",
            "place_totale": 32,
            "prix": "7500",
        }

        response = self.client.post(reverse("voyage-list"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Voyage.objects.count(), 1)

    def test_same_departure_and_arrival_is_rejected(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.company_user)}"
        )

        response = self.client.post(
            reverse("voyage-list"),
            {
                "ville_depart": str(self.depart.pk),
                "ville_arrivee": str(self.depart.pk),
                "date_depart": (timezone.localdate() + timedelta(days=3)).isoformat(),
                "heure_depart": "09:00",
                "place_totale": 32,
                "prix": "7500",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Voyage.objects.count(), 1)

    def test_fractional_fcfa_price_is_rejected(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.company_user)}"
        )

        response = self.client.post(
            reverse("voyage-list"),
            {
                "ville_depart": str(self.depart.pk),
                "ville_arrivee": str(self.arrivee.pk),
                "date_depart": (timezone.localdate() + timedelta(days=3)).isoformat(),
                "heure_depart": "09:00",
                "place_totale": 32,
                "prix": "7500.50",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Voyage.objects.count(), 1)

    def test_company_cannot_modify_another_company_trip(self):
        self.authenticate_company("autre-compagnie@example.com")

        response = self.client.patch(
            reverse("voyage-detail", kwargs={"pk": self.voyage.pk}),
            {"prix": "1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.voyage.refresh_from_db()
        self.assertEqual(str(self.voyage.prix), "5000")

    def test_company_cannot_modify_or_close_trip_with_active_reservations(self):
        traveler = User.objects.create_user(
            email="trip-update-traveler@example.com",
            password=self.password,
            nom="Voyageur",
            prenoms="Test",
        )
        Reservation.objects.create(
            reference="RES-TRIP-UPDATE",
            voyageur=traveler,
            voyage=self.voyage,
            montant_total=5000,
            statut=Reservation.Statut.PAYEE,
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.company_user)}"
        )

        for changes in ({"prix": "6000"}, {"statut": "ANNULEE"}, {"statut": "ARCHIVE"}):
            with self.subTest(changes=changes):
                response = self.client.patch(
                    reverse("voyage-detail", kwargs={"pk": self.voyage.pk}),
                    changes,
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("réservations actives", str(response.data["voyage"]))
                self.voyage.refresh_from_db()
                self.assertEqual(self.voyage.statut, Voyage.Statut.PUBLIE)
                self.assertEqual(str(self.voyage.prix), "5000")

        self.assertFalse(Notification.objects.filter(utilisateur=traveler).exists())

    def test_completed_trip_with_reservations_can_only_be_archived(self):
        traveler = User.objects.create_user(
            email="completed-trip-traveler@example.com",
            password=self.password,
            nom="Voyageur",
            prenoms="Test",
        )
        Reservation.objects.create(
            reference="RES-COMPLETED-TRIP",
            voyageur=traveler,
            voyage=self.voyage,
            montant_total=5000,
            statut=Reservation.Statut.PAYEE,
        )
        self.voyage.date_depart_effective = timezone.now()
        self.voyage.save(update_fields=("date_depart_effective",))
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.company_user)}"
        )

        edit_response = self.client.patch(
            reverse("voyage-detail", kwargs={"pk": self.voyage.pk}),
            {"prix": "6000"},
            format="json",
        )
        archive_response = self.client.patch(
            reverse("voyage-detail", kwargs={"pk": self.voyage.pk}),
            {"statut": "ARCHIVE"},
            format="json",
        )

        self.assertEqual(edit_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(archive_response.status_code, status.HTTP_200_OK)
        self.voyage.refresh_from_db()
        self.assertEqual(self.voyage.statut, Voyage.Statut.ARCHIVE)

    def test_company_cannot_reduce_capacity_below_active_reservations(self):
        from reservations.models import PlaceReservee, Reservation

        traveler = User.objects.create_user(
            email="reservataire@example.com",
            password=self.password,
            nom="Doe",
            prenoms="Jane",
            role=User.Role.VOYAGEUR,
        )
        reservation = Reservation.objects.create(
            reference="RES-CAPACITY-1",
            voyageur=traveler,
            voyage=self.voyage,
            montant_total=10000,
            date_expiration=timezone.now() + timedelta(minutes=10),
        )
        PlaceReservee.objects.create(
            reservation=reservation,
            voyage=self.voyage,
            numero_siege="S001",
            nom_passager="Jane Doe",
        )
        PlaceReservee.objects.create(
            reservation=reservation,
            voyage=self.voyage,
            numero_siege="S002",
            nom_passager="John Doe",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.company_user)}"
        )

        response = self.client.patch(
            reverse("voyage-detail", kwargs={"pk": self.voyage.pk}),
            {"place_totale": 1},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
