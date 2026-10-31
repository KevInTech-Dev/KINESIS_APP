from rest_framework import serializers

from voyages.serializers import VoyageSerializer

from .models import BilletElectronique


class BilletElectroniqueSerializer(serializers.ModelSerializer):
    voyage = VoyageSerializer(source="place.voyage", read_only=True)
    reservation_reference = serializers.CharField(
        source="place.reservation.reference",
        read_only=True,
    )
    nom_passager = serializers.CharField(source="place.nom_passager", read_only=True)
    numero_siege = serializers.CharField(source="place.numero_siege", read_only=True)

    class Meta:
        model = BilletElectronique
        fields = (
            "id_billet",
            "reservation_reference",
            "nom_passager",
            "numero_siege",
            "voyage",
            "code_billet",
            "code_qr",
            "statut",
            "date_creation",
            "date_embarquement",
        )


class BilletScanRequestSerializer(serializers.Serializer):
    code_qr = serializers.CharField(max_length=255)


class BilletScanVoyageSerializer(serializers.Serializer):
    compagnie = serializers.CharField(source="compagnie.utilisateur.nom")
    ville_depart = serializers.CharField(source="ville_depart.nom")
    ville_arrivee = serializers.CharField(source="ville_arrivee.nom")
    date_depart = serializers.DateField()
    heure_depart = serializers.TimeField()


class BilletScanSerializer(serializers.ModelSerializer):
    voyage = BilletScanVoyageSerializer(
        source="place.reservation.voyage",
        read_only=True,
    )
    reservation_reference = serializers.CharField(
        source="place.reservation.reference",
        read_only=True,
    )
    nom_passager = serializers.CharField(source="place.nom_passager", read_only=True)
    numero_siege = serializers.CharField(source="place.numero_siege", read_only=True)

    class Meta:
        model = BilletElectronique
        fields = (
            "id_billet",
            "reservation_reference",
            "nom_passager",
            "numero_siege",
            "voyage",
            "code_billet",
            "date_embarquement",
        )