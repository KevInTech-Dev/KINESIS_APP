from rest_framework.permissions import BasePermission

from compagnies.models import Compagnie
from utilisateurs.models import Utilisateur


class IsActiveCompany(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role != Utilisateur.Role.COMPAGNIE:
            return False
        try:
            return user.profil_compagnie.statut == Compagnie.Statut.ACTIVE
        except Compagnie.DoesNotExist:
            return False


class IsOwnerCompany(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.compagnie_id == request.user.profil_compagnie.pk