from rest_framework import serializers

from .models import Bagage, PhotoBagage, TarifBagage
from .services import create_tariff, register_baggage, update_tariff


class TarifBagageSerializer(serializers.ModelSerializer):
    class Meta:
        model = TarifBagage
        fields = ("id_tarif", "poids_min", "poids_max", "prix", "date_creation")
        read_only_fields = ("id_tarif", "date_creation")

    def create(self, validated_data):
        return create_tariff(
            actor=self.context["request"].user,
            **validated_data,
        )

    def update(self, instance, validated_data):
        return update_tariff(
            actor=self.context["request"].user,
            tariff_id=instance.pk,
            changes=validated_data,
        )


class PhotoBagageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = PhotoBagage
        fields = ("id_photobagage", "url", "created_at")

    def get_url(self, obj) -> str:
        return obj.image.url


class BagageSerializer(serializers.ModelSerializer):
    reservation_reference = serializers.CharField(
        source="reservation.reference",
        read_only=True,
    )
    photos = PhotoBagageSerializer(many=True, read_only=True)
    enregistre_par_email = serializers.EmailField(
        source="enregistre_par.email",
        read_only=True,
    )
    restitue_par_email = serializers.EmailField(
        source="restitue_par.email",
        read_only=True,
    )
    enregistre_par_nom = serializers.SerializerMethodField()
    paiement_enregistre_par_nom = serializers.SerializerMethodField()
    restitue_par_nom = serializers.SerializerMethodField()

    @staticmethod
    def _actor_name(actor) -> str | None:
        if actor is None:
            return None
        name = " ".join(part for part in (actor.prenoms, actor.nom) if part).strip()
        return name or actor.email

    def get_enregistre_par_nom(self, obj) -> str | None:
        return self._actor_name(obj.enregistre_par)

    def get_paiement_enregistre_par_nom(self, obj) -> str | None:
        return self._actor_name(obj.paiement_enregistre_par)

    def get_restitue_par_nom(self, obj) -> str | None:
        return self._actor_name(obj.restitue_par)

    class Meta:
        model = Bagage
        fields = (
            "id_bagage",
            "reservation",
            "reservation_reference",
            "description",
            "poids",
            "poids_min_applique",
            "poids_max_applique",
            "prix_tarif_applique",
            "tarif_special",
            "motif_tarif_special",
            "frais_total",
            "frais_payes",
            "date_paiement_frais",
            "statut",
            "date_restitution",
            "enregistre_par_nom",
            "paiement_enregistre_par_nom",
            "restitue_par_nom",
            "enregistre_par_email",
            "restitue_par_email",
            "date_creation",
            "photos",
        )


class BagageCreateSerializer(serializers.Serializer):
    MAX_PHOTO_SIZE = 5 * 1024 * 1024

    reservation_id = serializers.UUIDField()
    poids = serializers.DecimalField(max_digits=7, decimal_places=0, min_value=0)
    description = serializers.CharField(required=False, allow_blank=True)
    frais_special = serializers.DecimalField(
        max_digits=10,
        decimal_places=0,
        min_value=0,
        required=False,
    )
    motif_tarif_special = serializers.CharField(required=False, allow_blank=True)
    photos = serializers.ListField(
        child=serializers.ImageField(),
        min_length=1,
        max_length=5,
        write_only=True,
    )

    def validate_photos(self, value):
        if any(image.size > self.MAX_PHOTO_SIZE for image in value):
            raise serializers.ValidationError("Chaque photo doit faire 5 Mo maximum.")
        return value

    def create(self, validated_data):
        photo_files = validated_data.pop("photos")
        return register_baggage(
            actor=self.context["request"].user,
            photo_files=photo_files,
            **validated_data,
        )