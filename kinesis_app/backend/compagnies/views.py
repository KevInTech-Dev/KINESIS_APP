from django.conf import settings
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, parsers, serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_400_BAD_REQUEST
from rest_framework.views import APIView

from config.pagination import StandardResultsSetPagination

from .models import AgentCompagnie, Compagnie
from .permissions import IsActiveCompany
from .serializers import (
    AgentCreateSerializer,
    AgentSerializer,
    AgentUpdateSerializer,
    CompanyProfileSerializer,
    CompanyRegistrationSerializer,
)

ACTIVATION_TOKEN_SALT = "compagnies.activation"


class CompanyRegistrationView(generics.CreateAPIView):
    queryset = Compagnie.objects.all()
    serializer_class = CompanyRegistrationSerializer
    permission_classes = [AllowAny]
    parser_classes = (parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser)


class CompanyActivationView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="token",
                type=str,
                location=OpenApiParameter.QUERY,
                required=True,
            )
        ],
        responses={
            HTTP_200_OK: inline_serializer(
                name="CompanyActivationResponse",
                fields={"detail": serializers.CharField()},
            ),
            HTTP_400_BAD_REQUEST: inline_serializer(
                name="CompanyActivationError",
                fields={"detail": serializers.CharField()},
            ),
        },
    )
    def get(self, request):
        token = request.query_params.get("token", "")
        try:
            payload = signing.loads(
                token,
                salt=ACTIVATION_TOKEN_SALT,
                max_age=settings.COMPANY_ACTIVATION_TOKEN_MAX_AGE,
            )
        except (BadSignature, SignatureExpired):
            return Response(
                {"detail": "Lien d’activation invalide ou expiré."},
                status=HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            compagnie = get_object_or_404(
                Compagnie.objects.select_for_update().select_related("utilisateur"),
                pk=payload.get("compagnie_id"),
                statut=Compagnie.Statut.EN_ATTENTE_ACTIVATION,
            )
            compagnie.statut = Compagnie.Statut.ACTIVE
            compagnie.save(update_fields=("statut",))
            compagnie.utilisateur.is_active = True
            compagnie.utilisateur.save(update_fields=("is_active",))

        return Response(
            {"detail": "Votre compte compagnie est activé."},
            status=HTTP_200_OK,
        )


class MyCompanyView(generics.RetrieveUpdateAPIView):
    serializer_class = CompanyProfileSerializer
    permission_classes = [IsActiveCompany]
    parser_classes = (parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser)

    def get_object(self):
        return self.request.user.profil_compagnie


class AgentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsActiveCompany]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return (
            AgentCompagnie.objects.filter(compagnie=self.request.user.profil_compagnie)
            .select_related("utilisateur")
            .prefetch_related("permissions")
            .order_by("utilisateur__email", "utilisateur_id")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return AgentCreateSerializer
        return AgentSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save(compagnie=self.request.user.profil_compagnie)


class AgentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsActiveCompany]

    def get_queryset(self):
        return (
            AgentCompagnie.objects.filter(compagnie=self.request.user.profil_compagnie)
            .select_related("utilisateur")
            .prefetch_related("permissions")
        )

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return AgentUpdateSerializer
        return AgentSerializer

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()