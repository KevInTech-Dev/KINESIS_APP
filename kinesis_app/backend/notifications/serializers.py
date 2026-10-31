from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id_notification",
            "type",
            "titre",
            "message",
            "lue",
            "date_creation",
        )
        read_only_fields = fields
