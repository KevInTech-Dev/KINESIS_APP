from rest_framework.permissions import BasePermission

from .models import Compagnie


class IsActiveCompany(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role != user.Role.COMPAGNIE:
            return False
        try:
            return user.profil_compagnie.statut == Compagnie.Statut.ACTIVE
        except Compagnie.DoesNotExist:
            return False