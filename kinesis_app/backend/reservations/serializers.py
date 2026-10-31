from rest_framework import serializers

from voyages.serializers import VoyageSerializer

from .models import PlaceReservee, Reservation
from .services import create_reservation


class PlaceReserveeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlaceReservee
        fields = ("id_place", "numero_siege", "nom_passager")


class ReservationSerializer(serializers.ModelSerializer):
    voyage = VoyageSerializer(read_only=True)
    places = PlaceReserveeSerializer(many=True, read_only=True)

    class Meta:
        model = Reservation
        fields = (
            "id_reservation",
            "reference",
            "voyage",
            "date_reservation",
            "date_expiration",
            "montant_total",
            "statut",
            "places",
        )


class ReservationCreateSerializer(serializers.Serializer):
    voyage_id = serializers.UUIDField()
    passagers = serializers.ListField(
        child=serializers.CharField(max_length=150, trim_whitespace=True),
        min_length=1,
    )

    def validate_passagers(self, value):
        if any(not name for name in value):
            raise serializers.ValidationError("Le nom de chaque passager est obligatoire.")
        return value

    def create(self, validated_data):
        return create_reservation(
            voyageur=self.context["request"].user,
            voyage_id=validated_data["voyage_id"],
            passenger_names=validated_data["passagers"],
        )