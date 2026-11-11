from django.conf import settings
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.db import transaction
from django.db.models.functions import Lower
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, parsers, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_400_BAD_REQUEST
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config.pagination import StandardResultsSetPagination
from utilisateurs.models import Utilisateur
from utilisateurs.permissions import IsKinesisAdministrator
from utilisateurs.email_verification import send_verification_code

from .agent_invitations import activate_agent_account, resend_agent_invitation
from .models import AgentCompagnie, Compagnie, Gare
from .permissions import IsActiveCompany
from .serializers import (
    AdminCompanyReviewSerializer,
    AgentActivationSerializer,
    AgentCreateSerializer,
    AgentInvitationLookupSerializer,
    AgentSerializer,
    AgentUpdateSerializer,
    CompanyProfileSerializer,
    CompanyRegistrationSerializer,
    GareSerializer,
)
from .services import (
    ACTIVATION_TOKEN_SALT,
    approve_company,
    deactivate_company,
    refuse_company,
)


class CompanyRegistrationView(generics.CreateAPIView):
    queryset = Compagnie.objects.all()
    serializer_class = CompanyRegistrationSerializer
    permission_classes = [AllowAny]
    parser_classes = (parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser)

    @extend_schema(
        responses={
            200: serializers.DictField(),
            202: serializers.DictField(),
        }
    )
    def create(self, request, *args, **kwargs):
        email = request.data.get("email", "")
        password = request.data.get("password", "")
        existing_user = (
            Utilisateur.objects.filter(email__iexact=email).first()
            if isinstance(email, str) and email
            else None
        )
        if (
            existing_user
            and isinstance(password, str)
            and password
            and existing_user.role == Utilisateur.Role.COMPAGNIE
            and existing_user.check_password(password)
        ):
            try:
                company = existing_user.profil_compagnie
            except Compagnie.DoesNotExist:
                company = None
            if company:
                details = {
                    Compagnie.Statut.EN_ATTENTE_VERIFICATION_EMAIL: (
                        "Votre dossier est enregistré. Vérifiez votre adresse "
                        "e-mail avec le code envoyé pour le transmettre à KINESIS."
                    ),
                    Compagnie.Statut.EN_ATTENTE_VALIDATION: (
                        "Votre demande est déjà enregistrée et reste en attente "
                        "de validation. Aucun doublon n’a été créé."
                    ),
                    Compagnie.Statut.EN_ATTENTE_ACTIVATION: (
                        "Votre dossier a déjà été validé. Consultez votre e-mail "
                        "pour activer le compte de la compagnie."
                    ),
                    Compagnie.Statut.ACTIVE: (
                        "Le compte de votre compagnie est déjà activé. "
                        "Vous pouvez vous connecter."
                    ),
                    Compagnie.Statut.REFUSEE: (
                        "Cette demande a déjà été examinée. Contactez KINESIS "
                        "pour connaître les suites possibles."
                    ),
                    Compagnie.Statut.DESACTIVE: (
                        "Le compte de cette compagnie existe déjà mais il est "
                        "désactivé. Contactez KINESIS."
                    ),
                }
                detail = details.get(company.statut)
                if detail:
                    if (
                        company.statut
                        == Compagnie.Statut.EN_ATTENTE_VERIFICATION_EMAIL
                    ):
                        code_sent = send_verification_code(
                            existing_user,
                            reuse_valid=True,
                        )
                        return Response(
                            {
                                "detail": (
                                    "Un code de vérification a été envoyé à votre "
                                    "adresse e-mail."
                                    if code_sent
                                    else (
                                        "Votre dossier est déjà enregistré. "
                                        "Utilisez le code encore valide reçu "
                                        "précédemment, ou demandez un nouveau code."
                                    )
                                )
                            },
                            status=status.HTTP_202_ACCEPTED,
                        )
                    return Response(
                        {"detail": detail},
                        status=status.HTTP_200_OK,
                    )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        send_verification_code(serializer.instance.utilisateur)
        headers = self.get_success_headers(serializer.data)
        return Response(
            {
                "detail": (
                    "Un code de vérification a été envoyé à votre adresse e-mail. "
                    "Votre dossier ne sera transmis à l’administration qu’après "
                    "la vérification du code."
                )
            },
            status=status.HTTP_202_ACCEPTED,
            headers=headers,
        )


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
            )
            if (
                compagnie.statut == Compagnie.Statut.ACTIVE
                and compagnie.utilisateur.is_active
            ):
                return Response(
                    {"detail": "Votre compte compagnie est déjà activé."},
                    status=HTTP_200_OK,
                )
            if compagnie.statut != Compagnie.Statut.EN_ATTENTE_ACTIVATION:
                return Response(
                    {"detail": "Ce compte ne peut plus être activé avec ce lien."},
                    status=HTTP_400_BAD_REQUEST,
                )
            compagnie.statut = Compagnie.Statut.ACTIVE
            compagnie.save(update_fields=("statut",))
            compagnie.utilisateur.is_active = True
            compagnie.utilisateur.save(update_fields=("is_active",))

        return Response(
            {"detail": "Votre compte compagnie est activé."},
            status=HTTP_200_OK,
        )


