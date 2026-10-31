from django.urls import path

from .views import (
    AgentDetailView,
    AgentListCreateView,
    CompanyActivationView,
    CompanyRegistrationView,
    MyCompanyView,
)

urlpatterns = [
    path("register/", CompanyRegistrationView.as_view(), name="company-register"),
    path("activate/", CompanyActivationView.as_view(), name="company-activate"),
    path("me/", MyCompanyView.as_view(), name="my-company"),
    path("agents/", AgentListCreateView.as_view(), name="company-agents"),
    path("agents/<uuid:pk>/", AgentDetailView.as_view(), name="company-agent-detail"),
]