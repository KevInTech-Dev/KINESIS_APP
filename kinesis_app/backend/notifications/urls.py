from django.urls import path

from .views import (
    NotificationListView,
    NotificationReadAllView,
    NotificationReadView,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("lire-tout/", NotificationReadAllView.as_view(), name="notification-read-all"),
    path("<uuid:pk>/lire/", NotificationReadView.as_view(), name="notification-read"),
]