class AgentInvitationActivationView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "agent_activation"

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="token",
                type=str,
                location=OpenApiParameter.QUERY,
                required=True,
            )
        ],
        responses={HTTP_200_OK: serializers.DictField()},
    )
    def get(self, request):
        serializer = AgentInvitationLookupSerializer(
            data={"token": request.query_params.get("token", "")}
        )
        serializer.is_valid(raise_exception=True)
        agent = serializer.validated_data["agent"]
        return Response({"email": agent.utilisateur.email})

    @extend_schema(
        request=AgentActivationSerializer,
        responses={HTTP_200_OK: serializers.DictField()},
    )
    def post(self, request):
        serializer = AgentActivationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tokens = activate_agent_account(
            token=serializer.validated_data["token"],
            password=serializer.validated_data["new_password"],
        )
        return Response(
            {
                **tokens,
                "detail": "Compte activé. Votre espace agent est prêt.",
            },
            status=HTTP_200_OK,
        )


class AdminCompanyListView(generics.ListAPIView):
    serializer_class = AdminCompanyReviewSerializer
    permission_classes = (IsKinesisAdministrator,)
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        queryset = Compagnie.objects.select_related("utilisateur").order_by(
            "-utilisateur__date_creation",
            "statut",
            Lower("nom_commercial"),
            "utilisateur_id",
        )
        queryset = queryset.filter(utilisateur__email_verified=True)
        status_filter = self.request.query_params.get("status")
        if status_filter:
            if status_filter not in Compagnie.Statut.values:
                raise ValidationError(
                    {"status": "Statut de compagnie invalide."}
                )
            queryset = queryset.filter(statut=status_filter)
        return queryset


class AdminCompanyActionView(APIView):
    permission_classes = (IsKinesisAdministrator,)
    action = None

    def post(self, request, pk):
        if self.action == "approve":
            company = approve_company(company_id=pk)
        elif self.action == "refuse":
            company = refuse_company(company_id=pk)
        elif self.action == "deactivate":
            company = deactivate_company(company_id=pk)
        else:
            raise ValidationError({"action": "Action administrateur invalide."})
        return Response(
            AdminCompanyReviewSerializer(company, context={"request": request}).data
        )


class AdminCompanyApproveView(AdminCompanyActionView):
    action = "approve"


class AdminCompanyRefuseView(AdminCompanyActionView):
    action = "refuse"


class AdminCompanyDeactivateView(AdminCompanyActionView):
    action = "deactivate"


class MyCompanyView(generics.RetrieveUpdateAPIView):
    serializer_class = CompanyProfileSerializer
    permission_classes = [IsActiveCompany]
    parser_classes = (parsers.JSONParser, parsers.FormParser, parsers.MultiPartParser)

    def get_object(self):
        return self.request.user.profil_compagnie


class CompanyStationListCreateView(generics.ListCreateAPIView):
    serializer_class = GareSerializer
    permission_classes = [IsActiveCompany]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return Gare.objects.filter(
            compagnie=self.request.user.profil_compagnie,
        ).select_related("ville")

    def perform_create(self, serializer):
        serializer.save(compagnie=self.request.user.profil_compagnie)


class CompanyStationDetailView(generics.UpdateAPIView):
    serializer_class = GareSerializer
    permission_classes = [IsActiveCompany]
    http_method_names = ("patch", "options", "head")

    def get_queryset(self):
        return Gare.objects.filter(
            compagnie=self.request.user.profil_compagnie,
        ).select_related("ville")

    def get_serializer(self, *args, **kwargs):
        kwargs["partial"] = True
        return super().get_serializer(*args, **kwargs)


class AgentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsActiveCompany]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return (
            AgentCompagnie.objects.filter(compagnie=self.request.user.profil_compagnie)
            .select_related("utilisateur")
            .prefetch_related("permissions")
            .order_by(
                "-utilisateur__date_creation",
                Lower("utilisateur__nom"),
                Lower("utilisateur__prenoms"),
                Lower("utilisateur__email"),
                "utilisateur_id",
            )
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

    @transaction.atomic
    def perform_destroy(self, instance):
        user = instance.utilisateur
        user.is_active = False
        user.save(update_fields=("is_active",))
        instance.delete()


class AgentInvitationResendView(APIView):
    permission_classes = (IsActiveCompany,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "agent_invitation_resend"

    @extend_schema(responses={HTTP_200_OK: serializers.DictField()})
    def post(self, request, pk):
        agent = get_object_or_404(
            AgentCompagnie.objects.select_related("utilisateur", "compagnie"),
            pk=pk,
            compagnie=request.user.profil_compagnie,
        )
        resend_agent_invitation(agent)
        return Response(
            {
                "detail": (
                    "Une nouvelle invitation a été envoyée à "
                    f"{agent.utilisateur.email}."
                )
            },
            status=HTTP_200_OK,
        )