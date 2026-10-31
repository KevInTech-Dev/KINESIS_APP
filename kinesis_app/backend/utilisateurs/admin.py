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
	ordering = ("id",)
	list_display = ("id", "role", "is_active")
	list_filter = ("role", "is_staff", "is_active")
	search_fields = ()
	readonly_fields = ("id", "email", "role")

	def get_fieldsets(self, request, obj=None):
		fields = ("id", "role", "is_active")
		if obj and obj.role != Utilisateur.Role.VOYAGEUR:
			fields = ("id", "email", "role", "is_active")
		return ((None, {"fields": fields}),)

	def has_add_permission(self, request):
		return False

	def has_delete_permission(self, request, obj=None):
		return False
