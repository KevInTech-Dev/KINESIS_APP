from django.urls import path

from .views import (
    AgentVoyageListView,
    VilleListView,
    VoyageDetailView,
    VoyageListCreateView,
    VoyageSeatAvailabilityView,
)

urlpatterns = [
    path("villes/", VilleListView.as_view(), name="ville-list"),
    path("compagnies/agents/voyages/", AgentVoyageListView.as_view(), name="agent-voyage-list"),
    path("voyages/", VoyageListCreateView.as_view(), name="voyage-list"),
    path(
        "voyages/<uuid:pk>/sieges/",
        VoyageSeatAvailabilityView.as_view(),
        name="voyage-seat-availability",
    ),
    path("voyages/<uuid:pk>/", VoyageDetailView.as_view(), name="voyage-detail"),
]