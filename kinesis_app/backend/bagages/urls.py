from django.urls import path

from .views import (
    BagageDetailView,
    BagageListCreateView,
    PaiementFraisBagageView,
    RestitutionBagageView,
    TarifDetailView,
    TarifListCreateView,
)

urlpatterns = [
    path("tarifs/", TarifListCreateView.as_view(), name="tarif-bagage-list"),
    path("tarifs/<uuid:pk>/", TarifDetailView.as_view(), name="tarif-bagage-detail"),
    path("", BagageListCreateView.as_view(), name="bagage-list"),
    path("<uuid:pk>/", BagageDetailView.as_view(), name="bagage-detail"),
    path("<uuid:pk>/paiement-frais/", PaiementFraisBagageView.as_view(), name="bagage-paiement-frais"),
    path("<uuid:pk>/restitution/", RestitutionBagageView.as_view(), name="bagage-restitution"),
]