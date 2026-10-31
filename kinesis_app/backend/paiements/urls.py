from django.urls import path

from .views import (
    BilletBoardingView,
    BilletDetailView,
    BilletListView,
    BilletScanView,
)

urlpatterns = [
    path("scan/", BilletScanView.as_view(), name="billet-scan"),
    path("embarquement/", BilletBoardingView.as_view(), name="billet-embarquement"),
    path("", BilletListView.as_view(), name="billet-list"),
    path("<uuid:pk>/", BilletDetailView.as_view(), name="billet-detail"),
]