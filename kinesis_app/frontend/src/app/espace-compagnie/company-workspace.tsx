"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Bell,
  BusFront,
  ChartNoAxesCombined,
  ChevronRight,
  CreditCard,
  ExternalLink,
  MapPin,
  LayoutDashboard,
  LogOut,
  Luggage,
  Plus,
  TicketCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import ConfirmationDialog from "@/components/confirmation-dialog";
import AppDialog from "@/components/app-dialog";
import KinesisLoader from "@/components/kinesis-loader";
import { useListPagination } from "@/components/list-pagination";
import ProfileAvatar from "@/components/profile-avatar";
import ProfileEditDialog from "@/components/profile-edit-dialog";
import ProfileViewDialog from "@/components/profile-view-dialog";
import SidebarProfileMenu from "@/components/sidebar-profile-menu";
import { getPublicCities } from "@/lib/public-cities";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";
import {
  getUserFacingApiError,
  getUserFacingErrorMessage,
} from "@/lib/user-facing-errors";

const StationLocationInput = dynamic(
  () => import("@/components/station-location-input"),
  {
    loading: () => <p role="status">Chargement de la saisie d’adresse…</p>,
  },
);

type Company = {
  email: string;
  raison_sociale: string;
  nom_commercial: string;
  telephone: string;
  telephone_secondaire: string;
  nif: string;
  rccm: string;
  logo: string | null;
  description: string;
  adresse: string;
  statut: string;
};
type City = { id_ville: string; nom: string };
type Station = {
  id_gare: string;
  ville: string;
  ville_nom: string;
  nom: string;
  date_creation?: string;
  adresse: string;
  latitude: string | null;
  longitude: string | null;
  google_place_id: string;
  maps_url: string;
  active: boolean;
};
type Trip = {
  id_voyage: string;
  compagnie: string;
  date_creation?: string;
  ville_depart: string;
  ville_depart_nom: string;
  ville_arrivee: string;
  ville_arrivee_nom: string;
  gare_depart: { id_gare: string; nom: string; adresse: string } | null;
  gare_arrivee: { id_gare: string; nom: string; adresse: string } | null;
  date_depart: string;
  heure_depart: string;
  date_depart_effective: string | null;
  place_totale: number;
  places_disponibles: number;
  prix: string | number;
  image: string | null;
  statut: string;
};
type Agent = {
  id: string;
  date_creation?: string | null;
  email: string;
  nom: string;
  prenoms: string;
  telephone: string;
  photo_profil: string | null;
  is_active: boolean;
  invitation_en_attente: boolean;
  permissions: string[];
};
type Payment = {
  id_paiement: string;
  reference_interne: string;
  montant: string | number;
  statut: string;
  date_creation: string;
  date_confirmation: string | null;
  reservation_reference: string;
  id_voyage: string;
  ville_depart_nom: string;
  ville_arrivee_nom: string;
  date_depart: string;
};
type BaggageTariff = {
  id_tarif: string;
  date_creation?: string;
  poids_min: string | number;
  poids_max: string | number;
  prix: string | number;
};
type CompanyReservation = {
  id_reservation: string;
  reference: string;
  date_reservation: string;
  date_expiration: string | null;
  montant_total: string | number;
  statut: string;
  voyage: {
    ville_depart_nom: string;
    ville_arrivee_nom: string;
    date_depart: string;
    heure_depart: string;
  };
  places: Array<{ nom_passager: string; numero_siege: string }>;
};
type Notification = {
  id_notification: string;
  type: string;
  titre: string;
  message: string;
  lue: boolean;
  date_creation: string;
};
type Tab =
  | "overview"
  | "trips"
  | "stations"
  | "agents"
  | "reservations"
  | "tariffs"
  | "payments"
  | "notifications"
  | "profile";
type PaymentRange = "7d" | "30d" | "90d";
type DeferredData = "locations" | "tariffs" | "notifications";

function deferredDataForTab(tab: Tab): DeferredData | null {
  if (tab === "stations" || tab === "trips") return "locations";
  if (tab === "tariffs" || tab === "notifications") return tab;
  return null;
}

const PERMISSIONS = [
  ["ENREGISTRER_BAGAGE", "Enregistrer un bagage"],
  ["SCANNER_BILLET", "Scanner un billet"],
  ["VALIDER_EMBARQUEMENT", "Valider un embarquement"],
  ["CONSULTER_BAGAGES", "Consulter les bagages"],
  ["RESTITUER_BAGAGE", "Restituer un bagage"],
] as const;

const TABS: { id: Tab; label: string; icon: LucideIcon; group: "operations" | "account" }[] = [
  { id: "overview", label: "Vue d’ensemble", icon: LayoutDashboard, group: "operations" },
  { id: "trips", label: "Mes trajets", icon: BusFront, group: "operations" },
  { id: "stations", label: "Mes gares", icon: MapPin, group: "operations" },
  { id: "agents", label: "Équipe", icon: UsersRound, group: "operations" },
  { id: "reservations", label: "Réservations", icon: TicketCheck, group: "operations" },
  { id: "tariffs", label: "Tarifs bagages", icon: Luggage, group: "operations" },
  { id: "payments", label: "Paiements", icon: CreditCard, group: "operations" },
  { id: "notifications", label: "Notifications", icon: Bell, group: "account" },
];

const PAYMENT_RANGES: { id: PaymentRange; label: string; days: number }[] = [
  { id: "7d", label: "7 jours", days: 7 },
  { id: "30d", label: "30 jours", days: 30 },
  { id: "90d", label: "3 mois", days: 90 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCompany(value: unknown): value is Company {
  return (
    isRecord(value) &&
    typeof value.email === "string" &&
    typeof value.raison_sociale === "string" &&
    typeof value.nom_commercial === "string" &&
    typeof value.telephone === "string" &&
    typeof value.telephone_secondaire === "string" &&
    typeof value.nif === "string" &&
    typeof value.rccm === "string" &&
    (typeof value.logo === "string" || value.logo === null) &&
    typeof value.description === "string" &&
    typeof value.adresse === "string" &&
    typeof value.statut === "string"
  );
}

function isTrip(value: unknown): value is Trip {
  return (
    isRecord(value) &&
    typeof value.id_voyage === "string" &&
    typeof value.compagnie === "string" &&
    (value.date_creation === undefined || typeof value.date_creation === "string") &&
    typeof value.ville_depart === "string" &&
    typeof value.ville_depart_nom === "string" &&
    typeof value.ville_arrivee === "string" &&
    typeof value.ville_arrivee_nom === "string" &&
    (value.gare_depart === null ||
      (isRecord(value.gare_depart) &&
        typeof value.gare_depart.id_gare === "string" &&
        typeof value.gare_depart.nom === "string" &&
        typeof value.gare_depart.adresse === "string")) &&
    (value.gare_arrivee === null ||
      (isRecord(value.gare_arrivee) &&
        typeof value.gare_arrivee.id_gare === "string" &&
        typeof value.gare_arrivee.nom === "string" &&
        typeof value.gare_arrivee.adresse === "string")) &&
    typeof value.date_depart === "string" &&
    typeof value.heure_depart === "string" &&
    (typeof value.date_depart_effective === "string" ||
      value.date_depart_effective === null) &&
    typeof value.place_totale === "number" &&
    typeof value.places_disponibles === "number" &&
    (typeof value.prix === "number" || typeof value.prix === "string") &&
    (typeof value.image === "string" || value.image === null) &&
    typeof value.statut === "string"
  );
}

function isStation(value: unknown): value is Station {
  return (
    isRecord(value) &&
    typeof value.id_gare === "string" &&
    typeof value.ville === "string" &&
    typeof value.ville_nom === "string" &&
    typeof value.nom === "string" &&
    (value.date_creation === undefined || typeof value.date_creation === "string") &&
    typeof value.adresse === "string" &&
    (typeof value.latitude === "string" || value.latitude === null) &&
    (typeof value.longitude === "string" || value.longitude === null) &&
    typeof value.google_place_id === "string" &&
    typeof value.maps_url === "string" &&
    typeof value.active === "boolean"
  );
}

function isAgent(value: unknown): value is Agent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.date_creation === undefined ||
      typeof value.date_creation === "string" ||
      value.date_creation === null) &&
    typeof value.email === "string" &&
    typeof value.nom === "string" &&
    typeof value.prenoms === "string" &&
    typeof value.telephone === "string" &&
    (typeof value.photo_profil === "string" || value.photo_profil === null) &&
    typeof value.is_active === "boolean" &&
    typeof value.invitation_en_attente === "boolean" &&
    Array.isArray(value.permissions) &&
    value.permissions.every((permission) => typeof permission === "string")
  );
}

function isPayment(value: unknown): value is Payment {
  return (
    isRecord(value) &&
    typeof value.id_paiement === "string" &&
    typeof value.reference_interne === "string" &&
    (typeof value.montant === "number" || typeof value.montant === "string") &&
    typeof value.statut === "string" &&
    typeof value.date_creation === "string" &&
    (typeof value.date_confirmation === "string" || value.date_confirmation === null) &&
    typeof value.reservation_reference === "string" &&
    typeof value.id_voyage === "string" &&
    typeof value.ville_depart_nom === "string" &&
    typeof value.ville_arrivee_nom === "string" &&
    typeof value.date_depart === "string"
  );
}

function isBaggageTariff(value: unknown): value is BaggageTariff {
  return (
    isRecord(value) &&
    typeof value.id_tarif === "string" &&
    (value.date_creation === undefined || typeof value.date_creation === "string") &&
    (typeof value.poids_min === "string" || typeof value.poids_min === "number") &&
    (typeof value.poids_max === "string" || typeof value.poids_max === "number") &&
    (typeof value.prix === "string" || typeof value.prix === "number")
  );
}

function isCompanyReservation(value: unknown): value is CompanyReservation {
  return (
    isRecord(value) &&
    typeof value.id_reservation === "string" &&
    typeof value.reference === "string" &&
    typeof value.date_reservation === "string" &&
    (typeof value.date_expiration === "string" || value.date_expiration === null) &&
    (typeof value.montant_total === "string" || typeof value.montant_total === "number") &&
    typeof value.statut === "string" &&
    isRecord(value.voyage) &&
    typeof value.voyage.ville_depart_nom === "string" &&
    typeof value.voyage.ville_arrivee_nom === "string" &&
    typeof value.voyage.date_depart === "string" &&
    typeof value.voyage.heure_depart === "string" &&
    Array.isArray(value.places) &&
    value.places.every(
      (place) =>
        isRecord(place) &&
        typeof place.nom_passager === "string" &&
        typeof place.numero_siege === "string",
    )
  );
}

