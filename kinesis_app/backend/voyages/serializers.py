from datetime import datetime

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from .models import Ville, Voyage


class VilleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ville
        fields = ("id_ville", "nom")
        read_only_fields = ("id_ville",)

    def validate_nom(self, value):
        return " ".join(value.split())


class VoyageSerializer(serializers.ModelSerializer):
    heure_depart = serializers.TimeField(format="%H:%M")
    compagnie = serializers.UUIDField(source="compagnie_id", read_only=True)
    compagnie_nom = serializers.CharField(
        source="compagnie.utilisateur.nom",
        read_only=True,
    )
    ville_depart_nom = serializers.CharField(source="ville_depart.nom", read_only=True)
    ville_arrivee_nom = serializers.CharField(
        source="ville_arrivee.nom",
        read_only=True,
    )
    places_disponibles = serializers.SerializerMethodField()

    class Meta:
        model = Voyage
        fields = (
            "id_voyage",
            "compagnie",
            "compagnie_nom",
            "ville_depart",
            "ville_depart_nom",
            "ville_arrivee",
            "ville_arrivee_nom",
            "date_depart",
            "heure_depart",
            "date_depart_effective",
            "place_totale",
            "places_disponibles",
            "prix",
            "image",
            "statut",
        )
        read_only_fields = (
            "id_voyage",
            "compagnie",
            "compagnie_nom",
            "date_depart_effective",
        )

    def get_places_disponibles(self, obj) -> int:
        occupied = getattr(obj, "_places_occupees", None)
        if occupied is None:
            from reservations.models import PlaceReservee

            now = timezone.now()
            active_holds = Q(
                reservation__statut="PAYEE",
            ) | Q(
                reservation__statut="EN_ATTENTE_PAIEMENT",
                reservation__date_expiration__gt=now,
            )
            occupied = (
                PlaceReservee.objects.filter(
                    voyage=obj,
                    liberee=False,
                )
                .filter(active_holds)
                .count()
            )
        return max(obj.place_totale - occupied, 0)

    def validate_heure_depart(self, value):
        return value.replace(second=0, microsecond=0)

    def validate_place_totale(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "La capacité doit être supérieure à zéro."
            )
        if self.instance:
            from reservations.models import PlaceReservee

            now = timezone.now()
            active_holds = Q(
                reservation__statut="PAYEE",
            ) | Q(
                reservation__statut="EN_ATTENTE_PAIEMENT",
                reservation__date_expiration__gt=now,
            )
            reserved = (
                PlaceReservee.objects.filter(
                    voyage=self.instance,
                    liberee=False,
                )
                .filter(active_holds)
                .count()
            )
            if value < reserved:
                raise serializers.ValidationError(
                    "La capacité ne peut pas être inférieure aux places réservées."
                )
        return value

    def validate(self, attrs):
        depart = attrs.get("ville_depart", getattr(self.instance, "ville_depart", None))
        arrivee = attrs.get(
            "ville_arrivee",
            getattr(self.instance, "ville_arrivee", None),
        )
        if depart and arrivee and depart.pk == arrivee.pk:
            raise serializers.ValidationError(
                {"ville_arrivee": "La ville d’arrivée doit différer du départ."}
            )

        date_depart = attrs.get(
            "date_depart", getattr(self.instance, "date_depart", None)
        )
        heure_depart = attrs.get(
            "heure_depart",
            getattr(self.instance, "heure_depart", None),
        )
        statut = attrs.get(
            "statut", getattr(self.instance, "statut", Voyage.Statut.PUBLIE)
        )
        if date_depart and heure_depart and statut == Voyage.Statut.PUBLIE:
            depart_datetime = timezone.make_aware(
                datetime.combine(date_depart, heure_depart),
                timezone.get_current_timezone(),
            )
            if depart_datetime <= timezone.now():
                raise serializers.ValidationError(
                    {"date_depart": "Un voyage publié doit partir dans le futur."}
                )
        return attrs


class VoyageSearchSerializer(serializers.Serializer):
    ville_depart = serializers.UUIDField(required=False)
    ville_arrivee = serializers.UUIDField(required=False)
    date_depart = serializers.DateField(required=False)
    date_depart_apres = serializers.DateField(required=False)
    date_depart_avant = serializers.DateField(required=False)
    compagnie = serializers.UUIDField(required=False)
    prix_min = serializers.DecimalField(
        max_digits=12,
        decimal_places=0,
        min_value=0,
        required=False,
    )
    prix_max = serializers.DecimalField(
        max_digits=12,
        decimal_places=0,
        min_value=0,
        required=False,
    )
    places_min = serializers.IntegerField(min_value=1, max_value=100, required=False)
    ordering = serializers.ChoiceField(
        choices=("date_depart", "prix", "-prix"),
        required=False,
    )

    def validate(self, attrs):
        if (
            attrs.get("date_depart_apres")
            and attrs.get("date_depart_avant")
            and attrs["date_depart_apres"] > attrs["date_depart_avant"]
        ):
            raise serializers.ValidationError(
                {"date_depart_avant": "La date de fin doit suivre la date de début."}
            )
        if (
            attrs.get("prix_min") is not None
            and attrs.get("prix_max") is not None
            and attrs["prix_min"] > attrs["prix_max"]
        ):
            raise serializers.ValidationError(
                {"prix_max": "Le prix maximum doit être supérieur au prix minimum."}
            )
        return attrs
