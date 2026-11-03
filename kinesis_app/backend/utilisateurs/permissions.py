from rest_framework.permissions import BasePermission

from .models import Utilisateur


class PasswordChangeComplete(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.must_change_password:
            return request.resolver_match.url_name == "user-change-password" or (
                request.method == "GET"
                and request.resolver_match.url_name == "current-user"
            )
        return True


class IsKinesisAdministrator(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return (
            user
            and user.is_authenticated
            and user.is_staff
            and user.role == Utilisateur.Role.ADMINISTRATEUR
        )