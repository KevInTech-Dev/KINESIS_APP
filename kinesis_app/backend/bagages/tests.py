import io
from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from compagnies.models import AgentCompagnie, Compagnie, PermissionAgent
from notifications.models import Notification
from reservations.models import Reservation
from reservations.services import create_reservation
from voyages.models import Ville, Voyage

from .models import Bagage, PhotoBagage, TarifBagage
from .services import (
    create_tariff,
    record_manual_fee_payment,
    register_baggage,
    return_baggage,
)
from .storage import AuthenticatedBagageStorage

User = get_user_model()


def make_image(name="baggage.png"):
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), color="red").save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


class BagageServiceTests(TestCase):
    password = "Qx7!mR4#vN8p"

    def setUp(self):
        self.company_user = User.objects.create_user(
            email="compagnie@example.com",
            password=self.password,
            nom="Transport",
            prenoms="Kinesis",
            role=User.Role.COMPAGNIE,
        )
        self.company = Compagnie.objects.create(
            utilisateur=self.company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        self.traveler = User.objects.create_user(
            email="voyageur@example.com",
            password=self.password,
            nom="Doe",
            prenoms="Jane",
            role=User.Role.VOYAGEUR,
        )
        departure = Ville.objects.create(nom="Lome")
        arrival = Ville.objects.create(nom="Sokode")
        voyage = Voyage.objects.create(
            compagnie=self.company,
            ville_depart=departure,
            ville_arrivee=arrival,
            date_depart=timezone.localdate() + timedelta(days=2),
            heure_depart=time(9, 0),
            place_totale=20,
            prix="5000",
        )
        self.reservation = create_reservation(
            voyageur=self.traveler,
            voyage_id=voyage.pk,
            passenger_names=["Jane Doe"],
        )
        self.reservation.statut = Reservation.Statut.PAYEE
        self.reservation.save(update_fields=("statut",))
        self.tariff = create_tariff(
            actor=self.company_user,
            poids_min=0,
            poids_max=20,
            prix=1000,
        )

    def test_tariff_grid_rejects_gaps_and_accepts_contiguous_bands(self):
        with self.assertRaises(ValidationError):
            create_tariff(
                actor=self.company_user,
                poids_min=25,
                poids_max=40,
                prix=2000,
            )

        second = create_tariff(
            actor=self.company_user,
            poids_min=20,
            poids_max=40,
            prix=2000,
        )
        self.assertEqual(second.poids_min, 20)
        self.assertEqual(TarifBagage.objects.filter(compagnie=self.company).count(), 2)

    @patch.object(AuthenticatedBagageStorage, "_save", return_value="bagages/private.png")
    def test_registration_snapshots_tariff_requires_photos_and_fee_payment_is_manual(
        self,
        _mock_save,
    ):
        agent_user = User.objects.create_user(
            email="agent-notifications-bagage@example.com",
            password=self.password,
            nom="Agent bagages",
            role=User.Role.AGENT_COMPAGNIE,
        )
        agent = AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=self.company,
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.CONSULTER_BAGAGES,
        )

        baggage = register_baggage(
            actor=self.company_user,
            reservation_id=self.reservation.pk,
            poids=12,
            description="Valise bleue",
            photo_files=[make_image()],
        )

        self.assertEqual(baggage.frais_total, Decimal("1000"))
        self.assertEqual(baggage.prix_tarif_applique, Decimal("1000"))
        self.assertEqual(baggage.poids_min_applique, Decimal("0"))
        self.assertEqual(baggage.poids_max_applique, Decimal("20"))
        self.assertEqual(baggage.photos.count(), 1)
        self.assertFalse(baggage.frais_payes)
        self.assertEqual(_mock_save.call_count, 1)
        self.assertEqual(
            Notification.objects.filter(utilisateur=self.traveler).count(),
            2,
        )
        self.assertEqual(
            Notification.objects.filter(
                utilisateur=agent_user,
                titre="Bagage enregistré",
            ).count(),
            1,
        )

        paid = record_manual_fee_payment(
            actor=self.company_user,
            baggage_id=baggage.pk,
        )
        self.assertTrue(paid.frais_payes)
        self.assertEqual(paid.paiement_enregistre_par, self.company_user)
        self.assertIsNotNone(paid.date_paiement_frais)
        self.assertEqual(
            Notification.objects.filter(utilisateur=self.traveler).count(),
            3,
        )
        self.assertEqual(
            Notification.objects.filter(
                utilisateur=agent_user,
                titre="Frais de bagage enregistrés",
            ).count(),
            1,
        )

    @patch.object(AuthenticatedBagageStorage, "_save", return_value="bagages/private.png")
    def test_agent_requires_individual_permission_and_return_requires_paid_fees(
        self,
        _mock_save,
    ):
        agent_user = User.objects.create_user(
            email="agent@example.com",
            password=self.password,
            nom="Agent",
            prenoms="Test",
            role=User.Role.AGENT_COMPAGNIE,
        )
        agent = AgentCompagnie.objects.create(
            utilisateur=agent_user,
            compagnie=self.company,
        )

        with self.assertRaises(PermissionDenied):
            register_baggage(
                actor=agent_user,
                reservation_id=self.reservation.pk,
                poids=12,
                photo_files=[make_image()],
            )

        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.ENREGISTRER_BAGAGE,
        )
        baggage = register_baggage(
            actor=agent_user,
            reservation_id=self.reservation.pk,
            poids=12,
            photo_files=[make_image()],
        )
        PermissionAgent.objects.create(
            agent=agent,
            permission=PermissionAgent.Code.RESTITUER_BAGAGE,
        )
        with self.assertRaises(ValidationError):
            return_baggage(actor=agent_user, baggage_id=baggage.pk)

        baggage = record_manual_fee_payment(actor=agent_user, baggage_id=baggage.pk)
        returned = return_baggage(actor=agent_user, baggage_id=baggage.pk)
        self.assertEqual(returned.statut, Bagage.Statut.RESTITUE)
        self.assertEqual(returned.restitue_par, agent_user)
        self.assertEqual(
            Notification.objects.filter(utilisateur=self.traveler).count(),
            4,
        )

        with self.assertRaises(ValidationError):
            return_baggage(actor=agent_user, baggage_id=baggage.pk)

    def test_cloudinary_upload_and_delivery_use_authenticated_asset_type(self):
        with patch("bagages.storage.cloudinary.uploader.upload") as upload:
            upload.return_value = {"public_id": "bagages/photo"}
            AuthenticatedBagageStorage()._upload("bagages/photo.png", make_image())

        self.assertEqual(upload.call_args.kwargs["type"], "authenticated")
        self.assertEqual(upload.call_args.kwargs["access_mode"], "authenticated")

        with patch(
            "bagages.storage.cloudinary_url",
            return_value=("https://signed.example/private-photo", {}),
        ) as make_url:
            url = AuthenticatedBagageStorage().url("bagages/photo")

        self.assertEqual(url, "https://signed.example/private-photo")
        self.assertEqual(make_url.call_args.kwargs["type"], "authenticated")
        self.assertTrue(make_url.call_args.kwargs["sign_url"])


