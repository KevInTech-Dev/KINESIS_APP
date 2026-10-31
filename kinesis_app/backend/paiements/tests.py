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

from compagnies.models import AgentCompagnie, Compagnie, PermissionAgent
from notifications.models import Notification
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
        self.assertEqual(
            Notification.objects.filter(utilisateur=self.traveler).count(),
            1,
        )

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


class BilletBoardingApiTests(APITestCase):
    def setUp(self):
        company_user = User.objects.create_user(
            email="transport@example.com",
            password="Secure-test-Password-42!",
            nom="Transport",
            prenoms="Kinesis",
            role=User.Role.COMPAGNIE,
        )
        self.company = Compagnie.objects.create(
            utilisateur=company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        self.agent_user = User.objects.create_user(
            email="agent@example.com",
            password="Secure-test-Password-42!",
            nom="Agent",
            prenoms="Kinesis",
            role=User.Role.AGENT_COMPAGNIE,
        )
        self.agent = AgentCompagnie.objects.create(
            utilisateur=self.agent_user,
            compagnie=self.company,
        )
        PermissionAgent.objects.bulk_create(
            [
                PermissionAgent(
                    agent=self.agent,
                    permission=PermissionAgent.Code.SCANNER_BILLET,
                ),
                PermissionAgent(
                    agent=self.agent,
                    permission=PermissionAgent.Code.VALIDER_EMBARQUEMENT,
                ),
            ]
        )
        departure = Ville.objects.create(nom="Lome")
        arrival = Ville.objects.create(nom="Kara")
        voyage = Voyage.objects.create(
            compagnie=self.company,
            ville_depart=departure,
            ville_arrivee=arrival,
            date_depart=timezone.localdate() + timedelta(days=2),
            heure_depart=time(9, 0),
            place_totale=1,
            prix="5000",
        )
        traveler = User.objects.create_user(
            email="traveler@example.com",
            password="Secure-test-Password-42!",
            nom="Voyageur",
            prenoms="Test",
        )
        reservation = Reservation.objects.create(
            reference="RES-BOARDING-1",
            voyageur=traveler,
            voyage=voyage,
            montant_total=5000,
            statut=Reservation.Statut.PAYEE,
        )
        place = PlaceReservee.objects.create(
            reservation=reservation,
            voyage=voyage,
            numero_siege="S001",
            nom_passager="Passager Test",
        )
        self.ticket = BilletElectronique.objects.create(
            place=place,
            code_qr="opaque-test-qr-token",
        )
        self.client.force_authenticate(user=self.agent_user)

    def test_scanning_returns_minimal_ticket_data_without_qr_token(self):
        response = self.client.post(
            reverse("billet-scan"),
            {"code_qr": self.ticket.code_qr},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["nom_passager"], "Passager Test")
        self.assertNotIn("code_qr", response.data)
        self.ticket.refresh_from_db()
        self.assertIsNone(self.ticket.date_embarquement)

    def test_boarding_is_audited_and_cannot_be_repeated(self):
        response = self.client.post(
            reverse("billet-embarquement"),
            {"code_qr": self.ticket.code_qr},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ticket.refresh_from_db()
        self.assertIsNotNone(self.ticket.date_embarquement)
        self.assertEqual(self.ticket.embarque_par, self.agent_user)

        duplicate_response = self.client.post(
            reverse("billet-embarquement"),
            {"code_qr": self.ticket.code_qr},
            format="json",
        )
        self.assertEqual(duplicate_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_scanning_permission_does_not_grant_boarding_permission(self):
        self.agent.permissions.filter(
            permission=PermissionAgent.Code.VALIDER_EMBARQUEMENT
        ).delete()

        scan_response = self.client.post(
            reverse("billet-scan"),
            {"code_qr": self.ticket.code_qr},
            format="json",
        )
        boarding_response = self.client.post(
            reverse("billet-embarquement"),
            {"code_qr": self.ticket.code_qr},
            format="json",
        )

        self.assertEqual(scan_response.status_code, status.HTTP_200_OK)
        self.assertEqual(boarding_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_agent_cannot_scan_another_companys_ticket(self):
        other_company_user = User.objects.create_user(
            email="other-transport@example.com",
            password="Secure-test-Password-42!",
            nom="Autre",
            prenoms="Transport",
            role=User.Role.COMPAGNIE,
        )
        other_company = Compagnie.objects.create(
            utilisateur=other_company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        other_agent_user = User.objects.create_user(
            email="other-agent@example.com",
            password="Secure-test-Password-42!",
            nom="Autre",
            prenoms="Agent",
            role=User.Role.AGENT_COMPAGNIE,
        )
        other_agent = AgentCompagnie.objects.create(
            utilisateur=other_agent_user,
            compagnie=other_company,
        )
        PermissionAgent.objects.create(
            agent=other_agent,
            permission=PermissionAgent.Code.SCANNER_BILLET,
        )
        self.client.force_authenticate(user=other_agent_user)

        response = self.client.post(
            reverse("billet-scan"),
            {"code_qr": self.ticket.code_qr},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("nom_passager", response.data)