from django.urls import path

from .views import BilletDetailView, BilletListView

urlpatterns = [
    path("", BilletListView.as_view(), name="billet-list"),
    path("<uuid:pk>/", BilletDetailView.as_view(), name="billet-detail"),
]