function isNotification(value: unknown): value is Notification {
  return (
    isRecord(value) &&
    typeof value.id_notification === "string" &&
    typeof value.type === "string" &&
    typeof value.titre === "string" &&
    typeof value.message === "string" &&
    typeof value.lue === "boolean" &&
    typeof value.date_creation === "string"
  );
}

function listFrom<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  resource: string,
): T[] {
  let rows: unknown[] | null = null;
  if (Array.isArray(value)) {
    rows = value;
  } else if (isRecord(value) && Array.isArray(value.results)) {
    rows = value.results;
  }
  if (!rows || !rows.every(guard)) {
    const invalidIndexes = rows
      ?.map((row, index) => (guard(row) ? -1 : index))
      .filter((index) => index >= 0);
    console.error("Company API returned an unexpected list format", {
      resource,
      invalidIndexes,
    });
    throw new Error(
      "Certaines informations sont incomplètes. Actualisez la page puis réessayez.",
    );
  }
  return rows;
}

function compareTripCreationDescending(first: Trip, second: Trip) {
  if (!first.date_creation || !second.date_creation) return 0;
  const difference =
    Date.parse(second.date_creation) - Date.parse(first.date_creation);
  return Number.isNaN(difference) ? 0 : difference;
}

function compareCreationDescending(
  first: { date_creation?: string | null },
  second: { date_creation?: string | null },
) {
  if (!first.date_creation || !second.date_creation) return 0;
  const difference =
    Date.parse(second.date_creation) - Date.parse(first.date_creation);
  return Number.isNaN(difference) ? 0 : difference;
}

async function requestApi(
  resource: string,
  method = "GET",
  payload?: FormData | Record<string, unknown>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/compagnie/${resource}`, {
      method,
      ...(payload instanceof FormData
        ? { body: payload }
        : payload
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          : {}),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      getUserFacingErrorMessage(
        error,
        "Le service ne répond pas pour le moment. Vérifiez votre connexion puis réessayez.",
      ),
    );
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      getUserFacingApiError(
        data,
        "L’action n’a pas pu aboutir. Réessayez dans quelques instants.",
        response.status,
      ),
    );
  }
  return data;
}

function formatPrice(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`
    : `${value} FCFA`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  return hour < 12 ? "BONJOUR" : "BONSOIR";
}

function statusLabel(status: string) {
  return (
    {
      PUBLIE: "Publié",
      ANNULEE: "Annulé",
      ARCHIVE: "Archivé",
      EXPIREE: "Terminé",
      CONFIRME: "Confirmé",
      EN_ATTENTE: "En attente",
      REJETE: "Rejeté",
      ECHEC: "Échec",
      REMBOURSE: "Remboursé",
      A_RECONCILIER: "À vérifier",
      EN_ATTENTE_PAIEMENT: "En attente de paiement",
      PAYEE: "Payée",
    }[status] ?? status
  );
}

function isFuture(value: Trip) {
  return new Date(`${value.date_depart}T${value.heure_depart}`).getTime() >= Date.now();
}

function getPaymentBuckets(
  payments: Payment[],
  range: PaymentRange,
  now: number,
) {
  const days = PAYMENT_RANGES.find((item) => item.id === range)?.days ?? 7;
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);

  const bucketDuration = (end.getTime() - start.getTime() + 1) / 7;
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const bucketStart = new Date(start.getTime() + bucketDuration * index);
    return {
      label: new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
      }).format(bucketStart),
      amount: 0,
      count: 0,
    };
  });

  payments.forEach((payment) => {
    if (payment.statut !== "CONFIRME") return;
    const paidAt = new Date(payment.date_confirmation ?? payment.date_creation);
    if (Number.isNaN(paidAt.getTime()) || paidAt < start || paidAt > end) return;
    const index = Math.min(
      Math.floor((paidAt.getTime() - start.getTime()) / bucketDuration),
      buckets.length - 1,
    );
    buckets[index].amount += Number(payment.montant) || 0;
    buckets[index].count += 1;
  });

  return buckets;
}

