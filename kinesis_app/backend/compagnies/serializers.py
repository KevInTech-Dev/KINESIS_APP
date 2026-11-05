import re
import secrets

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from utilisateurs.models import Utilisateur

from .agent_invitations import get_agent_from_invitation
from .models import AgentCompagnie, Compagnie, PermissionAgent


class OptionalImageField(serializers.ImageField):
    def to_internal_value(self, data):
        if data == "":
            return None
        return super().to_internal_value(data)


class CompanyRegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    raison_sociale = serializers.CharField(max_length=150)
    nom_commercial = serializers.CharField(max_length=150)
    telephone = serializers.CharField(max_length=30)
    telephone_secondaire = serializers.CharField(
        max_length=30,
        required=False,
        allow_blank=True,
    )
    nif = serializers.RegexField(
        regex=r"^[0-9]{1,10}$",
        max_length=10,
        validators=[
            UniqueValidator(
                queryset=Compagnie.objects.all(),
                lookup="iexact",
                message="Une compagnie utilise déjà ce NIF.",
            )
        ],
    )
    rccm = serializers.CharField(
        max_length=50,
        validators=[
            UniqueValidator(
                queryset=Compagnie.objects.all(),
                lookup="iexact",
                message="Une compagnie utilise déjà ce RCCM.",
            )
        ],
    )
    logo = OptionalImageField(
        required=False,
        allow_null=True,
        help_text="Facultatif. Peut être omis lors de l’inscription.",
    )
    carte_cfe = serializers.ImageField()
    piece_identite_gerant = serializers.ImageField()
    description = serializers.CharField(required=False, allow_blank=True)
    adresse = serializers.CharField(max_length=255, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirmation = serializers.CharField(write_only=True)

    def validate_email(self, value):
        if Utilisateur.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Cette adresse email est déjà utilisée.")
        return value

    def validate_rccm(self, value):
        if re.fullmatch(r"TG-[A-Za-z0-9-]+", value, re.IGNORECASE | re.ASCII) is None:
            raise serializers.ValidationError(
                "Le RCCM doit commencer par TG- et contenir uniquement des lettres, chiffres et tirets."
            )
        return value.upper()

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError(
                {"password_confirmation": "Les mots de passe ne correspondent pas."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop("password_confirmation")
        password = validated_data.pop("password")
        email = validated_data.pop("email")
        telephone = validated_data.pop("telephone")
        raison_sociale = validated_data["raison_sociale"]
        utilisateur = Utilisateur.objects.create_user(
            email=email,
            password=password,
            nom=raison_sociale,
            prenoms="",
            telephone=telephone,
            role=Utilisateur.Role.COMPAGNIE,
            is_active=False,
        )
        return Compagnie.objects.create(utilisateur=utilisateur, **validated_data)

    def to_representation(self, instance):
        return CompanyProfileSerializer(instance, context=self.context).data


class CompanyProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="utilisateur.email", read_only=True)
    telephone = serializers.CharField(source="utilisateur.telephone", read_only=True)

    class Meta:
        model = Compagnie
        fields = (
            "email",
            "raison_sociale",
            "nom_commercial",
            "telephone",
            "telephone_secondaire",
            "nif",
            "rccm",
            "logo",
            "description",
            "adresse",
            "statut",
        )
        read_only_fields = (
            "email",
            "raison_sociale",
            "nom_commercial",
            "telephone",
            "telephone_secondaire",
            "nif",
            "rccm",
            "statut",
        )


class AdminCompanyReviewSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="utilisateur_id", read_only=True)
    email = serializers.EmailField(source="utilisateur.email", read_only=True)
    telephone = serializers.CharField(source="utilisateur.telephone", read_only=True)
    is_active = serializers.BooleanField(
        source="utilisateur.is_active",
        read_only=True,
    )

    class Meta:
        model = Compagnie
        fields = (
            "id",
            "email",
            "telephone",
            "is_active",
            "raison_sociale",
            "nom_commercial",
            "telephone_secondaire",
            "nif",
            "rccm",
            "logo",
            "carte_cfe",
            "piece_identite_gerant",
            "description",
            "adresse",
            "statut",
        )
        read_only_fields = fields


class AgentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="utilisateur_id", read_only=True)
    email = serializers.EmailField(source="utilisateur.email", read_only=True)
    nom = serializers.CharField(source="utilisateur.nom", read_only=True)
    prenoms = serializers.CharField(source="utilisateur.prenoms", read_only=True)
    telephone = serializers.CharField(source="utilisateur.telephone", read_only=True)
    photo_profil = serializers.ImageField(
        source="utilisateur.photo_profil",
        read_only=True,
        allow_null=True,
    )
    is_active = serializers.BooleanField(source="utilisateur.is_active", read_only=True)
    invitation_en_attente = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = AgentCompagnie
        fields = (
            "id",
            "email",
            "nom",
            "prenoms",
            "telephone",
            "photo_profil",
            "is_active",
            "invitation_en_attente",
            "permissions",
        )

    def get_invitation_en_attente(self, obj) -> bool:
        user = obj.utilisateur
        return (
            not user.is_active
            and not user.has_usable_password()
            and user.agent_invitation_id is not None
        )

    def get_permissions(self, obj) -> list[str]:
        return list(obj.permissions.values_list("permission", flat=True))


class AgentCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    nom = serializers.CharField(max_length=100)
    prenoms = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True,
    )
    telephone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    permissions = serializers.ListField(
        child=serializers.ChoiceField(choices=PermissionAgent.Code.choices),
        allow_empty=True,
    )

    def validate_email(self, value):
        if Utilisateur.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Cette adresse email est déjà utilisée.")
        return value.lower()

    def validate_permissions(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Une permission ne peut être répétée.")
        return value

    def create(self, validated_data):
        compagnie = validated_data.pop("compagnie")
        permissions = validated_data.pop("permissions")
        password = secrets.token_urlsafe(48)
        utilisateur = Utilisateur.objects.create_user(
            password=password,
            role=Utilisateur.Role.AGENT_COMPAGNIE,
            must_change_password=False,
            is_active=False,
            **validated_data,
        )
        utilisateur.set_unusable_password()
        utilisateur.save(
            update_fields=("password", "is_active", "must_change_password")
        )
        agent = AgentCompagnie.objects.create(
            utilisateur=utilisateur,
            compagnie=compagnie,
        )
        PermissionAgent.objects.bulk_create(
            [PermissionAgent(agent=agent, permission=value) for value in permissions]
        )
        from .agent_invitations import send_agent_invitation

        send_agent_invitation(agent)
        return agent

    def to_representation(self, instance):
        return AgentSerializer(instance, context=self.context).data


class AgentInvitationLookupSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=2048)

    def validate(self, attrs):
        attrs["agent"] = get_agent_from_invitation(attrs["token"])
        return attrs


class AgentActivationSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=2048)
    new_password = serializers.CharField(write_only=True)
    password_confirmation = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError(
                {"password_confirmation": "Les mots de passe ne correspondent pas."}
            )
        agent = get_agent_from_invitation(attrs["token"])
        try:
            validate_password(attrs["new_password"], agent.utilisateur)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": error.messages})
        attrs["agent"] = agent
        return attrs


class AgentUpdateSerializer(serializers.Serializer):
    nom = serializers.CharField(
        source="utilisateur.nom",
        max_length=100,
        required=False,
    )
    prenoms = serializers.CharField(
        source="utilisateur.prenoms",
        max_length=150,
        required=False,
        allow_blank=True,
    )
    telephone = serializers.CharField(
        source="utilisateur.telephone",
        max_length=30,
        required=False,
        allow_blank=True,
    )
    is_active = serializers.BooleanField(source="utilisateur.is_active", required=False)
    permissions = serializers.ListField(
        child=serializers.ChoiceField(choices=PermissionAgent.Code.choices),
        required=False,
        allow_empty=True,
    )

    def validate_permissions(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Une permission ne peut être répétée.")
        return value

    def update(self, instance, validated_data):
        user_updates = validated_data.pop("utilisateur", {})
        permissions = validated_data.pop("permissions", None)
        if (
            user_updates.get("is_active") is True
            and instance.utilisateur.agent_invitation_id is not None
        ):
            raise serializers.ValidationError(
                {
                    "is_active": (
                        "L’agent doit d’abord activer son compte depuis "
                        "l’invitation envoyée par e-mail."
                    )
                }
            )

        for field, value in user_updates.items():
            setattr(instance.utilisateur, field, value)
        if user_updates:
            instance.utilisateur.save(update_fields=tuple(user_updates))

        if permissions is not None:
            current = set(instance.permissions.values_list("permission", flat=True))
            requested = set(permissions)
            instance.permissions.filter(permission__in=current - requested).delete()
            PermissionAgent.objects.bulk_create(
                [
                    PermissionAgent(agent=instance, permission=value)
                    for value in requested - current
                ]
            )
        return instance

    def to_representation(self, instance):
        return AgentSerializer(instance, context=self.context).data
