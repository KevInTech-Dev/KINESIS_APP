from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from compagnies.models import AgentCompagnie, Compagnie
from config.fields import LimitedImageField

from .models import Utilisateur
from .validators import normalize_togo_phone, validate_person_name


class AdminCompanySummarySerializer(serializers.ModelSerializer):
    telephone_principal = serializers.CharField(
        source="utilisateur.telephone",
        read_only=True,
    )

    class Meta:
        model = Compagnie
        fields = (
            "raison_sociale",
            "nom_commercial",
            "nif",
            "rccm",
            "telephone_principal",
            "telephone_secondaire",
            "statut",
        )


class AdminAgentSummarySerializer(serializers.ModelSerializer):
    compagnie_id = serializers.UUIDField(read_only=True)
    compagnie_nom = serializers.CharField(
        source="compagnie.nom_commercial",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = AgentCompagnie
        fields = ("compagnie_id", "compagnie_nom")


class AdminUserListSerializer(serializers.ModelSerializer):
    compagnie = AdminCompanySummarySerializer(
        source="profil_compagnie",
        read_only=True,
        allow_null=True,
    )
    agent = AdminAgentSummarySerializer(
        source="profil_agent",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Utilisateur
        fields = (
            "id",
            "email",
            "nom",
            "prenoms",
            "telephone",
            "photo_profil",
            "role",
            "is_active",
            "must_change_password",
            "compagnie",
            "agent",
        )


class UserRegistrationSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(validators=[])
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirmation = serializers.CharField(write_only=True)
    prenoms = serializers.CharField(max_length=150, required=False, allow_blank=True)

    class Meta:
        model = Utilisateur
        fields = (
            "id",
            "email",
            "nom",
            "prenoms",
            "telephone",
            "password",
            "password_confirmation",
            "role",
        )
        read_only_fields = ("id", "role")

    def validate_email(self, value):
        existing = Utilisateur.objects.filter(email__iexact=value).first()
        if existing and not (
            existing.role == Utilisateur.Role.VOYAGEUR
            and not existing.email_verified
            and not existing.is_active
        ):
            raise serializers.ValidationError("Cette adresse email est déjà utilisée.")
        return value.lower()

    def validate_nom(self, value):
        try:
            return validate_person_name(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)

    def validate_prenoms(self, value):
        if not value:
            return value
        try:
            return validate_person_name(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)

    def validate_telephone(self, value):
        if not value:
            return value
        try:
            return normalize_togo_phone(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError(
                {"password_confirmation": "Les mots de passe ne correspondent pas."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirmation")
        password = validated_data.pop("password")
        return Utilisateur.objects.create_user(password=password, **validated_data)


class UserProfilePhotoField(LimitedImageField):
    def to_representation(self, value):
        user = self.parent.instance
        if user and user.role == Utilisateur.Role.COMPAGNIE:
            try:
                value = user.profil_compagnie.logo
            except Compagnie.DoesNotExist:
                value = None
        return super().to_representation(value)


class UserProfileSerializer(serializers.ModelSerializer):
    photo_profil = UserProfilePhotoField(allow_null=True)
    agent_permissions = serializers.SerializerMethodField()
    compagnie_nom = serializers.SerializerMethodField()

    class Meta:
        model = Utilisateur
        fields = (
            "id",
            "email",
            "nom",
            "prenoms",
            "telephone",
            "photo_profil",
            "role",
            "must_change_password",
            "agent_permissions",
            "compagnie_nom",
        )
        read_only_fields = ("id", "email", "role", "must_change_password")

    def get_agent_permissions(self, obj):
        if obj.role != Utilisateur.Role.AGENT_COMPAGNIE:
            return []
        try:
            return list(obj.profil_agent.permissions.values_list("permission", flat=True))
        except AgentCompagnie.DoesNotExist:
            return []

    def get_compagnie_nom(self, obj):
        if obj.role != Utilisateur.Role.AGENT_COMPAGNIE:
            return None
        try:
            return obj.profil_agent.compagnie.nom_commercial
        except AgentCompagnie.DoesNotExist:
            return None

    def validate_nom(self, value):
        try:
            return validate_person_name(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)

    def validate_prenoms(self, value):
        if not value:
            return value
        try:
            return validate_person_name(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)

    def validate_telephone(self, value):
        if not value:
            return value
        try:
            return normalize_togo_phone(value)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages)


class EmailVerificationRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class EmailVerificationConfirmSerializer(EmailVerificationRequestSerializer):
    code = serializers.RegexField(r"^[0-9]{6}$")


class UserTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if (
            self.user.role == Utilisateur.Role.VOYAGEUR
            and not self.user.email_verified
        ):
            raise serializers.ValidationError(
                {"detail": "Vérifiez votre adresse e-mail avant de vous connecter."}
            )
        return data


class LogoutRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class PasswordChangeRequestSerializer(serializers.Serializer):
    old_password = serializers.CharField(
        help_text="Pour un agent, utiliser le mot de passe temporaire remis par sa compagnie."
    )
    new_password = serializers.CharField()
    password_confirmation = serializers.CharField()

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError(
                {"old_password": "Mot de passe actuel incorrect."}
            )
        if attrs["new_password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError(
                {"password_confirmation": "Les mots de passe ne correspondent pas."}
            )
        try:
            validate_password(attrs["new_password"], user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": error.messages})
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=128)
    token = serializers.CharField(max_length=256)
    new_password = serializers.CharField()
    password_confirmation = serializers.CharField()

    def validate(self, attrs):
        if attrs["new_password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError(
                {"password_confirmation": "Les mots de passe ne correspondent pas."}
            )

        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = get_user_model()._default_manager.get(pk=user_id, is_active=True)
        except (ValueError, TypeError, OverflowError, get_user_model().DoesNotExist):
            raise serializers.ValidationError(
                {"token": "Ce lien de réinitialisation est invalide ou expiré."}
            )

        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError(
                {"token": "Ce lien de réinitialisation est invalide ou expiré."}
            )

        try:
            validate_password(attrs["new_password"], user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": error.messages})

        attrs["user"] = user
        return attrs