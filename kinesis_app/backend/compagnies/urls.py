from django.urls import path

from .views import (
    AgentDetailView,
    AgentListCreateView,
    AdminCompanyApproveView,
    AdminCompanyDeactivateView,
    AdminCompanyListView,
    AdminCompanyRefuseView,
    CompanyActivationView,
    CompanyRegistrationView,
    MyCompanyView,
)

urlpatterns = [
    path("register/", CompanyRegistrationView.as_view(), name="company-register"),
    path("activate/", CompanyActivationView.as_view(), name="company-activate"),
    path("admin/companies/", AdminCompanyListView.as_view(), name="admin-company-list"),
    path(
        "admin/companies/<uuid:pk>/approve/",
        AdminCompanyApproveView.as_view(),
        name="admin-company-approve",
    ),
    path(
        "admin/companies/<uuid:pk>/refuse/",
        AdminCompanyRefuseView.as_view(),
        name="admin-company-refuse",
    ),
    path(
        "admin/companies/<uuid:pk>/deactivate/",
        AdminCompanyDeactivateView.as_view(),
        name="admin-company-deactivate",
    ),
    path("me/", MyCompanyView.as_view(), name="my-company"),
    path("agents/", AgentListCreateView.as_view(), name="company-agents"),
    path("agents/<uuid:pk>/", AgentDetailView.as_view(), name="company-agent-detail"),
]