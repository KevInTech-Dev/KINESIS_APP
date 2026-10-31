from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import Utilisateur


class UtilisateurCreationForm(UserCreationForm):
	class Meta(UserCreationForm.Meta):
		model = Utilisateur
		fields = ("email", "nom", "prenoms", "role")


class UtilisateurChangeForm(UserChangeForm):
	class Meta(UserChangeForm.Meta):
		model = Utilisateur
		fields = "__all__"


@admin.register(Utilisateur)
class UtilisateurAdmin(UserAdmin):
	form = UtilisateurChangeForm
	add_form = UtilisateurCreationForm
	ordering = ("email",)
	list_display = ("email", "nom", "prenoms", "role", "is_staff", "is_active")
	list_filter = ("role", "is_staff", "is_active")
	search_fields = ("email", "nom", "prenoms")
	fieldsets = (
		(None, {"fields": ("email", "password")}),
		(
			"Informations personnelles",
			{"fields": ("nom", "prenoms", "telephone", "photo_profil", "role")},
		),
		(
			"Autorisations",
			{"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
		),
		("Dates importantes", {"fields": ("last_login",)}),
	)
	add_fieldsets = (
		(
			None,
			{
				"classes": ("wide",),
				"fields": ("email", "nom", "prenoms", "role", "password1", "password2"),
			},
		),
	)
	filter_horizontal = ("groups", "user_permissions")
