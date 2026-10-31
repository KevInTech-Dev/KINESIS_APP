from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from compagnies.models import Compagnie, PermissionAgent
from notifications.models import Notification
from reservations.models import Reservation

from .models import Bagage, TarifBagage
from .permissions import company_for_user


def _validate_tariff_grid(company, intervals):
    intervals = sorted(intervals, key=lambda interval: interval[0])
    if not intervals:
        return
    if intervals[0][0] != 0:
        raise ValidationError({"poids_min": "La première tranche doit commencer à 0 kg."})
    for previous, following in zip(intervals, intervals[1:]):
        if previous[1] > following[0]:
            raise ValidationError("Les tranches de poids ne doivent pas se chevaucher.")
        if previous[1] < following[0]:
            raise ValidationError("La grille tarifaire ne doit pas laisser de poids sans tarif.")


def create_tariff(*, actor, poids_min, poids_max, prix):
    with transaction.atomic():
        company = company_for_user(actor)
        company = Compagnie.objects.select_for_update().get(pk=company.pk)
        tariffs = list(
            TarifBagage.objects.filter(compagnie=company).values_list(
                "poids_min", "poids_max"
            )
        )
        _validate_tariff_grid(
            company,
            tariffs + [(Decimal(poids_min), Decimal(poids_max))],
        )
        return TarifBagage.objects.create(
            compagnie=company,
            poids_min=poids_min,
            poids_max=poids_max,
            prix=prix,
        )


def update_tariff(*, actor, tariff_id, changes):
    with transaction.atomic():
        company = company_for_user(actor)
        company = Compagnie.objects.select_for_update().get(pk=company.pk)
        try:
            tariff = TarifBagage.objects.select_for_update().get(
                pk=tariff_id,
                compagnie=company,
            )
        except TarifBagage.DoesNotExist:
            raise ValidationError({"tarif": "Tarif introuvable."})

        new_min = Decimal(changes.get("poids_min", tariff.poids_min))
        new_max = Decimal(changes.get("poids_max", tariff.poids_max))
        intervals = list(
            TarifBagage.objects.filter(compagnie=company)
            .exclude(pk=tariff.pk)
            .values_list("poids_min", "poids_max")
        )
        _validate_tariff_grid(company, intervals + [(new_min, new_max)])

        for field, value in changes.items():
            setattr(tariff, field, value)
        tariff.save()
        return tariff


def delete_tariff(*, actor, tariff_id):
    with transaction.atomic():
        company = company_for_user(actor)
        company = Compagnie.objects.select_for_update().get(pk=company.pk)
        try:
            tariff = TarifBagage.objects.select_for_update().get(
                pk=tariff_id,
                compagnie=company,
            )
        except TarifBagage.DoesNotExist:
            raise ValidationError({"tarif": "Tarif introuvable."})
        intervals = list(
            TarifBagage.objects.filter(compagnie=company)
            .exclude(pk=tariff.pk)
            .values_list("poids_min", "poids_max")
        )
        _validate_tariff_grid(company, intervals)
        tariff.delete()


