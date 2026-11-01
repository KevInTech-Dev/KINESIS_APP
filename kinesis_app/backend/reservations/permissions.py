from rest_framework.permissions import BasePermission

from compagnies.models import AgentCompagnie, Compagnie, PermissionAgent
from utilisateurs.models import Utilisateur


def reservation_view_company(user):
    if user.role == Utilisateur.Role.COMPAGNIE:
        try:
            company = user.profil_compagnie
        except Compagnie.DoesNotExist:
            return None
        return company if company.statut == Compagnie.Statut.ACTIVE else None

    if user.role != Utilisateur.Role.AGENT_COMPAGNIE or user.must_change_password:
        return None

    try:
        agent = user.profil_agent
    except AgentCompagnie.DoesNotExist:
        return None

    if agent.compagnie.statut != Compagnie.Statut.ACTIVE:
        return None
    required_permissions = (
        PermissionAgent.Code.ENREGISTRER_BAGAGE,
        PermissionAgent.Code.CONSULTER_BAGAGES,
    )
    if agent.permissions.filter(permission__in=required_permissions).exists():
        return agent.compagnie
    return None


class CanViewReservations(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method == "POST":
            return user.role == Utilisateur.Role.VOYAGEUR
        if user.role == Utilisateur.Role.VOYAGEUR:
            return True
        return reservation_view_company(user) is not None


class IsVoyageur(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == Utilisateur.Role.VOYAGEUR
        )