from django.urls import path

from .views import FedaPayWebhookView, PaiementAttemptView, PaiementDetailView

urlpatterns = [
    path(
        "reservations/<uuid:reservation_id>/initier/",
        PaiementAttemptView.as_view(),
        name="payment-attempt",
    ),
    path("<uuid:pk>/", PaiementDetailView.as_view(), name="payment-detail"),
    path("fedapay/webhook/", FedaPayWebhookView.as_view(), name="fedapay-webhook"),
]
