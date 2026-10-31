from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from compagnies.models import Compagnie
from reservations.models import PlaceReservee, Reservation
from reservations.services import create_reservation
from voyages.models import Ville, Voyage

from .models import BilletElectronique, Paiement
from .services import apply_verified_paygate_event, start_payment_attempt


User = get_user_model()


class PaiementServiceTests(TestCase):
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
        self.traveler = User.objects.create_user(
            email="voyageur@example.com",
            password=self.password,
            nom="Doe",
            prenoms="Jane",
            role=User.Role.VOYAGEUR,
        )
        depart = Ville.objects.create(nom="Lome")
        arrivee = Ville.objects.create(nom="Sokode")
        voyage = Voyage.objects.create(
            compagnie=company,
            ville_depart=depart,
            ville_arrivee=arrivee,
            date_depart=timezone.localdate() + timedelta(days=2),
            heure_depart=time(9, 0),
            place_totale=2,
            prix="5000",
        )
        self.reservation = create_reservation(
            voyageur=self.traveler,
            voyage_id=voyage.pk,
            passenger_names=["Jane Doe", "John Doe"],
        )

    def test_payment_attempt_uses_reservation_total_and_is_idempotent(self):
        started_at = timezone.now()
        first = start_payment_attempt(
            reservation_id=self.reservation.pk,
            voyageur=self.traveler,
            now=started_at,
        )
        second = start_payment_attempt(
            reservation_id=self.reservation.pk,
            voyageur=self.traveler,
            now=started_at + timedelta(minutes=1),
        )

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(first.montant, Decimal("10000"))
        self.assertEqual(first.statut, Paiement.Statut.EN_ATTENTE)
        self.reservation.refresh_from_db()
        self.assertEqual(
            self.reservation.date_expiration,
            started_at + timedelta(minutes=10),
        )

    def test_verified_event_confirms_once_and_creates_one_ticket_per_seat(self):
        payment = start_payment_attempt(
            reservation_id=self.reservation.pk,
            voyageur=self.traveler,
        )
        self.assertEqual(BilletElectronique.objects.count(), 0)

        confirmed = apply_verified_paygate_event(
            paiement_id=payment.pk,
            reference_paygate="PG-TEST-1001",
            event_id="evt-test-1001",
            montant=Decimal("10000"),
            response_data={"status": "verified"},
        )
        duplicate = apply_verified_paygate_event(
            paiement_id=payment.pk,
            reference_paygate="PG-TEST-1001",
            event_id="evt-test-1001",
            montant=Decimal("10000"),
            response_data={"status": "verified"},
        )

        self.reservation.refresh_from_db()
        self.assertEqual(confirmed.statut, Paiement.Statut.CONFIRME)
        self.assertEqual(duplicate.pk, payment.pk)
        self.assertEqual(self.reservation.statut, Reservation.Statut.PAYEE)
        self.assertEqual(BilletElectronique.objects.count(), 2)

    def test_wrong_amount_does_not_confirm_or_issue_tickets(self):
        payment = start_payment_attempt(
            reservation_id=self.reservation.pk,
            voyageur=self.traveler,
        )

        with self.assertRaises(ValidationError):
            apply_verified_paygate_event(
                paiement_id=payment.pk,
                reference_paygate="PG-TEST-1002",
                event_id="evt-test-1002",
                montant=Decimal("9999"),
                response_data={"status": "verified"},
            )

        payment.refresh_from_db()
        self.assertEqual(payment.statut, Paiement.Statut.EN_ATTENTE)
        self.assertEqual(BilletElectronique.objects.count(), 0)


class BilletApiTests(APITestCase):
    def test_traveler_only_sees_owned_tickets(self):
        password = "Qx7!mR4#vN8p"
        company_user = User.objects.create_user(
            email="company@example.com",
            password=password,
            nom="Transport",
            prenoms="Admin",
            role=User.Role.COMPAGNIE,
        )
        company = Compagnie.objects.create(
            utilisateur=company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        departure = Ville.objects.create(nom="Kara")
        arrival = Ville.objects.create(nom="Atakpame")
        voyage = Voyage.objects.create(
            compagnie=company,
            ville_depart=departure,
            ville_arrivee=arrival,
            date_depart=timezone.localdate() + timedelta(days=2),
            heure_depart=time(9, 0),
            place_totale=1,
            prix="5000",
        )
        owner = User.objects.create_user(
            email="owner@example.com",
            password=password,
            nom="Owner",
            prenoms="Ticket",
            role=User.Role.VOYAGEUR,
        )
        other = User.objects.create_user(
            email="other@example.com",
            password=password,
            nom="Other",
            prenoms="Ticket",
            role=User.Role.VOYAGEUR,
        )
        reservation = Reservation.objects.create(
            reference="RES-TICKET-1",
            voyageur=owner,
            voyage=voyage,
            montant_total=5000,
            statut=Reservation.Statut.PAYEE,
        )
        place = PlaceReservee.objects.create(
            reservation=reservation,
            voyage=voyage,
            numero_siege="S001",
            nom_passager="Passenger",
        )
        ticket = BilletElectronique.objects.create(place=place)

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(other)}"
        )
        response = self.client.get(reverse("billet-detail", kwargs={"pk": ticket.pk}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)