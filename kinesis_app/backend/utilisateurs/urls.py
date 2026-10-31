from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    ChangePasswordView,
    CurrentUserView,
    LogoutView,
    UserRegistrationView,
)

urlpatterns = [
    path("register/", UserRegistrationView.as_view(), name="user-register"),
    path("token/", TokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="user-logout"),
    path("change-password/", ChangePasswordView.as_view(), name="user-change-password"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
]