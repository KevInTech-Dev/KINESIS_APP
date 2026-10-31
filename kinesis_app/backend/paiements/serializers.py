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