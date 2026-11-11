import re
import unicodedata

from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


PHONE_FORMAT_RE = re.compile(r"^[279][0-9]{7}$", re.ASCII)


def normalize_togo_phone(value):
    compact = re.sub(r"[\s().-]", "", value)
    if compact.startswith("+228"):
        compact = compact[4:]
    if not PHONE_FORMAT_RE.fullmatch(compact):
        raise ValidationError(
            "Saisissez un numéro togolais valide.",
            code="invalid_togo_phone",
        )
    return f"+228{compact}"


def validate_person_name(value):
    normalized = " ".join(value.split())
    if not normalized:
        raise ValidationError(_("Ce champ est obligatoire."))
    if not any(character.isalpha() for character in normalized):
        raise ValidationError(_("Saisissez un nom valide."))
    for character in normalized:
        category = unicodedata.category(character)
        if (
            not character.isalpha()
            and not category.startswith("M")
            and character not in " '-’"
        ):
            raise ValidationError(
                "Utilisez uniquement des lettres, espaces, apostrophes ou traits d’union."
            )
    return normalized


class PasswordCompositionValidator:
    def validate(self, password, user=None):
        requirements = (
            (r"[A-Z]", "une lettre majuscule"),
            (r"[a-z]", "une lettre minuscule"),
            (r"[0-9]", "un chiffre"),
            (r"[^A-Za-z0-9]", "un caractère spécial"),
        )
        missing = [
            label
            for pattern, label in requirements
            if not re.search(pattern, password)
        ]
        if missing:
            raise ValidationError(
                _("Le mot de passe doit contenir au moins %(requirements)s."),
                code="password_composition",
                params={"requirements": ", ".join(missing)},
            )

    def get_help_text(self):
        return _(
            "Le mot de passe doit contenir une majuscule, une minuscule, "
            "un chiffre et un caractère spécial."
        )
