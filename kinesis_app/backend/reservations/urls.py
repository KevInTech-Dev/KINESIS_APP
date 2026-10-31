from django.urls import path

from .views import ReservationCancelView, ReservationDetailView, ReservationListCreateView

urlpatterns = [
    path("", ReservationListCreateView.as_view(), name="reservation-list"),
    path("<uuid:pk>/", ReservationDetailView.as_view(), name="reservation-detail"),
    path(
        "<uuid:pk>/cancel/",
        ReservationCancelView.as_view(),
        name="reservation-cancel",
    ),
]