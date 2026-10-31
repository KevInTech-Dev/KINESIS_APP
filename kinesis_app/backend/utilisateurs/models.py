import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Une adresse email est obligatoire.")

        if not password:
            raise ValueError("Un mot de passe est obligatoire.")

        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("role", Utilisateur.Role.ADMINISTRATEUR)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Un administrateur doit avoir is_staff=True.")

        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Un administrateur doit avoir is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class Utilisateur(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        VOYAGEUR = "VOYAGEUR", "Voyageur"
        COMPAGNIE = "COMPAGNIE", "Compagnie"
        AGENT_COMPAGNIE = "AGENT_COMPAGNIE", "Agent de compagnie"
        ADMINISTRATEUR = "ADMINISTRATEUR", "Administrateur"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    nom = models.CharField(max_length=100)
    prenoms = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    telephone = models.CharField(max_length=30, blank=True)
    photo_profil = models.ImageField(
        upload_to="profils/",
        blank=True,
        null=True,
    )
    role = models.CharField(
        max_length=25,
        choices=Role.choices,
        default=Role.VOYAGEUR,
    )

    # Champs nécessaires au fonctionnement de l'authentification Django.
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    must_change_password = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["nom", "prenoms"]

    def __str__(self):
        if self.role == self.Role.VOYAGEUR:
            return f"Voyageur {self.pk}"
        return self.email