from rest_framework import serializers

from voyages.serializers import VoyageSerializer

from .models import BilletElectronique, Paiement


class PaiementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Paiement
        fields = (
            "id_paiement",
            "reference_interne",
            "montant",
            "statut",
            "date_creation",
            "date_confirmation",
        )


class PaiementListSerializer(PaiementSerializer):
    reservation_reference = serializers.CharField(
        source="reservation.reference",
        read_only=True,
    )
    id_voyage = serializers.UUIDField(
        source="reservation.voyage_id",
        read_only=True,
    )
    ville_depart_nom = serializers.CharField(
        source="reservation.voyage.ville_depart.nom",
        read_only=True,
    )
    ville_arrivee_nom = serializers.CharField(
        source="reservation.voyage.ville_arrivee.nom",
        read_only=True,
    )
    date_depart = serializers.DateField(
        source="reservation.voyage.date_depart",
        read_only=True,
    )

    class Meta(PaiementSerializer.Meta):
        fields = (
            *PaiementSerializer.Meta.fields,
            "reservation_reference",
            "id_voyage",
            "ville_depart_nom",
            "ville_arrivee_nom",
            "date_depart",
        )


class PaiementCheckoutSerializer(serializers.Serializer):
    id_paiement = serializers.UUIDField()
    reference_interne = serializers.CharField()
    montant = serializers.DecimalField(max_digits=12, decimal_places=0)
    statut = serializers.ChoiceField(choices=Paiement.Statut.choices)
    date_creation = serializers.DateTimeField()
    date_confirmation = serializers.DateTimeField(allow_null=True)
    payment_url = serializers.URLField()


class BilletCompagnieSerializer(serializers.ModelSerializer):
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
            "statut",
            "date_creation",
            "date_embarquement",
        )


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


class VoyageDepartSerializer(serializers.Serializer):
    id_voyage = serializers.UUIDField()
    date_depart_effective = serializers.DateTimeField()
    depart_effectue_par = serializers.UUIDField()
    billets_non_utilises = serializers.IntegerField()


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
            "statut",
            "date_embarquement",
        )