class BagageApiTests(APITestCase):
    password = "Qx7!mR4#vN8p"

    def setUp(self):
        company_user = User.objects.create_user(
            email="compagnie@example.com",
            password=self.password,
            nom="Transport",
            prenoms="Kinesis",
            role=User.Role.COMPAGNIE,
        )
        self.company = Compagnie.objects.create(
            utilisateur=company_user,
            statut=Compagnie.Statut.ACTIVE,
        )
        departure = Ville.objects.create(nom="Kara")
        arrival = Ville.objects.create(nom="Atakpame")
        voyage = Voyage.objects.create(
            compagnie=self.company,
            ville_depart=departure,
            ville_arrivee=arrival,
            date_depart=timezone.localdate() + timedelta(days=2),
            heure_depart=time(9, 0),
            place_totale=10,
            prix="5000",
        )
        self.traveler = User.objects.create_user(
            email="voyageur@example.com",
            password=self.password,
            nom="Doe",
            prenoms="Jane",
            role=User.Role.VOYAGEUR,
        )
        self.reservation = create_reservation(
            voyageur=self.traveler,
            voyage_id=voyage.pk,
            passenger_names=["Jane Doe"],
        )
        self.reservation.statut = Reservation.Statut.PAYEE
        self.reservation.save(update_fields=("statut",))
        TarifBagage.objects.create(
            compagnie=self.company,
            poids_min=0,
            poids_max=20,
            prix=1000,
        )
        self.company_user = company_user

    @patch.object(AuthenticatedBagageStorage, "_save", return_value="bagages/private.png")
    @patch("bagages.storage.cloudinary_url", return_value=("https://signed.example/private", {}))
    def test_company_registers_baggage_with_private_photo(self, _url, _save):
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.company_user)}"
        )
        response = self.client.post(
            reverse("bagage-list"),
            {
                "reservation_id": str(self.reservation.pk),
                "poids": "12",
                "photos": [make_image()],
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["frais_total"], "1000")
        self.assertEqual(response.data["photos"][0]["url"], "https://signed.example/private")
        self.assertEqual(_save.call_count, 1)

    @patch.object(AuthenticatedBagageStorage, "_save", return_value="bagages/private.png")
    def test_traveler_only_lists_baggage_from_owned_reservations(self, _save):
        baggage = register_baggage(
            actor=self.company_user,
            reservation_id=self.reservation.pk,
            poids=12,
            photo_files=[make_image()],
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.traveler)}"
        )

        response = self.client.get(reverse("bagage-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id_bagage"], str(baggage.pk))

        other = User.objects.create_user(
            email="autre@example.com",
            password=self.password,
            nom="Autre",
            prenoms="Voyageur",
            role=User.Role.VOYAGEUR,
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(other)}"
        )
        self.assertEqual(self.client.get(reverse("bagage-list")).data, [])
