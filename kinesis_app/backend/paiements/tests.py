import hashlib
import hmac
import json
import time as time_module
from datetime import time, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
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

from .fedapay import (
    _request_json,
    create_payment_link,
    create_transaction,
    retrieve_transaction,
)
from .models import BilletElectronique, Paiement
from .services import (
    apply_verified_fedapay_event,
    start_payment_attempt,
    sync_fedapay_transaction,
)

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

        payment.reference_fedapay = "1001"
        payment.save(update_fields=("reference_fedapay",))
        confirmed = apply_verified_fedapay_event(
            paiement_id=payment.pk,
            reference_fedapay="1001",
            event_id="evt-test-1001",
            montant=Decimal("10000"),
            response_data={"status": "verified"},
        )
        duplicate = apply_verified_fedapay_event(
            paiement_id=payment.pk,
            reference_fedapay="1001",
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
            payment.reference_fedapay = "1002"
            payment.save(update_fields=("reference_fedapay",))
            apply_verified_fedapay_event(
                paiement_id=payment.pk,
                reference_fedapay="1002",
                event_id="evt-test-1002",
                montant=Decimal("9999"),
                response_data={"status": "verified"},
            )

        payment.refresh_from_db()
        self.assertEqual(payment.statut, Paiement.Statut.EN_ATTENTE)
        self.assertEqual(BilletElectronique.objects.count(), 0)

    def test_late_confirmed_payment_is_reconciled_without_issuing_tickets(self):
        payment = start_payment_attempt(
            reservation_id=self.reservation.pk,
            voyageur=self.traveler,
        )
        payment.reference_fedapay = "1003"
        payment.save(update_fields=("reference_fedapay",))
        reservation_place = self.reservation.places.first()
        self.reservation.date_expiration = timezone.now() - timedelta(seconds=1)
        self.reservation.save(update_fields=("date_expiration",))
        transaction_data = {
            "id": 1003,
            "amount": 10000,
            "status": "approved",
            "approved_at": timezone.now().isoformat(),
        }

        sync_fedapay_transaction(
            payment=payment,
            provider_transaction=transaction_data,
        )
        sync_fedapay_transaction(
            payment=payment,
            provider_transaction=transaction_data,
        )

        payment.refresh_from_db()
        self.reservation.refresh_from_db()
        reservation_place.refresh_from_db()
        self.assertEqual(payment.statut, Paiement.Statut.A_RECONCILIER)
        self.assertEqual(self.reservation.statut, Reservation.Statut.EXPIREE)
        self.assertTrue(reservation_place.liberee)
        self.assertEqual(BilletElectronique.objects.count(), 0)
        self.assertEqual(
            Notification.objects.filter(
                utilisateur=self.traveler,
                titre="Paiement à réconcilier",
            ).count(),
            1,
        )

    def test_on_time_confirmation_is_honored_if_expiration_has_not_released_seats(self):
        payment = start_payment_attempt(
            reservation_id=self.reservation.pk,
            voyageur=self.traveler,
        )
        payment.reference_fedapay = "1004"
        payment.save(update_fields=("reference_fedapay",))
        expiration = timezone.now() - timedelta(seconds=1)
        self.reservation.date_expiration = expiration
        self.reservation.save(update_fields=("date_expiration",))

        confirmed = sync_fedapay_transaction(
            payment=payment,
            provider_transaction={
                "id": 1004,
                "amount": 10000,
                "status": "approved",
                "approved_at": (expiration - timedelta(seconds=1)).isoformat(),
            },
        )

        self.reservation.refresh_from_db()
        self.assertEqual(confirmed.statut, Paiement.Statut.CONFIRME)
        self.assertEqual(self.reservation.statut, Reservation.Statut.PAYEE)
        self.assertEqual(BilletElectronique.objects.count(), 2)

    def test_approved_payment_with_wrong_amount_is_reconciled(self):
        payment = start_payment_attempt(
            reservation_id=self.reservation.pk,
            voyageur=self.traveler,
        )
        payment.reference_fedapay = "1005"
        payment.save(update_fields=("reference_fedapay",))
        transaction_data = {
            "id": 1005,
            "amount": 9000,
            "status": "approved",
            "approved_at": timezone.now().isoformat(),
        }

        sync_fedapay_transaction(
            payment=payment,
            provider_transaction=transaction_data,
        )
        sync_fedapay_transaction(
            payment=payment,
            provider_transaction=transaction_data,
        )

        payment.refresh_from_db()
        self.reservation.refresh_from_db()
        self.assertEqual(payment.statut, Paiement.Statut.A_RECONCILIER)
        self.assertEqual(
            self.reservation.statut, Reservation.Statut.EN_ATTENTE_PAIEMENT
        )
        self.assertEqual(BilletElectronique.objects.count(), 0)
        self.assertEqual(
            Notification.objects.filter(
                utilisateur=self.traveler,
                titre="Paiement à réconcilier",
            ).count(),
            1,
        )


class PaiementApiTests(APITestCase):
    password = "Qx7!mR4#vN8p"

    def setUp(self):
        company_user = User.objects.create_user(
            email="paiement-compagnie@example.com",
            password=self.password,
            nom="Transport",
            role=User.Role.COMPAGNIE,
        )
        company = Compagnie.objects.create(
            utilisateur=company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        self.traveler = User.objects.create_user(
            email="paiement-voyageur@example.com",
            password=self.password,
            nom="Doe",
            prenoms="Jane",
            telephone="+22890000000",
            role=User.Role.VOYAGEUR,
        )
        departure = Ville.objects.create(nom="Lome")
        arrival = Ville.objects.create(nom="Kara")
        voyage = Voyage.objects.create(
            compagnie=company,
            ville_depart=departure,
            ville_arrivee=arrival,
            date_depart=timezone.localdate() + timedelta(days=2),
            heure_depart=time(9, 0),
            place_totale=2,
            prix="5000",
        )
        self.reservation = create_reservation(
            voyageur=self.traveler,
            voyage_id=voyage.pk,
            passenger_names=["Jane Doe"],
        )
        self.client.force_authenticate(user=self.traveler)

    def test_initiation_returns_provider_checkout_url(self):
        with (
            patch("paiements.services.create_transaction", return_value="98765"),
            patch(
                "paiements.services.create_payment_link",
                return_value="https://checkout.fedapay.com/example",
            ) as create_link,
        ):
            response = self.client.post(
                reverse(
                    "payment-attempt",
                    kwargs={"reservation_id": self.reservation.pk},
                )
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payment = Paiement.objects.get(pk=response.data["id_paiement"])
        self.assertEqual(payment.montant, Decimal(5000))
        self.assertEqual(payment.reference_fedapay, "98765")
        self.assertEqual(
            response.data["payment_url"],
            "https://checkout.fedapay.com/example",
        )
        create_link.assert_called_once_with("98765")

    def test_repeated_initiation_reuses_same_provider_transaction(self):
        with (
            patch(
                "paiements.services.create_transaction",
                return_value="98766",
            ) as create_transaction_mock,
            patch(
                "paiements.services.create_payment_link",
                return_value="https://checkout.fedapay.com/example",
            ),
        ):
            first = self.client.post(
                reverse(
                    "payment-attempt",
                    kwargs={"reservation_id": self.reservation.pk},
                )
            )
            second = self.client.post(
                reverse(
                    "payment-attempt",
                    kwargs={"reservation_id": self.reservation.pk},
                )
            )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(first.data["id_paiement"], second.data["id_paiement"])
        create_transaction_mock.assert_called_once()

    def test_payment_status_is_synchronized_from_provider(self):
        with (
            patch("paiements.services.create_transaction", return_value="98767"),
            patch(
                "paiements.services.create_payment_link",
                return_value="https://checkout.fedapay.com/example",
            ),
        ):
            initiated = self.client.post(
                reverse(
                    "payment-attempt",
                    kwargs={"reservation_id": self.reservation.pk},
                )
            )

        with patch(
            "paiements.fedapay.retrieve_transaction",
            return_value={
                "id": 98767,
                "amount": 5000,
                "status": "approved",
                "approved_at": timezone.now().isoformat(),
            },
        ):
            response = self.client.get(
                reverse(
                    "payment-detail",
                    kwargs={"pk": initiated.data["id_paiement"]},
                )
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["statut"], Paiement.Statut.CONFIRME)
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.statut, Reservation.Statut.PAYEE)
        self.assertEqual(BilletElectronique.objects.count(), 1)

    def test_other_traveler_cannot_read_payment(self):
        payment = Paiement.objects.create(
            reservation=self.reservation,
            montant=self.reservation.montant_total,
            reference_fedapay="98768",
        )
        other_traveler = User.objects.create_user(
            email="autre-voyageur@example.com",
            password=self.password,
            nom="Autre",
            role=User.Role.VOYAGEUR,
        )
        self.client.force_authenticate(user=other_traveler)

        response = self.client.get(reverse("payment-detail", kwargs={"pk": payment.pk}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class FedaPayGatewayTests(TestCase):
    @override_settings(
        FEDAPAY_ENVIRONMENT="sandbox",
        FEDAPAY_SECRET_KEY="test_secret",
    )
    @patch("paiements.fedapay.urlopen")
    def test_api_request_uses_sandbox_host_and_bearer_key(self, mocked_urlopen):
        response = mocked_urlopen.return_value.__enter__.return_value
        response.read.return_value = b'{"id": 12345}'

        payload = _request_json("GET", "/transactions/12345")

        request = mocked_urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://sandbox-api.fedapay.com/v1/transactions/12345",
        )
        self.assertEqual(
            request.get_header("Authorization"),
            "Bearer test_secret",
        )
        self.assertEqual(payload, {"id": 12345})

    @override_settings(
        FEDAPAY_ENVIRONMENT="sandbox",
        FEDAPAY_CALLBACK_URL="https://kinesis.example/payment/return",
    )
    @patch("paiements.fedapay._request_json")
    def test_sandbox_transaction_uses_fedapay_test_mode_and_checkout_link(
        self,
        request_json,
    ):
        traveler = SimpleNamespace(
            email="traveler@example.com",
            prenoms="Jane",
            nom="Doe",
        )
        reservation = SimpleNamespace(
            reference="RES-TEST-1",
            voyageur=traveler,
        )
        payment = SimpleNamespace(
            pk="payment-uuid",
            montant=Decimal(5000),
            reservation=reservation,
        )
        request_json.side_effect = [
            {"data": {"id": 12345, "amount": 5000}},
            {"url": "https://checkout.fedapay.com/example"},
            {"data": {"id": 12345, "status": "pending"}},
        ]

        transaction_id = create_transaction(payment)
        payment_url = create_payment_link(transaction_id)
        transaction = retrieve_transaction(transaction_id)

        create_call = request_json.call_args_list[0]
        payload = create_call.args[2]
        self.assertEqual(create_call.args[:2], ("POST", "/transactions"))
        self.assertEqual(payload["amount"], 5000)
        self.assertEqual(payload["currency"], {"iso": "XOF"})
        self.assertEqual(payload["mode"], "momo_test")
        self.assertEqual(
            payload["callback_url"],
            "https://kinesis.example/payment/return?payment_id=payment-uuid",
        )
        self.assertEqual(
            payload["custom_metadata"]["kinesis_payment_id"],
            "payment-uuid",
        )
        self.assertEqual(transaction_id, "12345")
        self.assertEqual(payment_url, "https://checkout.fedapay.com/example")
        self.assertEqual(transaction["status"], "pending")
        self.assertEqual(
            request_json.call_args_list[1].args[:2],
            ("POST", "/transactions/12345/token"),
        )
        self.assertEqual(
            request_json.call_args_list[2].args[:2],
            ("GET", "/transactions/12345"),
        )


class FedaPayWebhookApiTests(APITestCase):
    def setUp(self):
        company_user = User.objects.create_user(
            email="webhook-compagnie@example.com",
            password="Qx7!mR4#vN8p",
            nom="Transport",
            role=User.Role.COMPAGNIE,
        )
        company = Compagnie.objects.create(
            utilisateur=company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        traveler = User.objects.create_user(
            email="webhook-voyageur@example.com",
            password="Qx7!mR4#vN8p",
            nom="Doe",
            role=User.Role.VOYAGEUR,
        )
        departure = Ville.objects.create(nom="Lome")
        arrival = Ville.objects.create(nom="Kara")
        voyage = Voyage.objects.create(
            compagnie=company,
            ville_depart=departure,
            ville_arrivee=arrival,
            date_depart=timezone.localdate() + timedelta(days=2),
            heure_depart=time(9, 0),
            place_totale=1,
            prix="5000",
        )
        self.reservation = create_reservation(
            voyageur=traveler,
            voyage_id=voyage.pk,
            passenger_names=["Jane Doe"],
        )
        self.payment = Paiement.objects.create(
            reservation=self.reservation,
            montant=5000,
            reference_fedapay="12345",
        )
        self.webhook_url = reverse("fedapay-webhook")

    def signed_headers(self, body, *, secret="wh_sandbox_test", timestamp=None):
        timestamp = int(time_module.time()) if timestamp is None else timestamp
        signed_payload = str(timestamp).encode("ascii") + b"." + body
        signature = hmac.new(
            secret.encode("utf-8"),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()
        return {"HTTP_X_FEDAPAY_SIGNATURE": f"t={timestamp},s={signature}"}

    @override_settings(FEDAPAY_WEBHOOK_SECRET="wh_sandbox_test")
    def test_signed_webhook_verifies_transaction_and_confirms_payment_once(self):
        body = json.dumps(
            {"name": "transaction.approved", "object": {"id": 12345}},
            separators=(",", ":"),
        ).encode("utf-8")
        provider_transaction = {
            "id": 12345,
            "amount": 5000,
            "status": "approved",
            "approved_at": timezone.now().isoformat(),
        }
        with patch(
            "paiements.views.retrieve_transaction",
            return_value=provider_transaction,
        ) as retrieve:
            response = self.client.generic(
                "POST",
                self.webhook_url,
                body,
                content_type="application/json",
                **self.signed_headers(body),
            )
            duplicate_response = self.client.generic(
                "POST",
                self.webhook_url,
                body,
                content_type="application/json",
                **self.signed_headers(body),
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(duplicate_response.status_code, status.HTTP_200_OK)
        self.assertEqual(retrieve.call_count, 2)
        self.payment.refresh_from_db()
        self.reservation.refresh_from_db()
        self.assertEqual(self.payment.statut, Paiement.Statut.CONFIRME)
        self.assertEqual(self.reservation.statut, Reservation.Statut.PAYEE)
        self.assertEqual(BilletElectronique.objects.count(), 1)

    @override_settings(FEDAPAY_WEBHOOK_SECRET="wh_sandbox_test")
    def test_webhook_rejects_invalid_or_expired_signatures(self):
        body = json.dumps(
            {"name": "transaction.approved", "object": {"id": 12345}}
        ).encode("utf-8")
        invalid_response = self.client.generic(
            "POST",
            self.webhook_url,
            body,
            content_type="application/json",
            HTTP_X_FEDAPAY_SIGNATURE="t=1,s=invalid",
        )
        expired_response = self.client.generic(
            "POST",
            self.webhook_url,
            body,
            content_type="application/json",
            **self.signed_headers(body, timestamp=int(time_module.time()) - 301),
        )

        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(expired_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.statut, Paiement.Statut.EN_ATTENTE)


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
