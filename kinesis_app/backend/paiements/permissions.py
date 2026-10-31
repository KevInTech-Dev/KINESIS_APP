from rest_framework.permissions import BasePermission

from compagnies.models import AgentCompagnie, Compagnie, PermissionAgent
from utilisateurs.models import Utilisateur


def has_ticket_permission(user, permission):
    if not user or not user.is_authenticated:
        return False
    if user.role != Utilisateur.Role.AGENT_COMPAGNIE or user.must_change_password:
        return False
    try:
        agent = user.profil_agent
    except AgentCompagnie.DoesNotExist:
        return False
    return (
        agent.compagnie.statut == Compagnie.Statut.ACTIVE
        and agent.permissions.filter(permission=permission).exists()
    )


class IsVoyageur(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == Utilisateur.Role.VOYAGEUR
        )


class CanScanTicket(BasePermission):
    def has_permission(self, request, view):
        return has_ticket_permission(
            request.user,
            PermissionAgent.Code.SCANNER_BILLET,
        )


class CanValidateBoarding(BasePermission):
    def has_permission(self, request, view):
        return has_ticket_permission(
            request.user,
            PermissionAgent.Code.SCANNER_BILLET,
        ) and has_ticket_permission(
            request.user,
            PermissionAgent.Code.VALIDER_EMBARQUEMENT,
        )