function CompanySidebar({
  company,
  profile,
  tab,
  onSelect,
  onCreateTrip,
  onLogout,
  onProfileUpdated,
  tripCount,
  unreadCount,
}: {
  company: Company;
  profile: UserProfile;
  tab: Tab;
  onSelect: (tab: Tab) => void;
  onCreateTrip: () => void;
  onLogout: () => void;
  onProfileUpdated: (profile: UserProfile) => void;
  tripCount: number;
  unreadCount: number;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const selectTab = (nextTab: Tab) => {
    onSelect(nextTab);
    if (isMobile) setOpenMobile(false);
  };
  const operations = TABS.filter((item) => item.group === "operations");
  const account = TABS.filter((item) => item.group === "account");

  return (
    <Sidebar
      className="company-sidebar company-sidebar--mobile-nav-clearance"
      variant="inset"
      collapsible="icon"
    >
      <SidebarHeader className="company-sidebar__header">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="KINESIS — Accueil"
              className="company-sidebar__brand"
            >
              <Link href="/">
                <span className="kinesis-logo-mark company-sidebar__brand-mark">
                  <Image src="/kinesis-mark.png" width={34} height={34} alt="" priority />
                </span>
                <span>KINESIS</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Publier un trajet"
              className="company-sidebar__create"
              onClick={() => {
                onCreateTrip();
                if (isMobile) setOpenMobile(false);
              }}
            >
              <Plus />
              <span>Publier un trajet</span>
              <ChevronRight className="company-sidebar__create-arrow" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="company-sidebar__content">
        <SidebarGroup>
          <SidebarGroupLabel>Opérations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operations.map((item) => {
                const Icon = item.icon;
                const badge =
                  item.id === "trips"
                    ? tripCount
                    : item.id === "notifications"
                      ? unreadCount
                      : 0;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      type="button"
                      isActive={tab === item.id}
                      tooltip={item.label}
                      onClick={() => selectTab(item.id)}
                    >
                      <Icon />
                      <span>{item.label}</span>
                      {badge > 0 ? (
                        <SidebarMenuBadge>{badge}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Compte</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {account.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      type="button"
                      isActive={tab === item.id}
                      tooltip={item.label}
                      onClick={() => selectTab(item.id)}
                    >
                      <Icon />
                      <span>{item.label}</span>
                      {item.id === "notifications" && unreadCount > 0 ? (
                        <SidebarMenuBadge>{unreadCount}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Voir le site KINESIS">
                  <Link href="/">
                    <ExternalLink />
                    <span>Voir le site</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="company-sidebar__footer">
        <Separator />
        <SidebarMenu>
          <SidebarProfileMenu
            profile={profile}
            onProfileUpdated={onProfileUpdated}
            onLogout={onLogout}
            buttonClassName="company-sidebar__user"
            avatarClassName="company-user-avatar"
            copyClassName="company-sidebar__user-copy"
            displayName={company.nom_commercial}
            avatarSrc={company.logo}
            companyAction={{
              label: "Ma compagnie",
              onClick: () => selectTab("profile"),
            }}
          />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function CompanyWorkspace() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [profileDialog, setProfileDialog] = useState<"view" | "edit" | null>(
    null,
  );
  const [tripDialogOpen, setTripDialogOpen] = useState(false);
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [paymentRange, setPaymentRange] = useState<PaymentRange>("7d");
  const [dashboardNow, setDashboardNow] = useState<number | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripDepartCity, setTripDepartCity] = useState("");
  const [tripArrivalCity, setTripArrivalCity] = useState("");
  const [tripDepartStation, setTripDepartStation] = useState("");
  const [tripArrivalStation, setTripArrivalStation] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [reservations, setReservations] = useState<CompanyReservation[]>([]);
  const [tariffs, setTariffs] = useState<BaggageTariff[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [overviewDataLoading, setOverviewDataLoading] = useState(true);
  const [overviewDataFailed, setOverviewDataFailed] = useState(false);
  const [deferredDataLoading, setDeferredDataLoading] = useState<
    Record<DeferredData, boolean>
  >({ locations: false, tariffs: false, notifications: false });
  const [deferredDataFailed, setDeferredDataFailed] = useState<
    Record<DeferredData, boolean>
  >({ locations: false, tariffs: false, notifications: false });
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [stationToDeactivate, setStationToDeactivate] = useState<Station | null>(null);
  const [editingTariff, setEditingTariff] = useState<BaggageTariff | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [agentToDeactivate, setAgentToDeactivate] = useState<Agent | null>(null);
  const [tariffToDelete, setTariffToDelete] = useState<BaggageTariff | null>(null);
  const [agentPermissions, setAgentPermissions] = useState<Record<string, string[]>>({});
  const loadedDeferredData = useRef(new Set<DeferredData>());
  const pendingDeferredData = useRef(new Map<DeferredData, Promise<void>>());

  const loadOverviewData = useCallback(async (companyId: string) => {
    setOverviewDataLoading(true);
    setOverviewDataFailed(false);
    setError(null);
    try {
      const dashboardData = await requestApi("tableau-de-bord");
      if (!isRecord(dashboardData)) {
        throw new Error("Les données du tableau de bord reçues sont invalides.");
      }
      const loadedAgents = listFrom(dashboardData.agents, isAgent, "agents");
      setTrips(
        listFrom(dashboardData.trips, isTrip, "trips").filter(
          (trip) => trip.compagnie === companyId,
        ),
      );
      setAgents(loadedAgents);
      setReservations(
        listFrom(dashboardData.reservations, isCompanyReservation, "reservations"),
      );
      setPayments(listFrom(dashboardData.payments, isPayment, "payments"));
      setAgentPermissions(
        Object.fromEntries(loadedAgents.map((agent) => [agent.id, agent.permissions])),
      );
    } catch (loadError) {
      console.error("Company overview data loading failed", loadError);
      setOverviewDataFailed(true);
      setError(
        getUserFacingErrorMessage(
          loadError,
          "Impossible de charger les données du tableau de bord. Réessayez dans quelques instants.",
        ),
      );
    } finally {
      setOverviewDataLoading(false);
    }
  }, []);

  const loadDeferredData = useCallback(async (data: DeferredData) => {
    if (loadedDeferredData.current.has(data)) return;
    const pending = pendingDeferredData.current.get(data);
    if (pending) return pending;

    const load = (async () => {
      setDeferredDataLoading((current) => ({ ...current, [data]: true }));
      setDeferredDataFailed((current) => ({ ...current, [data]: false }));
      try {
        if (data === "locations") {
          const [citiesData, stationsData] = await Promise.all([
            getPublicCities(),
            requestApi("stations?page_size=100"),
          ]);
          setCities(citiesData);
          setStations(listFrom(stationsData, isStation, "stations"));
        } else if (data === "tariffs") {
          const tariffsData = await requestApi("bagages/tarifs?page_size=100");
          setTariffs(listFrom(tariffsData, isBaggageTariff, "tariffs"));
        } else {
          const notificationsData = await requestApi("notifications?page_size=100");
          setNotifications(listFrom(notificationsData, isNotification, "notifications"));
        }
        loadedDeferredData.current.add(data);
        setError(null);
      } catch (loadError) {
        console.error("Company workspace data loading failed", loadError);
        setDeferredDataFailed((current) => ({ ...current, [data]: true }));
        setError(
          getUserFacingErrorMessage(
            loadError,
            "Impossible de charger ces informations. Réessayez dans quelques instants.",
          ),
        );
      } finally {
        pendingDeferredData.current.delete(data);
        setDeferredDataLoading((current) => ({ ...current, [data]: false }));
      }
    })();
    pendingDeferredData.current.set(data, load);
    await load;
  }, []);

  const loadWorkspace = useCallback(async (refreshAll = false) => {
    try {
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const sessionBody: unknown = await sessionResponse.json().catch(() => null);
      if (!sessionResponse.ok || !isUserProfile(sessionBody)) {
        setRedirecting(true);
        router.replace("/connexion?next=%2Fespace-compagnie");
        return;
      }
      if (sessionBody.role !== "COMPAGNIE") {
        setRedirecting(true);
        router.replace(
          sessionBody.role === "AGENT_COMPAGNIE"
            ? "/espace-agent"
            : sessionBody.role === "ADMINISTRATEUR"
              ? "/espace-administration"
              : "/espace-voyageur",
        );
        return;
      }
      const companyData = await requestApi("me");
      if (!isCompany(companyData)) {
        throw new Error("Le profil de la compagnie reçu est invalide.");
      }
      setError(null);
      setCompany(companyData);
      setProfile(sessionBody);
      if (!refreshAll) {
        void loadOverviewData(sessionBody.id);
        void loadDeferredData("notifications");
        return;
      }

      const [
        tripsData,
        agentsData,
        reservationsData,
        tariffsData,
        notificationsData,
        paymentsData,
        citiesData,
        stationsData,
      ] = await Promise.all([
        requestApi("voyages?page_size=100"),
        requestApi("agents?page_size=100"),
        requestApi("reservations?page_size=100"),
        requestApi("bagages/tarifs?page_size=100"),
        requestApi("notifications?page_size=100"),
        requestApi("paiements?page_size=100"),
        getPublicCities(),
        requestApi("stations?page_size=100"),
      ]);
      const loadedAgents = listFrom(agentsData, isAgent, "agents");
      setTrips(listFrom(tripsData, isTrip, "trips").filter((trip) => trip.compagnie === sessionBody.id));
      setStations(listFrom(stationsData, isStation, "stations"));
      setAgents(loadedAgents);
      setReservations(listFrom(reservationsData, isCompanyReservation, "reservations"));
      setTariffs(listFrom(tariffsData, isBaggageTariff, "tariffs"));
      setNotifications(listFrom(notificationsData, isNotification, "notifications"));
      setPayments(listFrom(paymentsData, isPayment, "payments"));
      setCities(citiesData);
      setAgentPermissions(
        Object.fromEntries(loadedAgents.map((agent) => [agent.id, agent.permissions])),
      );
      setOverviewDataFailed(false);
      setOverviewDataLoading(false);
      loadedDeferredData.current.add("locations");
      loadedDeferredData.current.add("tariffs");
      loadedDeferredData.current.add("notifications");
      setDeferredDataFailed({ locations: false, tariffs: false, notifications: false });
    } catch (loadError) {
      console.error("Company workspace loading failed", loadError);
      setError(
        getUserFacingErrorMessage(
          loadError,
          "Impossible de charger votre espace compagnie. Réessayez dans quelques instants.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [loadDeferredData, loadOverviewData, router]);

  useEffect(() => {
    void Promise.resolve().then(() => loadWorkspace());
  }, [loadWorkspace]);

  useEffect(() => {
    const data = deferredDataForTab(tab);
    if (data) void loadDeferredData(data);
  }, [loadDeferredData, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDashboardNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeTrips = useMemo(
    () =>
      trips
        .filter((trip) => trip.statut === "PUBLIE" && isFuture(trip))
        .sort(compareTripCreationDescending),
    [trips],
  );
  const { pageItems: pageTrips, pagination: tripPagination, resetPage: resetTripsPage } =
    useListPagination([...trips].sort(compareTripCreationDescending));
  const { pageItems: pageAgents, pagination: agentPagination, resetPage: resetAgentsPage } =
    useListPagination([...agents].sort(compareCreationDescending));
  const { pageItems: pageStations, pagination: stationPagination, resetPage: resetStationsPage } =
    useListPagination([...stations].sort(compareCreationDescending));
  const { pageItems: pageReservations, pagination: reservationPagination } =
    useListPagination(reservations);
  const { pageItems: pageTariffs, pagination: tariffPagination } =
    useListPagination([...tariffs].sort(compareCreationDescending));
  const { pageItems: pagePayments, pagination: paymentPagination } =
    useListPagination(payments);
  const { pageItems: pageNotifications, pagination: notificationPagination } =
    useListPagination(notifications);
  const recentReservations = useMemo(
    () =>
      [...reservations]
        .sort(
          (first, second) =>
            new Date(second.date_reservation).getTime() -
            new Date(first.date_reservation).getTime(),
        )
        .slice(0, 5),
    [reservations],
  );
  const unreadNotificationCount = notifications.filter((item) => !item.lue).length;
  const pendingReservationCount = reservations.filter(
    (reservation) => reservation.statut === "EN_ATTENTE_PAIEMENT",
  ).length;
  const activeAgentCount = agents.filter((agent) => agent.is_active).length;
  const paymentBuckets = useMemo(
    () =>
      dashboardNow === null
        ? []
        : getPaymentBuckets(payments, paymentRange, dashboardNow),
    [dashboardNow, payments, paymentRange],
  );
  const maximumBucketPayment = Math.max(
    0,
    ...paymentBuckets.map((bucket) => bucket.amount),
  );
  const rangePaymentTotal = paymentBuckets.reduce(
    (total, bucket) => total + bucket.amount,
    0,
  );
  const rangePaymentCount = paymentBuckets.reduce(
    (total, bucket) => total + bucket.count,
    0,
  );
  const chartMaximum = Math.max(1, maximumBucketPayment);
  const chartPoints = paymentBuckets.map((bucket, index) => {
    const x = 70 + (index * 710) / Math.max(paymentBuckets.length - 1, 1);
    const y = 198 - (bucket.amount / chartMaximum) * 166;
    return { ...bucket, x, y };
  });
  const chartLinePath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const chartAreaPath = chartPoints.length
    ? `${chartLinePath} L ${chartPoints[chartPoints.length - 1].x} 198 L ${chartPoints[0].x} 198 Z`
    : "";

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    setError(null);
  }

  useEffect(() => {
    const publishMobileState = () => {
      window.dispatchEvent(
        new CustomEvent("kinesis:role-mobile-state", {
          detail: {
            role: "COMPAGNIE",
            activeTab: tab,
            operations: ["trips", "reservations"]
              .map((id) => TABS.find((item) => item.id === id))
              .filter((item) => item !== undefined)
              .map(({ id, label }) => ({ id, label })),
            notificationsTabId: "notifications",
            profileTabId: "profile",
            unreadCount: unreadNotificationCount,
          },
        }),
      );
    };
    publishMobileState();
    window.addEventListener(
      "kinesis:role-mobile-state-request",
      publishMobileState,
    );
    return () =>
      window.removeEventListener(
        "kinesis:role-mobile-state-request",
        publishMobileState,
      );
  }, [tab, unreadNotificationCount]);

  useEffect(() => {
    function handleMobileTabRequest(event: Event) {
      const tabId = (event as CustomEvent<string>).detail;
      const item = TABS.find((candidate) => candidate.id === tabId);
      if (item) {
        setTab(item.id);
        setError(null);
      }
    }
    window.addEventListener("kinesis:role-mobile-tab-request", handleMobileTabRequest);
    return () => {
      window.removeEventListener(
        "kinesis:role-mobile-tab-request",
        handleMobileTabRequest,
      );
    };
  }, []);

  useEffect(() => {
    const openProfileView = () => setProfileDialog("view");
    const openProfileEdit = () => setProfileDialog("edit");
    window.addEventListener(
      "kinesis:company-profile-view-request",
      openProfileView,
    );
    window.addEventListener(
      "kinesis:company-profile-edit-request",
      openProfileEdit,
    );
    return () => {
      window.removeEventListener(
        "kinesis:company-profile-view-request",
        openProfileView,
      );
      window.removeEventListener(
        "kinesis:company-profile-edit-request",
        openProfileEdit,
      );
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const requestedTab = url.searchParams.get("mobileTab");
    if (!requestedTab || !TABS.some((item) => item.id === requestedTab)) return;
    const timerId = window.setTimeout(
      () => {
        window.dispatchEvent(
          new CustomEvent("kinesis:role-mobile-tab-request", {
            detail: requestedTab,
          }),
        );
        url.searchParams.delete("mobileTab");
        window.history.replaceState(window.history.state, "", url);
      },
      0,
    );
    return () => window.clearTimeout(timerId);
  }, []);

  function startTripCreation() {
    setEditingTrip(null);
    setTripDepartCity("");
    setTripArrivalCity("");
    setTripDepartStation("");
    setTripArrivalStation("");
    selectTab("trips");
    setTripDialogOpen(true);
  }

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/deconnexion", { method: "POST" });
      if (!response.ok) throw new Error("La déconnexion n’a pas abouti.");
      window.dispatchEvent(new Event("kinesis:role-mobile-reset"));
      router.push("/");
      router.refresh();
    } catch (logoutError) {
      console.error("Company logout failed", logoutError);
      toast.error(
        getUserFacingErrorMessage(logoutError, "Impossible de fermer la session."),
      );
    }
  }

  async function submitTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      ville_depart: String(formData.get("ville_depart") ?? editingTrip?.ville_depart ?? ""),
      ville_arrivee: String(formData.get("ville_arrivee") ?? editingTrip?.ville_arrivee ?? ""),
      ...(String(formData.get("gare_depart_id") ?? "")
        ? { gare_depart_id: String(formData.get("gare_depart_id")) }
        : {}),
      ...(String(formData.get("gare_arrivee_id") ?? "")
        ? { gare_arrivee_id: String(formData.get("gare_arrivee_id")) }
        : {}),
      date_depart: String(formData.get("date_depart") ?? editingTrip?.date_depart ?? ""),
      heure_depart: String(formData.get("heure_depart") ?? editingTrip?.heure_depart ?? ""),
      place_totale: Number(formData.get("place_totale") ?? editingTrip?.place_totale),
      prix: Number(formData.get("prix") ?? editingTrip?.prix),
      statut: String(formData.get("statut") ?? editingTrip?.statut ?? "PUBLIE"),
    };
    const image = formData.get("image");
    const requestPayload: FormData | typeof payload =
      image instanceof File && image.size > 0
        ? (() => {
            const multipart = new FormData();
            Object.entries(payload).forEach(([key, value]) => {
              multipart.append(key, String(value));
            });
            multipart.append("image", image);
            return multipart;
          })()
        : payload;
    setSaving(true);
    setError(null);
    try {
      const savedTrip = await requestApi(
        editingTrip ? `voyages/${editingTrip.id_voyage}` : "voyages",
        editingTrip ? "PATCH" : "POST",
        requestPayload,
      );
      if (isTrip(savedTrip)) {
        setTrips((current) =>
          editingTrip
            ? current
                .map((trip) =>
                  trip.id_voyage === savedTrip.id_voyage ? savedTrip : trip,
                )
                .sort(compareTripCreationDescending)
            : [savedTrip, ...current.filter(
                (trip) => trip.id_voyage !== savedTrip.id_voyage,
              )].sort(compareTripCreationDescending),
        );
      } else {
        console.error("Saved trip response did not match the expected format.");
        void requestApi("voyages?page_size=100")
          .then((data) => setTrips(listFrom(data, isTrip, "trips")))
          .catch((refreshError: unknown) => {
            console.error("Could not refresh trips after saving", refreshError);
            toast.error("Trajet enregistré, mais la liste n’a pas pu être actualisée.");
          });
      }
      resetTripsPage();
      setEditingTrip(null);
      setTripDepartCity("");
      setTripArrivalCity("");
      setTripDepartStation("");
      setTripArrivalStation("");
      form.reset();
      setTripDialogOpen(false);
      toast.success(editingTrip ? "Le trajet a été mis à jour." : "Le trajet a été publié.");
    } catch (saveError) {
      toast.error(
        getUserFacingErrorMessage(
          saveError,
          "Impossible d’enregistrer le trajet. Vérifiez les informations puis réessayez.",
        ),
      );
    } finally {
      setSaving(false);
    }

  }

  async function submitStation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const numberOrNull = (value: FormDataEntryValue | null) =>
      typeof value === "string" && value !== "" ? value : null;
    const payload = {
      ville: String(formData.get("ville") ?? ""),
      nom: String(formData.get("nom") ?? "").trim(),
      adresse: String(formData.get("adresse") ?? "").trim(),
      latitude: numberOrNull(formData.get("latitude")),
      longitude: numberOrNull(formData.get("longitude")),
      google_place_id: String(formData.get("google_place_id") ?? ""),
      maps_url: String(formData.get("maps_url") ?? ""),
    };
    setSaving(true);
    setError(null);
    try {
      const savedStation = await requestApi("stations", "POST", payload);
      if (isStation(savedStation)) {
        setStations((current) => [
          savedStation,
          ...current.filter((station) => station.id_gare !== savedStation.id_gare),
        ]);
      } else {
        console.error("Saved station response did not match the expected format.");
        void requestApi("stations?page_size=100")
          .then((data) => setStations(listFrom(data, isStation, "stations")))
          .catch((refreshError: unknown) => {
            console.error("Could not refresh stations after saving", refreshError);
            toast.error("Gare ajoutée, mais la liste n’a pas pu être actualisée.");
          });
      }
      form.reset();
      resetStationsPage();
      setStationDialogOpen(false);
      toast.success("La gare a été ajoutée.");
    } catch (saveError) {
      toast.error(
        getUserFacingErrorMessage(
          saveError,
          "Impossible d’ajouter la gare. Vérifiez les informations puis réessayez.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStation(station: Station, active: boolean) {
    setSaving(true);
    setError(null);
    try {
      const updatedStation = await requestApi(
        `stations/${station.id_gare}`,
        "PATCH",
        { active },
      );
      if (isStation(updatedStation)) {
        setStations((current) =>
          current.map((item) =>
            item.id_gare === updatedStation.id_gare ? updatedStation : item,
          ),
        );
      } else {
        console.error("Updated station response did not match the expected format.");
        void requestApi("stations?page_size=100")
          .then((data) => setStations(listFrom(data, isStation, "stations")))
          .catch((refreshError: unknown) => {
            console.error("Could not refresh stations after updating", refreshError);
            toast.error("Gare modifiée, mais la liste n’a pas pu être actualisée.");
          });
      }
      toast.success(active ? "La gare est de nouveau active." : "La gare a été désactivée.");
    } catch (saveError) {
      toast.error(getUserFacingErrorMessage(saveError, "Impossible de modifier la gare."));
    } finally {
      setSaving(false);
      setStationToDeactivate(null);
    }
  }

  async function updateTripStatus(trip: Trip, status: string) {
    setSaving(true);
    setError(null);
    try {
      const updatedTrip = await requestApi(
        `voyages/${trip.id_voyage}`,
        "PATCH",
        { statut: status },
      );
      if (isTrip(updatedTrip)) {
        setTrips((current) =>
          current
            .map((item) =>
              item.id_voyage === updatedTrip.id_voyage ? updatedTrip : item,
            )
            .sort(compareTripCreationDescending),
        );
      } else {
        console.error("Updated trip response did not match the expected format.");
        void requestApi("voyages?page_size=100")
          .then((data) => setTrips(listFrom(data, isTrip, "trips")))
          .catch((refreshError: unknown) => {
            console.error("Could not refresh trips after updating", refreshError);
            toast.error("Trajet modifié, mais la liste n’a pas pu être actualisée.");
          });
      }
      toast.success(`Le trajet est maintenant « ${statusLabel(status)} ».`);
    } catch (saveError) {
      toast.error(getUserFacingErrorMessage(saveError, "Impossible de modifier le statut du trajet."));
    } finally {
      setSaving(false);
    }
  }

  async function submitAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      email: String(formData.get("email") ?? ""),
      nom: String(formData.get("nom") ?? ""),
      prenoms: String(formData.get("prenoms") ?? ""),
      telephone: String(formData.get("telephone") ?? ""),
      permissions: PERMISSIONS.map(([code]) => code).filter((code) =>
        formData.has(`permission-${code}`),
      ),
    };
    setSaving(true);
    setError(null);
    try {
      const savedAgent = await requestApi("agents", "POST", payload);
      if (isAgent(savedAgent)) {
        setAgents((current) => [
          savedAgent,
          ...current.filter((agent) => agent.id !== savedAgent.id),
        ]);
        setAgentPermissions((current) => ({
          ...current,
          [savedAgent.id]: savedAgent.permissions,
        }));
      } else {
        console.error("Saved agent response did not match the expected format.");
        void requestApi("agents?page_size=100")
          .then((data) => setAgents(listFrom(data, isAgent, "agents")))
          .catch((refreshError: unknown) => {
            console.error("Could not refresh agents after saving", refreshError);
            toast.error("Agent créé, mais la liste n’a pas pu être actualisée.");
          });
      }
      form.reset();
      resetAgentsPage();
      setAgentDialogOpen(false);
      toast.success("Le compte agent a été créé. Une invitation lui a été envoyée par e-mail.");
    } catch (saveError) {
      toast.error(
        getUserFacingErrorMessage(
          saveError,
          "Impossible de créer l’agent. Vérifiez les informations puis réessayez.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function resendAgentInvitation(agent: Agent) {
    setSaving(true);
    setError(null);
    try {
      await requestApi(`agents/${agent.id}/resend-invitation`, "POST");
      toast.success(`Une nouvelle invitation a été envoyée à ${agent.email}.`);
    } catch (sendError) {
      toast.error(
        getUserFacingErrorMessage(
          sendError,
          "Impossible de renvoyer l’invitation. Réessayez dans quelques instants.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveAgent(agent: Agent, changes: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const updatedAgent = await requestApi(`agents/${agent.id}`, "PATCH", changes);
      if (isAgent(updatedAgent)) {
        setAgents((current) =>
          current.map((item) => item.id === updatedAgent.id ? updatedAgent : item),
        );
        setAgentPermissions((current) => ({
          ...current,
          [updatedAgent.id]: updatedAgent.permissions,
        }));
      } else {
        console.error("Updated agent response did not match the expected format.");
        setAgents((current) =>
          current.map((item) =>
            item.id === agent.id ? { ...item, ...changes } : item,
          ),
        );
        if (Array.isArray(changes.permissions)) {
          const permissions = changes.permissions.filter(
            (permission): permission is string => typeof permission === "string",
          );
          if (permissions.length === changes.permissions.length) {
            setAgentPermissions((current) => ({
              ...current,
              [agent.id]: permissions,
            }));
          }
        }
      }
      toast.success(`Le compte de ${agent.prenoms} ${agent.nom} a été mis à jour.`);
      return true;
    } catch (saveError) {
      toast.error(getUserFacingErrorMessage(saveError, "Impossible de mettre à jour l’agent."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent(agent: Agent) {
    setSaving(true);
    setError(null);
    try {
      await requestApi(`agents/${agent.id}`, "DELETE");
      setAgentToDelete(null);
      setAgents((current) => current.filter((item) => item.id !== agent.id));
      setAgentPermissions((current) => {
        const next = { ...current };
        delete next[agent.id];
        return next;
      });
      toast.success(`${agent.prenoms} ${agent.nom} a été retiré de votre équipe.`);
    } catch (deleteError) {
      toast.error(getUserFacingErrorMessage(deleteError, "Impossible de supprimer cet agent."));
    } finally {
      setSaving(false);
    }
  }

  async function submitTariff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    setError(null);
    try {
      const savedTariff = await requestApi(
        editingTariff ? `bagages/tarifs/${editingTariff.id_tarif}` : "bagages/tarifs",
        editingTariff ? "PATCH" : "POST",
        {
          poids_min: Number(formData.get("poids_min")),
          poids_max: Number(formData.get("poids_max")),
          prix: Number(formData.get("prix")),
        },
      );
      if (isBaggageTariff(savedTariff)) {
        setTariffs((current) =>
          editingTariff
            ? current
                .map((tariff) =>
                  tariff.id_tarif === savedTariff.id_tarif ? savedTariff : tariff,
                )
                .sort(compareCreationDescending)
            : [savedTariff, ...current.filter(
                (tariff) => tariff.id_tarif !== savedTariff.id_tarif,
              )].sort(compareCreationDescending),
        );
      } else {
        console.error("Saved tariff response did not match the expected format.");
        void requestApi("bagages/tarifs?page_size=100")
          .then((data) => setTariffs(listFrom(data, isBaggageTariff, "tariffs")))
          .catch((refreshError: unknown) => {
            console.error("Could not refresh tariffs after saving", refreshError);
            toast.error("Tarif enregistré, mais la liste n’a pas pu être actualisée.");
          });
      }
      setEditingTariff(null);
      form.reset();
      toast.success(editingTariff ? "Le tarif bagage a été mis à jour." : "Le tarif bagage a été ajouté.");
    } catch (saveError) {
      toast.error(getUserFacingErrorMessage(saveError, "Impossible d’enregistrer le tarif bagage."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteTariff(tariff: BaggageTariff) {
    setSaving(true);
    setError(null);
    try {
      await requestApi(`bagages/tarifs/${tariff.id_tarif}`, "DELETE");
      setTariffToDelete(null);
      setTariffs((current) =>
        current.filter((item) => item.id_tarif !== tariff.id_tarif),
      );
      toast.success("Le tarif bagage a été supprimé.");
    } catch (deleteError) {
      toast.error(getUserFacingErrorMessage(deleteError, "Impossible de supprimer ce tarif bagage."));
    } finally {
      setSaving(false);
    }
  }

  async function markNotificationRead(notification: Notification) {
    if (notification.lue) return;
    setSaving(true);
    setError(null);
    try {
      await requestApi(
        `notifications/${notification.id_notification}/lire`,
        "POST",
      );
      setNotifications((current) =>
        current.map((item) =>
          item.id_notification === notification.id_notification
            ? { ...item, lue: true }
            : item,
        ),
      );
    } catch (readError) {
      setError(
        getUserFacingErrorMessage(
          readError,
          "Impossible de marquer cette notification comme lue.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function markAllNotificationsRead() {
    setSaving(true);
    setError(null);
    try {
      await requestApi("notifications/lire-tout", "POST");
      setNotifications((current) => current.map((item) => ({ ...item, lue: true })));
    } catch (readError) {
      setError(
        getUserFacingErrorMessage(
          readError,
          "Impossible de mettre à jour les notifications.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitCompanyProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.delete("logo");
    const logoField = form.elements.namedItem("logo");
    const logo =
      logoField instanceof HTMLInputElement ? logoField.files?.[0] : undefined;
    if (logo) formData.append("logo", logo);
    setSaving(true);
    setError(null);
    try {
      const updated = await requestApi("me", "PATCH", formData);
      if (!isCompany(updated)) throw new Error("Le profil reçu après modification est invalide.");
      setCompany(updated);
      toast.success("Les informations de votre compagnie ont été enregistrées.");
    } catch (saveError) {
      toast.error(getUserFacingErrorMessage(saveError, "Impossible d’enregistrer le profil."));
    } finally {
      setSaving(false);
    }
  }

  if (loading || redirecting) {
    return <KinesisLoader message="Chargement de votre espace compagnie…" />;
  }

  if (!company || !profile) {
    return (
      <main className="company-loading">
        <section className="company-error-card">
          <h1>Votre espace n’est pas disponible</h1>
          <p>{error ?? "Vérifiez votre connexion puis réessayez."}</p>
          <button type="button" className="company-button" onClick={() => void loadWorkspace()}>
            Réessayer
          </button>
          <Link href="/connexion">Retour à la connexion</Link>
        </section>
      </main>
    );
  }

  const confirmedPaymentAmount = payments
    .filter((payment) => payment.statut === "CONFIRME")
    .reduce((total, payment) => total + Number(payment.montant), 0);
  const editingTripHasActiveReservations = Boolean(
    editingTrip && editingTrip.places_disponibles < editingTrip.place_totale,
  );
  const editingTripHasDeparted = Boolean(editingTrip?.date_depart_effective);
  const editingTripFieldsLocked =
    editingTripHasActiveReservations || editingTripHasDeparted;
  const activeDeferredData = deferredDataForTab(tab);
  const activeTabNeedsOverviewData =
    tab === "overview" ||
    tab === "trips" ||
    tab === "agents" ||
    tab === "reservations" ||
    tab === "payments";
  const activeTabDataLoading =
    (activeTabNeedsOverviewData && overviewDataLoading) ||
    Boolean(activeDeferredData && deferredDataLoading[activeDeferredData]);
  const activeTabDataFailed =
    (activeTabNeedsOverviewData && overviewDataFailed) ||
    Boolean(activeDeferredData && deferredDataFailed[activeDeferredData]);

  return (
    <TooltipProvider>
      <SidebarProvider
        className="company-app"
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "3.5rem",
          } as React.CSSProperties
        }
      >
        <CompanySidebar
          company={company}
          profile={profile}
          tab={tab}
          onSelect={selectTab}
          onCreateTrip={startTripCreation}
          onLogout={() => void handleLogout()}
          onProfileUpdated={setProfile}
          tripCount={trips.length}
          unreadCount={unreadNotificationCount}
        />
        <SidebarInset className="company-main">
          <header className="company-topbar">
            <div className="company-topbar__title">
              <SidebarTrigger
                className="company-sidebar-trigger"
                aria-label="Afficher ou réduire le menu"
              />
              <Separator orientation="vertical" className="company-topbar__separator" />
              <div>
                <p className="company-eyebrow">ESPACE COMPAGNIE</p>
                <h1>{TABS.find((item) => item.id === tab)?.label}</h1>
              </div>
            </div>
            <div className="company-user-summary">
              <button
                type="button"
                className="company-notifications-button"
                aria-label={`Notifications, ${unreadNotificationCount} non lue(s)`}
                title="Notifications"
                onClick={() => selectTab("notifications")}
              >
                <Bell aria-hidden="true" />
                {unreadNotificationCount > 0 ? (
                  <span className="company-notifications-badge" aria-hidden="true">
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="company-logout-button"
                aria-label="Se déconnecter"
                title="Se déconnecter"
                onClick={() => void handleLogout()}
              >
                <LogOut aria-hidden="true" />
              </button>
            </div>
          </header>

          <main className="company-main-content">

        {error ? <p className="company-alert company-alert--error" role="alert">{error}</p> : null}

        {tab === "overview" ? (
          <div className="company-content">
            <section className="company-welcome-card">
              <div>
                <p className="company-eyebrow">{getTimeGreeting()}, {company.nom_commercial.toUpperCase()}</p>
                <h2>Le point sur votre activité.</h2>
                <p>Retrouvez vos départs, réservations et paiements au même endroit.</p>
                <button type="button" className="company-button" onClick={startTripCreation}>
                  Publier un trajet <Plus aria-hidden="true" size={16} />
                </button>
              </div>
            </section>
            {overviewDataLoading ? (
              <p className="company-empty" role="status">Chargement des indicateurs de votre activité…</p>
            ) : overviewDataFailed ? (
              <p className="company-alert company-alert--error" role="alert">
                Les indicateurs n’ont pas pu être chargés.{" "}
                <button type="button" className="company-text-button" onClick={() => void loadOverviewData(profile.id)}>
                  Réessayer
                </button>
              </p>
            ) : (
              <>
            <div className="company-stat-grid">
              <article className="company-stat-card">
                <span className="company-stat-card__icon"><BusFront aria-hidden="true" /></span>
                <span>Départs à venir</span>
                <strong>{activeTrips.length}</strong>
                <small>Trajets publiés</small>
              </article>
              <article className="company-stat-card">
                <span className="company-stat-card__icon company-stat-card__icon--amber"><TicketCheck aria-hidden="true" /></span>
                <span>Réservations à suivre</span>
                <strong>{pendingReservationCount}</strong>
                <small>En attente de paiement</small>
              </article>
              <article className="company-stat-card">
                <span className="company-stat-card__icon company-stat-card__icon--blue"><UsersRound aria-hidden="true" /></span>
                <span>Agents actifs</span>
                <strong>{activeAgentCount}</strong>
                <small>Sur {agents.length} compte(s) d’équipe</small>
              </article>
              <article className="company-stat-card">
                <span className="company-stat-card__icon company-stat-card__icon--gold"><CreditCard aria-hidden="true" /></span>
                <span>Montant payé</span>
                <strong>{formatPrice(confirmedPaymentAmount)}</strong>
                <small>{payments.filter((payment) => payment.statut === "CONFIRME").length} paiement(s) confirmé(s)</small>
              </article>
            </div>
            <section className="company-panel company-payment-chart-panel">
              <div className="company-panel-heading company-payment-chart-heading">
                <div>
                  <h2><ChartNoAxesCombined aria-hidden="true" /> Évolution des paiements</h2>
                  <p>{formatPrice(rangePaymentTotal)} · {rangePaymentCount} paiement(s) confirmé(s)</p>
                </div>
                <div className="company-payment-range-switch" aria-label="Période du graphique">
                  {PAYMENT_RANGES.map((range) => (
                    <button
                      type="button"
                      key={range.id}
                      aria-pressed={paymentRange === range.id}
                      onClick={() => setPaymentRange(range.id)}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>
              {rangePaymentCount > 0 ? (
                <svg
                  className="company-payment-chart"
                  viewBox="0 0 820 250"
                  role="img"
                  aria-label={`Montants des paiements confirmés sur ${PAYMENT_RANGES.find((range) => range.id === paymentRange)?.label}`}
                >
                  <defs>
                    <linearGradient id="company-payment-area" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#27835f" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#27835f" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  {[32, 115, 198].map((y, index) => (
                    <g key={y}>
                      <line className="company-payment-chart__grid" x1="70" x2="790" y1={y} y2={y} />
                      <text className="company-payment-chart__axis-label" x="58" y={y + 4} textAnchor="end">
                        {new Intl.NumberFormat("fr-FR", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format((chartMaximum * (2 - index)) / 2)}
                      </text>
                    </g>
                  ))}
                  {chartAreaPath ? <path className="company-payment-chart__area" d={chartAreaPath} /> : null}
                  {chartLinePath ? <path className="company-payment-chart__line" d={chartLinePath} /> : null}
                  {chartPoints.map((point) => (
                    <g key={point.label}>
                      <circle className="company-payment-chart__point-halo" cx={point.x} cy={point.y} r="7" />
                      <circle className="company-payment-chart__point" cx={point.x} cy={point.y} r="3.5">
                        <title>{`${point.label} : ${formatPrice(point.amount)} (${point.count} paiement(s))`}</title>
                      </circle>
                      <text className="company-payment-chart__date" x={point.x} y="229" textAnchor="middle">
                        {point.label}
                      </text>
                    </g>
                  ))}
                </svg>
              ) : (
                <p className="company-empty">Aucun paiement confirmé sur cette période.</p>
              )}
            </section>
            <div className="company-content--split company-dashboard-lower">
              <section className="company-panel company-dashboard-table-panel">
                <div className="company-panel-heading">
                  <div><h2>Dernières réservations</h2><p>Les cinq réservations les plus récentes</p></div>
                  <button type="button" className="company-text-button" onClick={() => selectTab("reservations")}>Tout voir <ChevronRight aria-hidden="true" size={15} /></button>
                </div>
                {recentReservations.length ? (
                  <div className="company-table-wrap">
                    <table className="company-table">
                      <thead>
                        <tr><th>Voyage</th><th>Départ</th><th>Passagers</th><th>Statut</th><th>Montant</th></tr>
                      </thead>
                      <tbody>
                        {recentReservations.map((reservation) => (
                          <tr key={reservation.id_reservation}>
                            <td>
                              <strong>{reservation.voyage.ville_depart_nom} → {reservation.voyage.ville_arrivee_nom}</strong>
                              <small>{reservation.reference}</small>
                            </td>
                            <td>{formatDate(reservation.voyage.date_depart)} · {reservation.voyage.heure_depart.slice(0, 5)}</td>
                            <td>{reservation.places.length}</td>
                            <td><span className={`company-status company-status--${reservation.statut.toLowerCase()}`}>{statusLabel(reservation.statut)}</span></td>
                            <td>{formatPrice(reservation.montant_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="company-empty">Les réservations de vos voyages apparaîtront ici.</p>
                )}
              </section>
              <section className="company-panel">
                <div className="company-panel-heading">
                  <div><h2>Prochains départs</h2><p>Vos voyages publiés les plus proches</p></div>
                  <button type="button" className="company-text-button" onClick={() => selectTab("trips")}>Tout voir <ChevronRight aria-hidden="true" size={15} /></button>
                </div>
                {activeTrips.length ? (
                  <div className="company-trip-list">
                    {activeTrips.slice(0, 4).map((trip) => <TripRow key={trip.id_voyage} trip={trip} />)}
                  </div>
                ) : <p className="company-empty">Aucun départ publié à venir. Créez votre premier trajet.</p>}
              </section>
            </div>
              </>
            )}
          </div>
        ) : null}

        {tab !== "overview" && activeTabDataLoading ? (
          <p className="company-empty" role="status">Chargement des données de cet espace…</p>
        ) : null}
        {tab !== "overview" && activeTabDataFailed ? (
          <p className="company-alert company-alert--error" role="alert">
            Ces données n’ont pas pu être chargées.{" "}
            <button
              type="button"
              className="company-text-button"
              onClick={() => {
                if (activeDeferredData) {
                  void loadDeferredData(activeDeferredData);
                } else {
                  void loadOverviewData(profile.id);
                }
              }}
            >
              Réessayer
            </button>
          </p>
        ) : null}

        {tab === "stations" && !activeTabDataLoading && !activeTabDataFailed ? (
          <div className="company-content">
            <AppDialog
              open={stationDialogOpen}
              title="Ajouter une gare"
              onClose={() => setStationDialogOpen(false)}
              className="company-form-dialog"
            >
              <section className="company-panel">
              <p className="company-form-dialog__description">Chaque gare est associée à une ville officielle. Google Maps peut proposer son adresse et sa localisation.</p>
              <form className="company-form" onSubmit={submitStation}>
                <label>
                  <span>Ville</span>
                  <select name="ville" required defaultValue="">
                    <option value="" disabled>Choisir une ville</option>
                    {cities.map((city) => (
                      <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Nom de la gare</span>
                  <input name="nom" maxLength={150} required placeholder="Ex. Gare routière centrale" />
                </label>
                <StationLocationInput />
                <button type="submit" className="company-button" disabled={saving || !cities.length}>
                  {saving ? "Enregistrement…" : "Ajouter la gare"}
                </button>
              </form>
              </section>
            </AppDialog>
            <section className="company-panel company-panel--list">
              <div className="company-panel-heading">
                <div><h2>Vos gares</h2><p>Du plus récent au plus ancien · {stations.length} gare(s)</p></div>
                <button type="button" className="company-button" onClick={() => setStationDialogOpen(true)}>
                  Ajouter une gare <Plus aria-hidden="true" size={16} />
                </button>
              </div>
              {stations.length ? (
                <div className="company-station-list">
                  {pageStations.map((station) => (
                    <article className="company-station-row" key={station.id_gare}>
                      <div>
                        <strong>{station.nom}</strong>
                        <span>{station.ville_nom} · {station.adresse}</span>
                        <span className={`company-status company-status--${station.active ? "active" : "disabled"}`}>
                          {station.active ? "Active" : "Désactivée"}
                        </span>
                      </div>
                      <div className="company-row-actions">
                        {station.maps_url ? (
                          <a className="maps-link maps-link--compact" href={station.maps_url} target="_blank" rel="noreferrer">
                            <MapPin aria-hidden="true" />
                            <span>Google Maps</span>
                            <ExternalLink aria-hidden="true" />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => station.active
                            ? setStationToDeactivate(station)
                            : void toggleStation(station, true)}
                        >
                          {station.active ? "Désactiver" : "Réactiver"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="company-empty">Aucune gare pour le moment. Ajoutez vos lieux de départ et d’arrivée.</p>
              )}
              {stationPagination}
            </section>
          </div>
        ) : null}

        {tab === "trips" && !activeTabDataLoading && !activeTabDataFailed ? (
          <div className="company-content">
            <AppDialog
              open={tripDialogOpen}
              title={editingTrip ? "Modifier un trajet" : "Publier un trajet"}
              onClose={() => setTripDialogOpen(false)}
              className="company-form-dialog"
            >
              <section className="company-panel">
              <p className="company-form-dialog__description">
                {editingTripHasActiveReservations && !editingTripHasDeparted
                  ? "Les modifications sont bloquées tant que des réservations actives sont liées à ce trajet."
                  : editingTripHasDeparted
                    ? "Le départ a été enregistré. Seul l’archivage du trajet est possible."
                    : "Les places disponibles sont calculées par l’API."}
              </p>
              <form className="company-form" onSubmit={submitTrip} key={editingTrip?.id_voyage ?? "new-trip"}>
                <label><span>Ville de départ</span><select name="ville_depart" required disabled={editingTripFieldsLocked} value={tripDepartCity} onChange={(event) => { setTripDepartCity(event.target.value); setTripDepartStation(""); }}><option value="" disabled>Choisir une ville</option>{cities.map((city) => <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>)}</select></label>
                <label><span>Gare de départ</span><select name="gare_depart_id" required={!editingTrip} disabled={editingTripFieldsLocked || !tripDepartCity} value={tripDepartStation} onChange={(event) => setTripDepartStation(event.target.value)}><option value="" disabled>Choisir une gare</option>{stations.filter((station) => station.ville === tripDepartCity && (station.active || station.id_gare === editingTrip?.gare_depart?.id_gare)).map((station) => <option key={station.id_gare} value={station.id_gare}>{station.nom} — {station.adresse}</option>)}</select></label>
                <label><span>Ville d’arrivée</span><select name="ville_arrivee" required disabled={editingTripFieldsLocked} value={tripArrivalCity} onChange={(event) => { setTripArrivalCity(event.target.value); setTripArrivalStation(""); }}><option value="" disabled>Choisir une ville</option>{cities.map((city) => <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>)}</select></label>
                <label><span>Gare d’arrivée</span><select name="gare_arrivee_id" required={!editingTrip} disabled={editingTripFieldsLocked || !tripArrivalCity} value={tripArrivalStation} onChange={(event) => setTripArrivalStation(event.target.value)}><option value="" disabled>Choisir une gare</option>{stations.filter((station) => station.ville === tripArrivalCity && (station.active || station.id_gare === editingTrip?.gare_arrivee?.id_gare)).map((station) => <option key={station.id_gare} value={station.id_gare}>{station.nom} — {station.adresse}</option>)}</select></label>
                <div className="company-form-grid">
                  <label><span>Date de départ</span><input name="date_depart" type="date" required disabled={editingTripFieldsLocked} min={new Date().toISOString().slice(0, 10)} defaultValue={editingTrip?.date_depart ?? ""} /></label>
                  <label><span>Heure de départ</span><input name="heure_depart" type="time" step="60" required disabled={editingTripFieldsLocked} defaultValue={editingTrip?.heure_depart ?? ""} /></label>
                  <label><span>Nombre de places</span><input name="place_totale" type="number" min="1" required disabled={editingTripFieldsLocked} defaultValue={editingTrip?.place_totale ?? "30"} /></label>
                  <label><span>Prix par place (FCFA)</span><input name="prix" type="number" min="0" step="1" required disabled={editingTripFieldsLocked} defaultValue={editingTrip?.prix ?? ""} /></label>
                </div>
                {editingTrip?.image ? (
                  <div className="company-trip-image-preview">
                    <span>Image actuelle</span>
                    <Image
                      src={editingTrip.image}
                      alt={`Image du trajet ${editingTrip.ville_depart_nom} vers ${editingTrip.ville_arrivee_nom}`}
                      width={320}
                      height={180}
                    />
                  </div>
                ) : null}
                <label>
                  <span>Image du trajet <small>{editingTrip?.image ? "(facultatif, remplace l’image actuelle)" : "(facultatif)"}</small></span>
                  <input name="image" type="file" accept="image/*" disabled={editingTripFieldsLocked} />
                </label>
                {editingTrip ? <label><span>Statut</span><select name="statut" disabled={editingTripHasActiveReservations && !editingTripHasDeparted} defaultValue={editingTripHasDeparted ? "ARCHIVE" : editingTrip.statut}>{editingTripHasDeparted ? <option value="ARCHIVE">Archivé</option> : <><option value="PUBLIE">Publié</option><option value="ANNULEE">Annulé</option><option value="ARCHIVE">Archivé</option></>}</select></label> : null}
                <div className="company-form-actions">
                  <button type="submit" className="company-button" disabled={saving || (editingTripHasActiveReservations && !editingTripHasDeparted)}>{saving ? "Enregistrement…" : editingTripHasDeparted ? "Archiver le trajet" : editingTrip ? "Enregistrer" : "Publier le trajet"}</button>
                  {editingTrip ? <button type="button" className="company-cancel-button" onClick={() => { setEditingTrip(null); setTripDepartCity(""); setTripArrivalCity(""); setTripDepartStation(""); setTripArrivalStation(""); setTripDialogOpen(false); }}>Annuler</button> : null}
                </div>
              </form>
              </section>
            </AppDialog>
            <section className="company-panel company-panel--list">
              <div className="company-panel-heading">
                <div><h2>Vos trajets</h2><p>Du plus récent au plus ancien · {trips.length} trajet(s)</p></div>
                <button type="button" className="company-button" onClick={startTripCreation}>
                  Publier un trajet <Plus aria-hidden="true" size={16} />
                </button>
              </div>
              {trips.length ? (
                <div className="company-trip-list">{pageTrips.map((trip) => (
                  <article className="company-trip-row" key={trip.id_voyage}>
                    <TripRow trip={trip} />
                    <div className="company-row-actions">
                      <button
                        type="button"
                        disabled={saving || (trip.places_disponibles < trip.place_totale && !trip.date_depart_effective)}
                        onClick={() => {
                          setEditingTrip(trip);
                          setTripDepartCity(trip.ville_depart);
                          setTripArrivalCity(trip.ville_arrivee);
                          setTripDepartStation(trip.gare_depart?.id_gare ?? "");
                          setTripArrivalStation(trip.gare_arrivee?.id_gare ?? "");
                          setTripDialogOpen(true);
                        }}
                      >
                        {trip.date_depart_effective ? "Archiver" : "Modifier"}
                      </button>
                      {trip.statut === "PUBLIE" && isFuture(trip) ? (
                        <button
                          type="button"
                          className="is-danger"
                          disabled={saving || trip.places_disponibles < trip.place_totale}
                          onClick={() => void updateTripStatus(trip, "ANNULEE")}
                        >
                          Annuler
                        </button>
                      ) : null}
                      {trip.places_disponibles < trip.place_totale && !trip.date_depart_effective ? (
                        <p className="company-trip-lock-note">
                          Réservation active : modification, annulation et archivage bloqués.
                        </p>
                      ) : null}
                    </div>
                  </article>
                ))}</div>
              ) : <p className="company-empty">Aucun trajet publié pour le moment.</p>}
              {tripPagination}
            </section>
          </div>
        ) : null}

        {tab === "agents" && !activeTabDataLoading && !activeTabDataFailed ? (
          <div className="company-content">
            <AppDialog
              open={agentDialogOpen}
              title="Ajouter un agent"
              onClose={() => setAgentDialogOpen(false)}
              className="company-form-dialog"
            >
              <section className="company-panel">
              <p className="company-form-dialog__description">Un e-mail lui permettra de choisir son mot de passe et d’activer son compte.</p>
              <form className="company-form" onSubmit={submitAgent}>
                <label><span>Adresse e-mail</span><input name="email" type="email" required /></label>
                <div className="company-form-grid">
                  <label><span>Nom</span><input name="nom" required maxLength={100} /></label>
                  <label><span>Prénoms</span><input name="prenoms" maxLength={150} /></label>
                </div>
                <label><span>Téléphone</span><input name="telephone" type="tel" maxLength={30} /></label>
                <fieldset className="company-permissions"><legend>Autorisations</legend>{PERMISSIONS.map(([code, label]) => <label key={code}><input type="checkbox" name={`permission-${code}`} value={code} /><span>{label}</span></label>)}</fieldset>
                <button type="submit" className="company-button" disabled={saving}>{saving ? "Création…" : "Créer et envoyer l’invitation"}</button>
              </form>
              </section>
            </AppDialog>
            <section className="company-panel company-panel--list">
              <div className="company-panel-heading">
                <div><h2>Votre équipe</h2><p>Du plus récent au plus ancien · {agents.length} agent(s)</p></div>
                <button type="button" className="company-button" onClick={() => setAgentDialogOpen(true)}>
                  Ajouter un agent <Plus aria-hidden="true" size={16} />
                </button>
              </div>
              {agents.length ? <div className="company-agent-list">{pageAgents.map((agent) => (
                <article className="company-agent-card" key={agent.id}>
                  <div className="company-agent-heading"><ProfileAvatar className="company-agent-avatar" src={agent.photo_profil} name={[agent.prenoms, agent.nom].filter(Boolean).join(" ")} size={36} /><div><strong>{agent.prenoms} {agent.nom}</strong><span>{agent.email}</span></div><span className={`company-status ${agent.is_active ? "company-status--active" : "company-status--disabled"}`}>{agent.invitation_en_attente ? "Invitation en attente" : agent.is_active ? "Actif" : "Désactivé"}</span></div>
                  {agent.telephone ? <p className="company-agent-phone">{agent.telephone}</p> : null}
                  <fieldset className="company-permissions company-permissions--compact"><legend>Permissions</legend>{PERMISSIONS.map(([code, label]) => <label key={code}><input type="checkbox" checked={(agentPermissions[agent.id] ?? []).includes(code)} onChange={(event) => setAgentPermissions((current) => ({...current, [agent.id]: event.target.checked ? [...(current[agent.id] ?? []), code] : (current[agent.id] ?? []).filter((item) => item !== code)}))} /><span>{label}</span></label>)}</fieldset>
                  <div className="company-row-actions">
                    <button type="button" disabled={saving} onClick={() => void saveAgent(agent, { permissions: agentPermissions[agent.id] ?? [] })}>Enregistrer les permissions</button>
                    {agent.invitation_en_attente ? <button type="button" disabled={saving} onClick={() => void resendAgentInvitation(agent)}>Renvoyer l’invitation</button> : <button type="button" className={agent.is_active ? "is-danger" : ""} disabled={saving} onClick={() => agent.is_active ? setAgentToDeactivate(agent) : void saveAgent(agent, { is_active: true })}>{agent.is_active ? "Désactiver" : "Réactiver"}</button>}
                    <button type="button" className="is-danger" disabled={saving} onClick={() => setAgentToDelete(agent)}>Retirer de l’équipe</button>
                  </div>
                </article>
              ))}</div> : <p className="company-empty">Aucun agent pour le moment.</p>}
              {agentPagination}
            </section>
          </div>
        ) : null}

        {tab === "reservations" && !activeTabDataLoading && !activeTabDataFailed ? (
          <div className="company-content">
            <section className="company-panel">
              <div className="company-panel-heading">
                <div><h2>Réservations de vos trajets</h2><p>{reservations.length} réservation(s), tous statuts confondus.</p></div>
              </div>
              {reservations.length ? (
                <div className="company-reservation-list">
                  {pageReservations.map((reservation) => (
                    <article className="company-reservation-card" key={reservation.id_reservation}>
                      <div className="company-reservation-heading">
                        <div>
                          <strong>{reservation.voyage.ville_depart_nom} → {reservation.voyage.ville_arrivee_nom}</strong>
                          <span>Réf. {reservation.reference}</span>
                        </div>
                        <span className={`company-status company-status--${reservation.statut.toLowerCase()}`}>
                          {statusLabel(reservation.statut)}
                        </span>
                      </div>
                      <div className="company-reservation-meta">
                        <span>Départ : {formatDate(reservation.voyage.date_depart)} · {reservation.voyage.heure_depart.slice(0, 5)}</span>
                        <span>{reservation.places.length} place(s) · {formatPrice(reservation.montant_total)}</span>
                        <span>Réservée le {formatDate(reservation.date_reservation.slice(0, 10))}</span>
                      </div>
                      <ul className="company-reservation-passengers">
                        {reservation.places.map((place) => (
                          <li key={place.numero_siege}>{place.nom_passager} · Siège {place.numero_siege}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              ) : <p className="company-empty">Aucune réservation n’est encore liée à vos trajets.</p>}
              {reservationPagination}
            </section>
          </div>
        ) : null}

        {tab === "tariffs" && !activeTabDataLoading && !activeTabDataFailed ? (
          <div className="company-content company-content--split">
            <section className="company-panel">
              <div className="company-panel-heading">
                <div>
                  <h2>{editingTariff ? "Modifier un tarif" : "Ajouter un tarif bagage"}</h2>
                  <p>Définissez une tranche de poids et son prix en FCFA.</p>
                </div>
              </div>
              <form className="company-form" onSubmit={submitTariff} key={editingTariff?.id_tarif ?? "new-tariff"}>
                <div className="company-form-grid">
                  <label><span>Poids minimum (kg)</span><input name="poids_min" type="number" min="0" step="1" required defaultValue={editingTariff?.poids_min ?? ""} /></label>
                  <label><span>Poids maximum (kg)</span><input name="poids_max" type="number" min="1" step="1" required defaultValue={editingTariff?.poids_max ?? ""} /></label>
                </div>
                <label><span>Prix (FCFA)</span><input name="prix" type="number" min="0" step="1" required defaultValue={editingTariff?.prix ?? ""} /></label>
                <div className="company-form-actions">
                  <button type="submit" className="company-button" disabled={saving}>{saving ? "Enregistrement…" : editingTariff ? "Enregistrer" : "Ajouter le tarif"}</button>
                  {editingTariff ? <button type="button" className="company-cancel-button" onClick={() => setEditingTariff(null)}>Annuler</button> : null}
                </div>
              </form>
            </section>
            <section className="company-panel company-panel--list">
              <div className="company-panel-heading">
                <div><h2>Vos tarifs</h2><p>{tariffs.length} tranche(s) enregistrée(s)</p></div>
              </div>
              {tariffs.length ? (
                <div className="company-tariff-list">
                  {pageTariffs.map((tariff) => (
                    <article className="company-tariff-card" key={tariff.id_tarif}>
                      <div><strong>{tariff.poids_min} – {tariff.poids_max} kg</strong><span>{formatPrice(tariff.prix)}</span></div>
                      <div className="company-row-actions">
                        <button type="button" disabled={saving} onClick={() => setEditingTariff(tariff)}>Modifier</button>
                        <button type="button" className="is-danger" disabled={saving} onClick={() => setTariffToDelete(tariff)}>Supprimer</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="company-empty">Aucun tarif bagage. Ajoutez vos premières tranches.</p>}
              {tariffPagination}
            </section>
          </div>
        ) : null}

        {tab === "payments" && !activeTabDataLoading && !activeTabDataFailed ? (
          <div className="company-content">
            <section className="company-panel">
              <div className="company-panel-heading"><div><h2>Suivi des paiements</h2><p>Transactions liées aux réservations de vos trajets.</p></div><strong className="company-payment-total">{formatPrice(confirmedPaymentAmount)} confirmés</strong></div>
              {payments.length ? (
                <div className="company-table-wrap"><table className="company-table"><thead><tr><th>Référence</th><th>Trajet</th><th>Départ</th><th>Montant</th><th>Statut</th><th>Créé le</th></tr></thead><tbody>{pagePayments.map((payment) => <tr key={payment.id_paiement}><td>{payment.reference_interne}</td><td>{payment.ville_depart_nom} → {payment.ville_arrivee_nom}</td><td>{formatDate(payment.date_depart)}</td><td>{formatPrice(payment.montant)}</td><td><span className={`company-status company-status--${payment.statut.toLowerCase()}`}>{statusLabel(payment.statut)}</span></td><td>{formatDate(payment.date_creation.slice(0, 10))}</td></tr>)}</tbody></table></div>
              ) : <p className="company-empty">Aucun paiement n’est encore associé à vos trajets.</p>}
              {paymentPagination}
            </section>
          </div>
        ) : null}

        {tab === "notifications" && !activeTabDataLoading && !activeTabDataFailed ? (
          <div className="company-content">
            <section className="company-panel">
              <div className="company-panel-heading">
                <div><h2>Notifications</h2><p>{notifications.filter((item) => !item.lue).length} non lue(s)</p></div>
                {notifications.some((item) => !item.lue) ? (
                  <button type="button" className="company-text-button" disabled={saving} onClick={() => void markAllNotificationsRead()}>
                    Tout marquer comme lu
                  </button>
                ) : null}
              </div>
              {notifications.length ? (
                <div className="company-notification-list">
                  {pageNotifications.map((notification) => (
                    <article className={`company-notification-card ${notification.lue ? "" : "company-notification-card--unread"}`} key={notification.id_notification}>
                      <div>
                        <span className="company-notification-type">{notification.type}</span>
                        <h3>{notification.titre}</h3>
                        <p>{notification.message}</p>
                        <time dateTime={notification.date_creation}>{formatDate(notification.date_creation.slice(0, 10))}</time>
                      </div>
                      {!notification.lue ? (
                        <button type="button" disabled={saving} onClick={() => void markNotificationRead(notification)}>Marquer comme lu</button>
                      ) : <span className="company-status company-status--active">Lue</span>}
                    </article>
                  ))}
                </div>
              ) : <p className="company-empty">Aucune notification pour le moment.</p>}
              {notificationPagination}
            </section>
          </div>
        ) : null}

        {tab === "profile" ? (
          <div className="company-content">
            <section className="company-panel company-profile-panel">
              <div className="company-panel-heading">              <div><h2>Informations de la compagnie</h2><p>Les coordonnées légales restent en lecture seule après validation. Vous pouvez modifier l’adresse, la description et le logo.</p></div><span className="company-status company-status--active">{statusLabel(company.statut)}</span></div>
              <div className="company-profile-identity">
              <ProfileAvatar
                className="company-profile-identity__logo"
                src={company.logo}
                name={company.nom_commercial}
                size={56}
              />
              <div>
                <strong>{company.nom_commercial}</strong>
                <span>{company.raison_sociale}</span>
              </div>
              </div>
              <form className="company-form" onSubmit={submitCompanyProfile}>
              <div className="company-form-grid">
                <label><span>Nom commercial</span><input value={company.nom_commercial} disabled readOnly /></label>
                <label><span>Raison sociale</span><input value={company.raison_sociale} disabled readOnly /></label>
                <label><span>E-mail</span><input value={company.email} disabled readOnly /></label>
                <label><span>Téléphone principal</span><input value={company.telephone} disabled readOnly /></label>
                <label><span>Téléphone secondaire</span><input value={company.telephone_secondaire || "Non renseigné"} disabled readOnly /></label>
                <label><span>NIF</span><input value={company.nif || "Non renseigné"} disabled readOnly /></label>
                <label><span>RCCM</span><input value={company.rccm || "Non renseigné"} disabled readOnly /></label>
              </div>
              <label><span>Adresse <small>(modifiable)</small></span><input name="adresse" maxLength={255} defaultValue={company.adresse} /></label>
              <label><span>Description <small>(modifiable)</small></span><textarea name="description" rows={4} defaultValue={company.description} /></label>
                <label><span>Logo / photo de profil <small>(image, facultatif)</small></span><input name="logo" type="file" accept="image/*" /></label>
                <button type="submit" className="company-button" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer les changements"}</button>
              </form>
            </section>
          </div>
        ) : null}
        {agentToDelete ? (
          <ConfirmationDialog
            open
            title="Retirer cet agent de l’équipe ?"
            description={`Le lien avec l’équipe et ses permissions seront supprimés. Son compte restera désactivé et son adresse e-mail restera réservée ; il ne pourra plus se connecter ni être recréé avec cette adresse. Les opérations déjà enregistrées sont conservées.`}
            confirmLabel="Retirer l’agent"
            tone="danger"
            pending={saving}
            onCancel={() => setAgentToDelete(null)}
            onConfirm={() => deleteAgent(agentToDelete)}
          />
        ) : null}
        {agentToDeactivate ? (
          <ConfirmationDialog
            open
            title="Désactiver l’accès de cet agent ?"
            description={`${agentToDeactivate.prenoms} ${agentToDeactivate.nom} ne pourra plus se connecter ni utiliser les outils de la compagnie. Son compte, ses permissions et son historique restent en place. Vous pourrez réactiver son accès ici.`}
            confirmLabel="Désactiver l’accès"
            tone="danger"
            pending={saving}
            onCancel={() => setAgentToDeactivate(null)}
            onConfirm={async () => {
              if (await saveAgent(agentToDeactivate, { is_active: false })) {
                setAgentToDeactivate(null);
              }
            }}
          />
        ) : null}
        {stationToDeactivate ? (
          <ConfirmationDialog
            open
            title="Désactiver cette gare ?"
            description={`${stationToDeactivate.nom} ne pourra plus être sélectionnée pour de nouveaux trajets. Les voyages existants conserveront leur lieu de départ ou d’arrivée.`}
            confirmLabel="Désactiver la gare"
            tone="danger"
            pending={saving}
            onCancel={() => setStationToDeactivate(null)}
            onConfirm={() => toggleStation(stationToDeactivate, false)}
          />
        ) : null}
        {tariffToDelete ? (
          <ConfirmationDialog
            open
            title="Supprimer ce tarif bagage ?"
            description={`La tranche de ${tariffToDelete.poids_min} à ${tariffToDelete.poids_max} kg sera supprimée si aucun bagage enregistré ne l’utilise.`}
            confirmLabel="Supprimer le tarif"
            tone="danger"
            pending={saving}
            onCancel={() => setTariffToDelete(null)}
            onConfirm={() => deleteTariff(tariffToDelete)}
          />
        ) : null}
          </main>
        </SidebarInset>
      </SidebarProvider>
      {profile && profileDialog === "view" ? (
        <ProfileViewDialog
          profile={profile}
          name={[profile.prenoms, profile.nom].filter(Boolean).join(" ")}
          avatarClassName="company-user-avatar"
          onClose={() => setProfileDialog(null)}
        />
      ) : null}
      {profile && profileDialog === "edit" ? (
        <ProfileEditDialog
          profile={profile}
          onProfileUpdated={setProfile}
          onClose={() => setProfileDialog(null)}
        />
      ) : null}
    </TooltipProvider>
  );
}

function TripRow({ trip }: { trip: Trip }) {
  return (
    <div className="company-trip-summary">
      <div className="company-trip-route">
        <strong>{trip.ville_depart_nom} <span aria-hidden="true">→</span> {trip.ville_arrivee_nom}</strong>
        <span>{formatDate(trip.date_depart)} · {trip.heure_depart.slice(0, 5)}</span>
      </div>
      <div className="company-trip-details">
        <strong>{formatPrice(trip.prix)}</strong>
        <span>{trip.places_disponibles}/{trip.place_totale} places · {statusLabel(trip.statut)}</span>
      </div>
    </div>
  );
}
