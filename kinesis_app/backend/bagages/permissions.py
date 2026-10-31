from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from compagnies.models import AgentCompagnie, Compagnie, PermissionAgent
from utilisateurs.models import Utilisateur

from .models import Bagage


def company_for_user(user, permission=None):
    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentification requise.")

    if user.role == Utilisateur.Role.COMPAGNIE:
        try:
            company = user.profil_compagnie
        except Compagnie.DoesNotExist:
            raise PermissionDenied("Profil compagnie introuvable.")
        if company.statut != Compagnie.Statut.ACTIVE:
            raise PermissionDenied("La compagnie n’est pas active.")
        return company

    if user.role == Utilisateur.Role.AGENT_COMPAGNIE:
        if user.must_change_password:
            raise PermissionDenied("Le mot de passe provisoire doit être changé.")
        try:
            agent = user.profil_agent
        except AgentCompagnie.DoesNotExist:
            raise PermissionDenied("Profil agent introuvable.")
        if agent.compagnie.statut != Compagnie.Statut.ACTIVE:
            raise PermissionDenied("La compagnie n’est pas active.")
        if permission and not agent.permissions.filter(permission=permission).exists():
            raise PermissionDenied("Permission agent manquante.")
        return agent.compagnie

    raise PermissionDenied("Ce rôle n’est pas autorisé pour les bagages.")


def has_agent_permission(user, permission):
    return user.profil_agent.permissions.filter(permission=permission).exists()


def can_manage_baggage(user, baggage, permission=None):
    if user.role == Utilisateur.Role.VOYAGEUR:
        return baggage.reservation.voyageur_id == user.pk
    try:
        company = company_for_user(user, permission=permission)
    except PermissionDenied:
        return False
    return baggage.reservation.voyage.compagnie_id == company.pk


def baggage_queryset_for_user(user):
    if user.role == Utilisateur.Role.VOYAGEUR:
        return Bagage.objects.filter(reservation__voyageur=user)

    company = company_for_user(user, permission=PermissionAgent.Code.CONSULTER_BAGAGES)
    return Bagage.objects.filter(reservation__voyage__compagnie=company)


class CanListBaggage(BasePermission):
    def has_permission(self, request, view):
        try:
            if request.user.role == Utilisateur.Role.VOYAGEUR:
                return request.user.is_authenticated
            company_for_user(
                request.user,
                permission=PermissionAgent.Code.CONSULTER_BAGAGES,
            )
            return True
        except PermissionDenied:
            return False


class CanRegisterBaggage(BasePermission):
    def has_permission(self, request, view):
        try:
            company_for_user(
                request.user,
                permission=PermissionAgent.Code.ENREGISTRER_BAGAGE,
            )
            return True
        except PermissionDenied:
            return False


class CanRecordBaggageFee(BasePermission):
    def has_permission(self, request, view):
        try:
            company_for_user(
                request.user,
                permission=PermissionAgent.Code.ENREGISTRER_BAGAGE,
            )
            return True
        except PermissionDenied:
            return False


class CanReturnBaggage(BasePermission):
    def has_permission(self, request, view):
        try:
            company_for_user(
                request.user,
                permission=PermissionAgent.Code.RESTITUER_BAGAGE,
            )
            return True
        except PermissionDenied:
            return False
