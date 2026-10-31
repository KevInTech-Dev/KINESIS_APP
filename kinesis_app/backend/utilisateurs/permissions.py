from rest_framework.permissions import BasePermission


class PasswordChangeComplete(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.must_change_password:
            return request.resolver_match.url_name == "user-change-password"
        return True