import re
import secrets

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from config.fields import LimitedImageField
from utilisateurs.models import Utilisateur
from utilisateurs.validators import normalize_togo_phone, validate_person_name
from voyages.models import Ville, Voyage

from .agent_invitations import get_agent_from_invitation
from .models import AgentCompagnie, Compagnie, Gare, PermissionAgent


class OptionalImageField(LimitedImageField):
    def to_internal_value(self, data):
        if data == "":
            return None
        return super().to_internal_value(data)


def validate_phone_number(value):
    if not value:
        return value
    try:
        return normalize_togo_phone(value)
    except DjangoValidationError as error:
        raise serializers.ValidationError(error.messages)


def validate_personal_name(value):
    try:
        return validate_person_name(value)
    except DjangoValidationError as error:
        raise serializers.ValidationError(error.messages)


def normalize_rccm(value):
    value = value.strip()
    if not value.upper().startswith("TG-"):
        value = f"TG-{value}"
    if re.fullmatch(r"TG-[A-Za-z0-9-]+", value, re.IGNORECASE | re.ASCII) is None:
        raise serializers.ValidationError(
            "Le RCCM doit contenir uniquement des lettres, chiffres et tirets après le préfixe TG-."
        )
    return value.upper()


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
    )
    logo = OptionalImageField(
        required=False,
        allow_null=True,
        help_text="Facultatif. Peut être omis lors de l’inscription.",
    )
    carte_cfe = LimitedImageField()
    piece_identite_gerant = LimitedImageField()
    description = serializers.CharField(required=False, allow_blank=True)
    adresse = serializers.CharField(max_length=255, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirmation = serializers.CharField(write_only=True)

    def validate_email(self, value):
        if Utilisateur.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Cette adresse email est déjà utilisée.")
        return value

    def validate_telephone(self, value):
        return validate_phone_number(value)

    def validate_telephone_secondaire(self, value):
        return validate_phone_number(value)

    def validate_rccm(self, value):
        normalized = normalize_rccm(value)
        if len(normalized) > 50:
            raise serializers.ValidationError(
                "Le RCCM ne peut pas dépasser 50 caractères, préfixe TG- compris."
            )
        if Compagnie.objects.filter(rccm__iexact=normalized).exists():
            raise serializers.ValidationError(
                "Une compagnie utilise déjà ce RCCM."
            )
        return normalized

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
            email_verified=False,
        )
        company = Compagnie.objects.create(
            utilisateur=utilisateur,
            statut=Compagnie.Statut.EN_ATTENTE_VERIFICATION_EMAIL,
            **validated_data,
        )
        return company

    def to_representation(self, instance):
        return CompanyProfileSerializer(instance, context=self.context).data


class CompanyProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="utilisateur.email", read_only=True)
    telephone = serializers.CharField(source="utilisateur.telephone", read_only=True)
    logo = OptionalImageField(required=False, allow_null=True)

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


class GareSerializer(serializers.ModelSerializer):
    ville = serializers.PrimaryKeyRelatedField(
        queryset=Ville.objects.all(),
    )
    ville_nom = serializers.CharField(source="ville.nom", read_only=True)
    compagnie = serializers.UUIDField(source="compagnie_id", read_only=True)
    en_utilisation = serializers.SerializerMethodField()

    class Meta:
        model = Gare
        fields = (
            "id_gare",
            "compagnie",
            "ville",
            "ville_nom",
            "nom",
            "date_creation",
            "adresse",
            "latitude",
            "longitude",
            "google_place_id",
            "maps_url",
            "active",
            "en_utilisation",
        )
        read_only_fields = ("id_gare", "compagnie", "date_creation")

    def validate(self, attrs):
        if self.instance and any(key != "active" for key in attrs) and Voyage.objects.filter(
            Q(gare_depart=self.instance) | Q(gare_arrivee=self.instance)
        ).exists():
            raise serializers.ValidationError(
                {"gare": "Cette gare est déjà utilisée par un trajet et ne peut pas être modifiée."}
            )
        latitude = attrs.get("latitude")
        longitude = attrs.get("longitude")
        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError(
                {"latitude": "La latitude et la longitude doivent être renseignées ensemble."}
            )
        if latitude is not None and not -90 <= latitude <= 90:
            raise serializers.ValidationError(
                {"latitude": "La latitude doit être comprise entre -90 et 90."}
            )
        if longitude is not None and not -180 <= longitude <= 180:
            raise serializers.ValidationError(
                {"longitude": "La longitude doit être comprise entre -180 et 180."}
            )
        return attrs

    def get_en_utilisation(self, obj) -> bool:
        annotated_value = getattr(obj, "_en_utilisation", None)
        if annotated_value is not None:
            return annotated_value
        return Voyage.objects.filter(
            Q(gare_depart=obj) | Q(gare_arrivee=obj)
        ).exists()


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
    date_creation = serializers.DateTimeField(
        source="utilisateur.date_creation",
        read_only=True,
    )
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
            "date_creation",
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

    def validate_nom(self, value):
        return validate_personal_name(value)

    def validate_prenoms(self, value):
        return validate_personal_name(value) if value else value

    def validate_telephone(self, value):
        return validate_phone_number(value)

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

    def validate_nom(self, value):
        return validate_personal_name(value)

    def validate_prenoms(self, value):
        return validate_personal_name(value) if value else value

    def validate_telephone(self, value):
        return validate_phone_number(value)

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
