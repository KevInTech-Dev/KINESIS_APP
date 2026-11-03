from django.urls import path

from .views import AgentVoyageListView, VilleListView, VoyageDetailView, VoyageListCreateView

urlpatterns = [
    path("villes/", VilleListView.as_view(), name="ville-list"),
    path("compagnies/agents/voyages/", AgentVoyageListView.as_view(), name="agent-voyage-list"),
    path("voyages/", VoyageListCreateView.as_view(), name="voyage-list"),
    path("voyages/<uuid:pk>/", VoyageDetailView.as_view(), name="voyage-detail"),
]