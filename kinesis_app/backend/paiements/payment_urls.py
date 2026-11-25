from django.urls import path

from .views import (
    CinetPayWebhookView,
    FedaPayWebhookView,
    PaiementAttemptView,
    PaiementDetailView,
    PaiementListView,
)

urlpatterns = [
    path("", PaiementListView.as_view(), name="payment-list"),
    path(
        "reservations/<uuid:reservation_id>/initier/",
        PaiementAttemptView.as_view(),
        name="payment-attempt",
    ),
    path("<uuid:pk>/", PaiementDetailView.as_view(), name="payment-detail"),
    path("fedapay/webhook/", FedaPayWebhookView.as_view(), name="fedapay-webhook"),
    path("cinetpay/webhook/", CinetPayWebhookView.as_view(), name="cinetpay-webhook"),
]
