from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .permissions import PasswordChangeComplete
from .models import Utilisateur
from .serializers import UserProfileSerializer, UserRegistrationSerializer


class UserRegistrationView(generics.CreateAPIView):
	queryset = Utilisateur.objects.all()
	serializer_class = UserRegistrationSerializer
	permission_classes = [AllowAny]


class CurrentUserView(generics.RetrieveUpdateAPIView):
	serializer_class = UserProfileSerializer
	permission_classes = [PasswordChangeComplete]

	def get_object(self):
		return self.request.user


class LogoutView(APIView):
	permission_classes = [IsAuthenticated]

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
