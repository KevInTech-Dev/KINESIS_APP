from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from .models import BilletElectronique
from .permissions import IsVoyageur
from .serializers import BilletElectroniqueSerializer


class BilletListView(generics.ListAPIView):
    serializer_class = BilletElectroniqueSerializer
    permission_classes = [IsAuthenticated, IsVoyageur]

    def get_queryset(self):
        return (
            BilletElectronique.objects.filter(
                place__reservation__voyageur=self.request.user,
            )
            .select_related(
                "place__reservation__voyage",
                "place__reservation__voyage__compagnie__utilisateur",
                "place__reservation__voyage__ville_depart",
                "place__reservation__voyage__ville_arrivee",
                "place__reservation",
            )
        )


class BilletDetailView(generics.RetrieveAPIView):
    serializer_class = BilletElectroniqueSerializer
    permission_classes = [IsAuthenticated, IsVoyageur]

    def get_queryset(self):
        return BilletElectronique.objects.filter(
            place__reservation__voyageur=self.request.user,
        ).select_related(
            "place__reservation__voyage",
            "place__reservation__voyage__compagnie__utilisateur",
            "place__reservation__voyage__ville_depart",
            "place__reservation__voyage__ville_arrivee",
            "place__reservation",
        )