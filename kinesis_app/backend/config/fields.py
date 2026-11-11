from rest_framework import serializers


class LimitedImageField(serializers.ImageField):
    max_size = 5 * 1024 * 1024

    def to_internal_value(self, data):
        size = getattr(data, "size", None)
        if size is not None and size > self.max_size:
            raise serializers.ValidationError("L’image ne doit pas dépasser 5 Mo.")
        return super().to_internal_value(data)
