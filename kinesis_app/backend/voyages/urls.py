from django.urls import path

from .views import VilleListView, VoyageDetailView, VoyageListCreateView

urlpatterns = [
    path("villes/", VilleListView.as_view(), name="ville-list"),
    path("voyages/", VoyageListCreateView.as_view(), name="voyage-list"),
    path("voyages/<uuid:pk>/", VoyageDetailView.as_view(), name="voyage-detail"),
]