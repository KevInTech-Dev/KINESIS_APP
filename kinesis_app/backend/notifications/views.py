from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(utilisateur=self.request.user)


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses={status.HTTP_200_OK: NotificationSerializer},
    )
    @transaction.atomic
    def post(self, request, pk):
        notification = get_object_or_404(
            Notification.objects.select_for_update(),
            pk=pk,
            utilisateur=request.user,
        )
        if notification.date_lecture is None:
            notification.date_lecture = timezone.now()
            notification.save(update_fields=("date_lecture",))
        return Response(NotificationSerializer(notification).data)


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses={
            status.HTTP_200_OK: inline_serializer(
                name="NotificationsReadAllResponse",
                fields={"updated": serializers.IntegerField()},
            )
        },
    )
    def post(self, request):
        updated = Notification.objects.filter(
            utilisateur=request.user,
            date_lecture__isnull=True,
        ).update(date_lecture=timezone.now())
        return Response({"updated": updated})
