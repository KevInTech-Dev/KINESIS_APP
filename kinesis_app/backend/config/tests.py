import uuid

from django.urls import reverse
from drf_spectacular.generators import SchemaGenerator
from rest_framework import status
from rest_framework.test import APITestCase


class ApiRouteSmokeTests(APITestCase):
    def test_admin_route_redirects_to_login_when_anonymous(self):
        response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn(reverse("admin:login"), response.url)

    def test_public_catalog_and_api_documentation_routes(self):
        public_routes = (
            ("ville-list", {}, status.HTTP_200_OK),
            ("voyage-list", {}, status.HTTP_200_OK),
            ("voyage-detail", {"pk": uuid.uuid4()}, status.HTTP_404_NOT_FOUND),
            ("schema", {}, status.HTTP_200_OK),
            ("swagger-ui", {}, status.HTTP_200_OK),
        )

        for route_name, kwargs, expected_status in public_routes:
            with self.subTest(route=route_name):
                response = self.client.get(reverse(route_name, kwargs=kwargs))
                self.assertEqual(response.status_code, expected_status)

    def test_authentication_routes_are_reachable(self):
        response = self.client.post(reverse("user-register"), data={}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            reverse("token-obtain-pair"),
            data={"email": "missing@example.com", "password": "invalid"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.post(reverse("token-refresh"), data={}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        protected_routes = (
            ("user-logout", "post"),
            ("user-change-password", "post"),
            ("current-user", "get"),
        )
        for route_name, method in protected_routes:
            with self.subTest(route=route_name):
                response = getattr(self.client, method)(reverse(route_name), data={})
                self.assertEqual(
                    response.status_code,
                    status.HTTP_401_UNAUTHORIZED,
                )

    def test_company_routes_are_reachable_and_protected(self):
        response = self.client.post(
            reverse("company-register"),
            data={},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.get(reverse("company-activate"))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        protected_routes = (
            ("my-company", {}),
            ("company-agents", {}),
            ("company-agent-detail", {"pk": uuid.uuid4()}),
            ("admin-user-list", {}),
        )
        for route_name, kwargs in protected_routes:
            with self.subTest(route=route_name):
                response = self.client.get(reverse(route_name, kwargs=kwargs))
                self.assertEqual(
                    response.status_code,
                    status.HTTP_401_UNAUTHORIZED,
                )

    def test_reservation_ticket_baggage_and_notification_routes_are_protected(self):
        identifier = uuid.uuid4()
        protected_routes = (
            ("reservation-list", "get", {}),
            ("reservation-detail", "get", {"pk": identifier}),
            ("reservation-cancel", "post", {"pk": identifier}),
            ("billet-list", "get", {}),
            ("billet-detail", "get", {"pk": identifier}),
            ("billet-scan", "post", {}),
            ("billet-embarquement", "post", {}),
            ("tarif-bagage-list", "get", {}),
            ("tarif-bagage-detail", "get", {"pk": identifier}),
            ("bagage-list", "get", {}),
            ("bagage-detail", "get", {"pk": identifier}),
            ("bagage-paiement-frais", "post", {"pk": identifier}),
            ("bagage-restitution", "post", {"pk": identifier}),
            ("notification-list", "get", {}),
            ("notification-read", "post", {"pk": identifier}),
            ("notification-read-all", "post", {}),
        )

        for route_name, method, kwargs in protected_routes:
            with self.subTest(route=route_name):
                response = getattr(self.client, method)(
                    reverse(route_name, kwargs=kwargs),
                    data={},
                    format="json",
                )
                self.assertEqual(
                    response.status_code,
                    status.HTTP_401_UNAUTHORIZED,
                )


class ImageUploadSchemaTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.schema = SchemaGenerator().get_schema(request=None, public=True)

    def assert_file_upload_documented(self, path, method, field):
        operation = self.schema["paths"][path][method]
        request_body = operation["requestBody"]
        self.assertIn("multipart/form-data", request_body["content"])
        schema_ref = request_body["content"]["multipart/form-data"]["schema"]["$ref"]
        component_name = schema_ref.rsplit("/", 1)[-1]
        request_component = self.schema["components"]["schemas"][component_name]
        self.assertEqual(
            request_component["properties"][field]["format"],
            "binary",
        )

    def test_profile_photo_uses_multipart_file_input(self):
        for method in ("put", "patch"):
            with self.subTest(method=method):
                self.assert_file_upload_documented(
                    "/api/v1/auth/me/",
                    method,
                    "photo_profil",
                )

    def test_trip_image_uses_multipart_file_input(self):
        self.assert_file_upload_documented("/api/v1/voyages/", "post", "image")
        for method in ("put", "patch"):
            with self.subTest(method=method):
                self.assert_file_upload_documented(
                    "/api/v1/voyages/{id}/",
                    method,
                    "image",
                )

    def test_baggage_photos_use_multipart_file_input(self):
        operation = self.schema["paths"]["/api/v1/bagages/"]["post"]
        request_body = operation["requestBody"]
        self.assertIn("multipart/form-data", request_body["content"])
        schema_ref = request_body["content"]["multipart/form-data"]["schema"]["$ref"]
        component_name = schema_ref.rsplit("/", 1)[-1]
        photos_schema = self.schema["components"]["schemas"][component_name][
            "properties"
        ]["photos"]
        self.assertEqual(photos_schema["type"], "array")
        self.assertEqual(photos_schema["items"]["format"], "binary")

    def test_company_registration_documents_use_multipart_file_input(self):
        operation = self.schema["paths"]["/api/v1/compagnies/register/"]["post"]
        request_body = operation["requestBody"]
        schema_ref = request_body["content"]["multipart/form-data"]["schema"]["$ref"]
        component_name = schema_ref.rsplit("/", 1)[-1]
        request_component = self.schema["components"]["schemas"][component_name]
        self.assertNotIn("logo", request_component.get("required", []))

        for field in ("logo", "carte_cfe", "piece_identite_gerant"):
            with self.subTest(field=field):
                self.assert_file_upload_documented(
                    "/api/v1/compagnies/register/",
                    "post",
                    field,
                )

    def test_company_profile_logo_uses_multipart_file_input(self):
        for method in ("put", "patch"):
            with self.subTest(method=method):
                self.assert_file_upload_documented(
                    "/api/v1/compagnies/me/",
                    method,
                    "logo",
                )


class AdminAndReservationSchemaTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.schema = SchemaGenerator().get_schema(request=None, public=True)

    def test_admin_user_listing_documents_role_filter_and_pagination(self):
        operation = self.schema["paths"]["/api/v1/auth/users/"]["get"]
        parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}

        self.assertIn("role", parameters)
        self.assertIn("page", parameters)
        self.assertIn("page_size", parameters)
        self.assertEqual(
            set(parameters["role"]["schema"]["enum"]),
            {"VOYAGEUR", "COMPAGNIE", "AGENT_COMPAGNIE", "ADMINISTRATEUR"},
        )

    def test_group_reservation_documents_each_passenger_as_list_item(self):
        operation = self.schema["paths"]["/api/v1/reservations/"]["post"]
        schema_ref = operation["requestBody"]["content"]["application/json"]["schema"][
            "$ref"
        ]
        component_name = schema_ref.rsplit("/", 1)[-1]
        passagers = self.schema["components"]["schemas"][component_name]["properties"][
            "passagers"
        ]

        self.assertEqual(passagers["type"], "array")
        self.assertIn("un nom complet par élément", passagers["description"].casefold())
        examples = operation["requestBody"]["content"]["application/json"]["examples"]
        self.assertIn(
            ["Jean", "Kévin", "Julien"],
            [example["value"]["passagers"] for example in examples.values()],
        )
