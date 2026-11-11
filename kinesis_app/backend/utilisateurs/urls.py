from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import UserTokenObtainPairSerializer
from .views import (
    AdminUserListView,
    AdminUserSummaryView,
    ChangePasswordView,
    CurrentUserView,
    EmailVerificationConfirmView,
    EmailVerificationResendView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    UserRegistrationView,
)


class UserTokenObtainPairView(TokenObtainPairView):
    serializer_class = UserTokenObtainPairSerializer


urlpatterns = [
    path("register/", UserRegistrationView.as_view(), name="user-register"),
    path(
        "email-verification/resend/",
        EmailVerificationResendView.as_view(),
        name="email-verification-resend",
    ),
    path(
        "email-verification/confirm/",
        EmailVerificationConfirmView.as_view(),
        name="email-verification-confirm",
    ),
    path("users/summary/", AdminUserSummaryView.as_view(), name="admin-user-summary"),
    path("users/", AdminUserListView.as_view(), name="admin-user-list"),
    path("token/", UserTokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path(
        "password-reset/",
        PasswordResetRequestView.as_view(),
        name="password-reset-request",
    ),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("logout/", LogoutView.as_view(), name="user-logout"),
    path("change-password/", ChangePasswordView.as_view(), name="user-change-password"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
]