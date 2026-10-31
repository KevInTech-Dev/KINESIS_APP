from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Utilisateur


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirmation = serializers.CharField(write_only=True)

    class Meta:
        model = Utilisateur
        fields = (
            "id",
            "email",
            "nom",
            "prenoms",
            "telephone",
            "password",
            "password_confirmation",
            "role",
        )
        read_only_fields = ("id", "role")

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError(
                {"password_confirmation": "Les mots de passe ne correspondent pas."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirmation")
        password = validated_data.pop("password")
        return Utilisateur.objects.create_user(password=password, **validated_data)


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Utilisateur
        fields = (
            "id",
            "email",
            "nom",
            "prenoms",
            "telephone",
            "photo_profil",
            "role",
            "must_change_password",
        )
        read_only_fields = ("id", "email", "role", "must_change_password")