from django.urls import path

from .views import (
    BilletBoardingView,
    BilletDetailView,
    BilletListView,
    BilletScanView,
    VoyageDepartureView,
)

urlpatterns = [
    path("scan/", BilletScanView.as_view(), name="billet-scan"),
    path("embarquement/", BilletBoardingView.as_view(), name="billet-embarquement"),
    path(
        "voyages/<uuid:voyage_id>/depart/",
        VoyageDepartureView.as_view(),
        name="voyage-departure",
    ),
    path("", BilletListView.as_view(), name="billet-list"),
    path("<uuid:pk>/", BilletDetailView.as_view(), name="billet-detail"),
]