def register_baggage(
    *,
    actor,
    reservation_id,
    poids,
    photo_files,
    description="",
    frais_special=None,
    motif_tarif_special="",
):
    photo_files = list(photo_files)
    if not photo_files:
        raise ValidationError({"photos": "Au moins une photo est obligatoire."})

    company = company_for_user(actor, permission=PermissionAgent.Code.ENREGISTRER_BAGAGE)
    weight = Decimal(str(poids))
    now = timezone.now()

    with transaction.atomic():
        company = Compagnie.objects.select_for_update().get(pk=company.pk)
        try:
            reservation = (
                Reservation.objects.select_for_update()
                .select_related("voyage")
                .get(pk=reservation_id)
            )
        except Reservation.DoesNotExist:
            raise ValidationError({"reservation_id": "Réservation introuvable."})

        if reservation.voyage.compagnie_id != company.pk:
            raise ValidationError({"reservation_id": "Réservation hors périmètre compagnie."})
        if reservation.statut != Reservation.Statut.PAYEE:
            raise ValidationError({"reservation_id": "La réservation doit être payée."})

        tariff = TarifBagage.objects.filter(
            compagnie=company,
            poids_min__lte=weight,
            poids_max__gt=weight,
        ).first()
        if tariff:
            if frais_special is not None:
                raise ValidationError(
                    {"frais_special": "Un tarif spécial n’est pas utile pour ce poids."}
                )
            fee = tariff.prix
            is_special = False
            special_reason = ""
        else:
            if frais_special is None or not motif_tarif_special.strip():
                raise ValidationError(
                    {
                        "frais_special": (
                            "Aucun tarif ne couvre ce poids. Fournissez un frais spécial "
                            "et son motif."
                        )
                    }
                )
            fee = Decimal(str(frais_special))
            if fee < 0:
                raise ValidationError({"frais_special": "Le frais spécial doit être positif ou nul."})
            is_special = True
            special_reason = motif_tarif_special.strip()

        baggage = Bagage.objects.create(
            reservation=reservation,
            description=description,
            poids=weight,
            tarif_applique=tariff,
            poids_min_applique=tariff.poids_min if tariff else None,
            poids_max_applique=tariff.poids_max if tariff else None,
            prix_tarif_applique=tariff.prix if tariff else None,
            tarif_special=is_special,
            motif_tarif_special=special_reason,
            frais_total=fee,
            frais_payes=(fee == 0),
            date_paiement_frais=now if fee == 0 else None,
            enregistre_par=actor,
        )
        for image in photo_files:
            baggage.photos.create(image=image)
        Notification.objects.create(
            utilisateur=reservation.voyageur,
            type=Notification.Type.BAGAGE,
            titre="Bagage enregistré",
            message=(
                f"Un bagage de {weight} kg a été enregistré pour la réservation "
                f"{reservation.reference}. Frais dus : {fee} FCFA."
            ),
        )
        return baggage


def record_manual_fee_payment(*, actor, baggage_id):
    company = company_for_user(actor, permission=PermissionAgent.Code.ENREGISTRER_BAGAGE)
    with transaction.atomic():
        try:
            baggage = Bagage.objects.select_for_update().select_related(
                "reservation__voyage",
                "reservation__voyageur",
            ).get(pk=baggage_id)
        except Bagage.DoesNotExist:
            raise ValidationError({"bagage": "Bagage introuvable."})
        if baggage.reservation.voyage.compagnie_id != company.pk:
            raise ValidationError({"bagage": "Bagage hors périmètre compagnie."})
        if baggage.frais_total <= 0:
            raise ValidationError({"bagage": "Aucun frais n’est dû pour ce bagage."})
        if baggage.frais_payes:
            raise ValidationError({"bagage": "Les frais sont déjà enregistrés comme payés."})
        baggage.frais_payes = True
        baggage.date_paiement_frais = timezone.now()
        baggage.paiement_enregistre_par = actor
        baggage.save(
            update_fields=("frais_payes", "date_paiement_frais", "paiement_enregistre_par")
        )
        Notification.objects.create(
            utilisateur=baggage.reservation.voyageur,
            type=Notification.Type.BAGAGE,
            titre="Paiement des frais de bagage enregistré",
            message=(
                f"Le paiement de {baggage.frais_total} FCFA pour la réservation "
                f"{baggage.reservation.reference} a été enregistré."
            ),
        )
        return baggage


def return_baggage(*, actor, baggage_id):
    company = company_for_user(actor, permission=PermissionAgent.Code.RESTITUER_BAGAGE)
    with transaction.atomic():
        try:
            baggage = Bagage.objects.select_for_update().select_related(
                "reservation__voyage",
                "reservation__voyageur",
            ).get(pk=baggage_id)
        except Bagage.DoesNotExist:
            raise ValidationError({"bagage": "Bagage introuvable."})
        if baggage.reservation.voyage.compagnie_id != company.pk:
            raise ValidationError({"bagage": "Bagage hors périmètre compagnie."})
        if baggage.statut != Bagage.Statut.ENREGISTRE:
            raise ValidationError({"bagage": "Ce bagage a déjà été restitué."})
        if not baggage.frais_payes:
            raise ValidationError({"bagage": "Les frais doivent être réglés avant restitution."})
        baggage.statut = Bagage.Statut.RESTITUE
        baggage.date_restitution = timezone.now()
        baggage.restitue_par = actor
        baggage.save(update_fields=("statut", "date_restitution", "restitue_par"))
        Notification.objects.create(
            utilisateur=baggage.reservation.voyageur,
            type=Notification.Type.BAGAGE,
            titre="Bagage restitué",
            message=(
                f"Le bagage de la réservation {baggage.reservation.reference} "
                "a été marqué comme restitué."
            ),
        )
        return baggage
