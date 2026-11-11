from datetime import timedelta
from urllib.parse import urlsplit

from django.conf import settings
from django.contrib.auth.forms import PasswordResetForm
from django.db.models import Count, Q
from django.db.models.functions import Lower, TruncDate
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from config.pagination import StandardResultsSetPagination
from compagnies.models import Compagnie
from compagnies.services import submit_verified_company_for_review

from .email_verification import send_verification_code, verify_email_code
from .models import Utilisateur
from .permissions import IsKinesisAdministrator, PasswordChangeComplete
from .serializers import (
	AdminUserListSerializer,
	EmailVerificationConfirmSerializer,
	EmailVerificationRequestSerializer,
	LogoutRequestSerializer,
	PasswordChangeRequestSerializer,
	PasswordResetConfirmSerializer,
	PasswordResetRequestSerializer,
	UserProfileSerializer,
	UserRegistrationSerializer,
)


class UserRegistrationView(generics.CreateAPIView):
	queryset = Utilisateur.objects.all()
	serializer_class = UserRegistrationSerializer
	permission_classes = [AllowAny]
	throttle_classes = [ScopedRateThrottle]
	throttle_scope = "traveler_registration"

	def create(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		email = serializer.validated_data["email"]
		password = serializer.validated_data["password"]
		user = Utilisateur.objects.filter(email__iexact=email).first()
		if user:
			if not user.check_password(password):
				raise ValidationError(
					{"email": "Cette adresse email est déjà utilisée."}
				)
		else:
			user = serializer.save(is_active=False, email_verified=False)
		code_sent = send_verification_code(user, reuse_valid=True)
		return Response(
			{
				"detail": (
					"Un code de vérification a été envoyé à votre adresse e-mail."
					if code_sent
					else (
						"Votre compte est déjà en attente. Utilisez le code encore "
						"valide reçu précédemment, ou demandez un nouveau code."
					)
				)
			},
			status=status.HTTP_202_ACCEPTED,
		)


class EmailVerificationResendView(APIView):
	permission_classes = (AllowAny,)
	authentication_classes = ()
	throttle_classes = (ScopedRateThrottle,)
	throttle_scope = "email_verification_resend"

	@extend_schema(request=EmailVerificationRequestSerializer, responses={200: None})
	def post(self, request):
		serializer = EmailVerificationRequestSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = Utilisateur.objects.filter(
			Q(
				email__iexact=serializer.validated_data["email"],
				role=Utilisateur.Role.VOYAGEUR,
				email_verified=False,
				is_active=False,
			)
			| Q(
				email__iexact=serializer.validated_data["email"],
				role=Utilisateur.Role.COMPAGNIE,
				email_verified=False,
				is_active=False,
				profil_compagnie__statut=Compagnie.Statut.EN_ATTENTE_VERIFICATION_EMAIL,
			)
		).first()
		if user:
			send_verification_code(user)
		return Response(
			{
				"detail": (
					"Si un compte en attente correspond à cette adresse, "
					"un code lui a été envoyé."
				)
			}
		)


class EmailVerificationConfirmView(APIView):
	permission_classes = (AllowAny,)
	authentication_classes = ()
	throttle_classes = (ScopedRateThrottle,)
	throttle_scope = "email_verification_confirm"

	@extend_schema(
		request=EmailVerificationConfirmSerializer,
		responses={200: serializers.DictField()},
	)
	def post(self, request):
		serializer = EmailVerificationConfirmSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		email = serializer.validated_data["email"]
		if Utilisateur.objects.filter(
			email__iexact=email,
			role=Utilisateur.Role.COMPAGNIE,
			email_verified=True,
			profil_compagnie__statut=Compagnie.Statut.EN_ATTENTE_VALIDATION,
		).exists():
			return Response(
				{
					"detail": (
						"Adresse e-mail vérifiée. Votre demande a été transmise "
						"à l’équipe KINESIS pour examen."
					)
				}
			)
		user = verify_email_code(
			email,
			serializer.validated_data["code"],
			on_company_verified=submit_verified_company_for_review,
		)
		if user.role == Utilisateur.Role.COMPAGNIE:
			return Response(
				{
					"detail": (
						"Adresse e-mail vérifiée. Votre demande a été transmise "
						"à l’équipe KINESIS pour examen."
					)
				}
			)
		refresh = RefreshToken.for_user(user)
		return Response({"access": str(refresh.access_token), "refresh": str(refresh)})


class AdminUserListView(generics.ListAPIView):
	serializer_class = AdminUserListSerializer
	permission_classes = [IsKinesisAdministrator]
	pagination_class = StandardResultsSetPagination

	@extend_schema(
		parameters=[
			OpenApiParameter(
				name="role",
				type=str,
				enum=Utilisateur.Role.values,
				required=False,
				description=(
					"Filtrer par rôle : VOYAGEUR, COMPAGNIE, AGENT_COMPAGNIE "
					"ou ADMINISTRATEUR."
				),
			),
			OpenApiParameter(
				name="search",
				type=str,
				required=False,
				description=(
					"Rechercher par identité, contact ou nom de compagnie liée."
				),
			),
		]
	)
	def get(self, request, *args, **kwargs):
		return super().get(request, *args, **kwargs)

	def get_queryset(self):
		queryset = Utilisateur.objects.select_related(
			"profil_compagnie",
			"profil_agent__compagnie",
		).order_by("-date_creation", Lower("nom"), Lower("prenoms"), Lower("email"), "id")
		role = self.request.query_params.get("role")
		if role:
			if role not in Utilisateur.Role.values:
				raise ValidationError(
					{"role": "Rôle invalide. Consultez les rôles documentés de l’API."}
				)
			queryset = queryset.filter(role=role)
		search = self.request.query_params.get("search", "").strip()
		if len(search) > 100:
			raise ValidationError(
				{"search": "La recherche ne peut pas dépasser 100 caractères."}
			)
		if search:
			queryset = queryset.filter(
				Q(email__icontains=search)
				| Q(nom__icontains=search)
				| Q(prenoms__icontains=search)
				| Q(telephone__icontains=search)
				| Q(profil_compagnie__nom_commercial__icontains=search)
				| Q(profil_compagnie__raison_sociale__icontains=search)
				| Q(profil_agent__compagnie__nom_commercial__icontains=search)
			)
		return queryset


class AdminUserSummaryView(APIView):
	permission_classes = [IsKinesisAdministrator]

	def get(self, request):
		days_value = request.query_params.get("days", "30")
		if days_value not in ("7", "30", "90"):
			raise ValidationError({"days": "La période doit être 7, 30 ou 90 jours."})
		days = int(days_value)
		now = timezone.localtime()
		start_date = now.date() - timedelta(days=days - 1)
		role_counts = {role: 0 for role, _ in Utilisateur.Role.choices}
		for row in Utilisateur.objects.values("role").annotate(total=Count("pk")):
			role_counts[row["role"]] = row["total"]
		registrations = (
			Utilisateur.objects.filter(
				date_creation__date__gte=start_date,
				date_creation__date__lte=now.date(),
			)
			.annotate(date=TruncDate("date_creation"))
			.values("date")
			.annotate(count=Count("pk"))
			.order_by("date")
		)
		return Response(
			{
				"total": sum(role_counts.values()),
				"roles": role_counts,
				"registrations": [
					{"date": row["date"].isoformat(), "count": row["count"]}
					for row in registrations
				],
			}
		)


class CurrentUserView(generics.RetrieveUpdateAPIView):
	serializer_class = UserProfileSerializer
	permission_classes = [PasswordChangeComplete]
	parser_classes = (JSONParser, FormParser, MultiPartParser)

	def get_object(self):
		return self.request.user


class LogoutView(APIView):
	permission_classes = [IsAuthenticated]

	@extend_schema(request=LogoutRequestSerializer, responses={205: None})
	def post(self, request):
		serializer = LogoutRequestSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		refresh_token = serializer.validated_data["refresh"]

		try:
			token = RefreshToken(refresh_token)
			if token.get("user_id") != str(request.user.pk):
				return Response(
					{"detail": "Ce jeton n'appartient pas à cet utilisateur."},
					status=status.HTTP_403_FORBIDDEN,
				)
			token.blacklist()
		except TokenError:
			raise ValidationError({"refresh": "Jeton invalide ou déjà révoqué."})

		return Response(status=status.HTTP_205_RESET_CONTENT)


class ChangePasswordView(APIView):
	permission_classes = [IsAuthenticated]

	@extend_schema(request=PasswordChangeRequestSerializer, responses={204: None})
	def post(self, request):
		user = request.user
		serializer = PasswordChangeRequestSerializer(
			data=request.data,
			context={"request": request},
		)
		serializer.is_valid(raise_exception=True)
		new_password = serializer.validated_data["new_password"]
		user.set_password(new_password)
		user.must_change_password = False
		user.save(update_fields=("password", "must_change_password"))
		return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(APIView):
	permission_classes = (AllowAny,)
	authentication_classes = ()
	throttle_classes = (ScopedRateThrottle,)
	throttle_scope = "password_reset_request"

	@extend_schema(request=PasswordResetRequestSerializer, responses={200: None})
	def post(self, request):
		serializer = PasswordResetRequestSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		form = PasswordResetForm({"email": serializer.validated_data["email"]})
		if form.is_valid():
			frontend = urlsplit(settings.FRONTEND_BASE_URL)
			form.save(
				domain_override=frontend.netloc,
				use_https=frontend.scheme == "https",
				from_email=settings.DEFAULT_FROM_EMAIL,
				email_template_name="utilisateurs/emails/password_reset_email.txt",
				html_email_template_name=(
					"utilisateurs/emails/password_reset_email.html"
				),
				subject_template_name=(
					"utilisateurs/emails/password_reset_subject.txt"
				),
			)

		return Response(
			{
				"detail": (
					"Si un compte actif correspond à cette adresse, "
					"un lien de réinitialisation lui sera envoyé."
				)
			},
			status=status.HTTP_200_OK,
		)


class PasswordResetConfirmView(APIView):
	permission_classes = (AllowAny,)
	authentication_classes = ()
	throttle_classes = (ScopedRateThrottle,)
	throttle_scope = "password_reset_confirm"

	@extend_schema(
		request=PasswordResetConfirmSerializer,
		responses={204: None},
	)
	def post(self, request):
		serializer = PasswordResetConfirmSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = serializer.validated_data["user"]
		user.set_password(serializer.validated_data["new_password"])
		user.save(update_fields=("password",))
		return Response(status=status.HTTP_204_NO_CONTENT)
