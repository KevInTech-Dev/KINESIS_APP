from rest_framework.permissions import BasePermission

from utilisateurs.models import Utilisateur


class IsVoyageur(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == Utilisateur.Role.VOYAGEUR
        )