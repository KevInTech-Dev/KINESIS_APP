from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from config.pagination import StandardResultsSetPagination

from .models import Utilisateur
from .permissions import IsKinesisAdministrator, PasswordChangeComplete
from .serializers import (
	AdminUserListSerializer,
	LogoutRequestSerializer,
	PasswordChangeRequestSerializer,
	UserProfileSerializer,
	UserRegistrationSerializer,
)


class UserRegistrationView(generics.CreateAPIView):
	queryset = Utilisateur.objects.all()
	serializer_class = UserRegistrationSerializer
	permission_classes = [AllowAny]


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
		).order_by("email", "id")
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
		refresh_token = request.data.get("refresh")
		if not refresh_token:
			raise ValidationError({"refresh": "Ce champ est obligatoire."})

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
		old_password = request.data.get("old_password")
		new_password = request.data.get("new_password")
		confirmation = request.data.get("password_confirmation")

		if not old_password or not new_password or not confirmation:
			raise ValidationError({"detail": "Tous les champs sont obligatoires."})
		if not user.check_password(old_password):
			raise ValidationError({"old_password": "Mot de passe actuel incorrect."})
		if new_password != confirmation:
			raise ValidationError(
				{"password_confirmation": "Les mots de passe ne correspondent pas."}
			)

		try:
			validate_password(new_password, user)
		except DjangoValidationError as error:
			raise ValidationError({"new_password": error.messages})
		user.set_password(new_password)
		user.must_change_password = False
		user.save(update_fields=("password", "must_change_password"))
		return Response(status=status.HTTP_204_NO_CONTENT)
