from rest_framework.permissions import BasePermission

from .models import AgentCompagnie, Compagnie, PermissionAgent


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


class CanOperateAgentVoyages(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if (
            not user
            or not user.is_authenticated
            or user.role != user.Role.AGENT_COMPAGNIE
            or user.must_change_password
        ):
            return False
        try:
            agent = user.profil_agent
        except AgentCompagnie.DoesNotExist:
            return False
        return (
            agent.compagnie.statut == Compagnie.Statut.ACTIVE
            and agent.permissions.filter(
                permission__in=(
                    PermissionAgent.Code.SCANNER_BILLET,
                    PermissionAgent.Code.VALIDER_EMBARQUEMENT,
                )
            ).count()
            == 2
        )