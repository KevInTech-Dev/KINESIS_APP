from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.pagination import StandardResultsSetPagination

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListFilterSerializer(serializers.Serializer):
    non_lues = serializers.BooleanField(required=False)


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        queryset = Notification.objects.filter(utilisateur=self.request.user)
        if "non_lues" in self.request.query_params:
            filters = NotificationListFilterSerializer(
                data={"non_lues": self.request.query_params["non_lues"]}
            )
            filters.is_valid(raise_exception=True)
            if filters.validated_data["non_lues"]:
                queryset = queryset.filter(date_lecture__isnull=True)
            else:
                queryset = queryset.filter(date_lecture__isnull=False)
        return queryset

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="non_lues",
                type=bool,
                location=OpenApiParameter.QUERY,
                description="Filtre les notifications non lues (true) ou lues (false).",
            )
        ],
        description=(
            "Liste paginée des notifications de l’utilisateur connecté. "
            "page_size est limité à 100."
        ),
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


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
