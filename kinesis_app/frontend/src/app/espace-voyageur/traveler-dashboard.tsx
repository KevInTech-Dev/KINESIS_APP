"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  ArrowRight,
  Bell,
  BusFront,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  Eye,
  ExternalLink,
  House,
  Luggage,
  LogOut,
  MapPin,
  PanelLeft,
  Search,
  Ticket,
  UserRound,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import ConfirmationDialog from "@/components/confirmation-dialog";
import AppDialog from "@/components/app-dialog";
import KinesisLoader from "@/components/kinesis-loader";
import ProfileViewDialog from "@/components/profile-view-dialog";
import { useListPagination } from "@/components/list-pagination";
import ProfileAvatar from "@/components/profile-avatar";
import TogoPhoneInput from "@/components/togo-phone-input";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";
import {
  getUserFacingApiError,
  getUserFacingErrorMessage,
} from "@/lib/user-facing-errors";
import { formatTogoPhoneInput } from "@/lib/togo-phone";

type Reservation = {
  id_reservation: string;
  reference: string;
  date_reservation: string;
  date_expiration: string | null;
  montant_total: string | number;
  statut: string;
  voyage: {
    compagnie_nom: string;
    ville_depart_nom: string;
    ville_arrivee_nom: string;
    gare_depart: {
      id_gare: string;
      nom: string;
      adresse: string;
      maps_url: string | null;
    } | null;
    gare_arrivee: {
      id_gare: string;
      nom: string;
      adresse: string;
      maps_url: string | null;
    } | null;
    date_depart: string;
    heure_depart: string;
    image: string | null;
  };
  places: Array<{
    numero_siege: string;
    nom_passager: string;
  }>;
};

type Ticket = {
  id_billet: string;
  code_billet: string;
  code_qr: string;
  reservation_reference: string;
  nom_passager: string;
  numero_siege: string;
  statut: string;
  date_creation?: string;
  date_embarquement?: string | null;
  voyage: {
    ville_depart_nom: string;
    ville_arrivee_nom: string;
    date_depart: string;
    heure_depart: string;
  };
};

type Baggage = {
  id_bagage: string;
  reservation: string;
  reservation_reference: string;
  description: string;
  poids: string | number;
  frais_total: string | number;
  frais_payes: boolean;
  statut: string;
  date_creation: string;
  date_paiement_frais: string | null;
  date_restitution: string | null;
  enregistre_par_nom: string | null;
  paiement_enregistre_par_nom: string | null;
  restitue_par_nom: string | null;
  photos: Array<{
    id_photobagage: string;
    url: string;
    created_at: string;
  }>;
};

type Notification = {
  id_notification: string;
  type: string;
  titre: string;
  message: string;
  lue: boolean;
  date_creation: string;
};

type DashboardData = {
  profile: UserProfile | null;
  reservations: Reservation[];
  tickets: Ticket[];
  baggages: Baggage[];
  notifications: Notification[];
};

type DashboardResource = {
  status: number;
  data: unknown;
};

type DashboardResources = Record<
  "tickets" | "baggages" | "notifications",
  DashboardResource
>;

type DashboardResourcesResponse = {
  status: number;
  resources?: DashboardResources;
  error?: string;
};

let cachedTravelerDashboard: { userId: string; data: DashboardData } | null =
  null;

type TravelerTab =
  | "overview"
  | "reservations"
  | "baggages"
  | "tickets"
  | "notifications"
  | "profile";

const travelerTabs: {
  id: TravelerTab;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "overview", label: "Vue d’ensemble", icon: House },
  { id: "reservations", label: "Réservations", icon: CalendarDays },
  { id: "baggages", label: "Mes bagages", icon: Luggage },
  { id: "tickets", label: "Mes billets", icon: Ticket },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "profile", label: "Mon profil", icon: UserRound },
];

const statusLabels: Record<string, string> = {
  EN_ATTENTE_PAIEMENT: "En attente de paiement",
  PAYEE: "Payée",
  EXPIREE: "Expirée",
  ANNULEE: "Annulée",
};

const baggageStatusLabels: Record<string, string> = {
  ENREGISTRE: "Enregistré",
  RESTITUE: "Restitué",
};

function isBaggageList(value: unknown): value is Baggage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (baggage: unknown) =>
        typeof baggage === "object" &&
        baggage !== null &&
        "id_bagage" in baggage &&
        typeof baggage.id_bagage === "string" &&
        "reservation" in baggage &&
        typeof baggage.reservation === "string" &&
        "reservation_reference" in baggage &&
        typeof baggage.reservation_reference === "string" &&
        "description" in baggage &&
        typeof baggage.description === "string" &&
        "poids" in baggage &&
        (typeof baggage.poids === "string" ||
          typeof baggage.poids === "number") &&
        "frais_total" in baggage &&
        (typeof baggage.frais_total === "string" ||
          typeof baggage.frais_total === "number") &&
        "frais_payes" in baggage &&
        typeof baggage.frais_payes === "boolean" &&
        "statut" in baggage &&
        typeof baggage.statut === "string" &&
        "date_creation" in baggage &&
        typeof baggage.date_creation === "string" &&
        "date_paiement_frais" in baggage &&
        (typeof baggage.date_paiement_frais === "string" ||
          baggage.date_paiement_frais === null) &&
        "date_restitution" in baggage &&
        (typeof baggage.date_restitution === "string" ||
          baggage.date_restitution === null) &&
        "enregistre_par_nom" in baggage &&
        (typeof baggage.enregistre_par_nom === "string" ||
          baggage.enregistre_par_nom === null) &&
        "paiement_enregistre_par_nom" in baggage &&
        (typeof baggage.paiement_enregistre_par_nom === "string" ||
          baggage.paiement_enregistre_par_nom === null) &&
        "restitue_par_nom" in baggage &&
        (typeof baggage.restitue_par_nom === "string" ||
          baggage.restitue_par_nom === null) &&
        "photos" in baggage &&
        Array.isArray(baggage.photos) &&
        baggage.photos.every(
          (photo: unknown) =>
            typeof photo === "object" &&
            photo !== null &&
            "id_photobagage" in photo &&
            typeof photo.id_photobagage === "string" &&
            "url" in photo &&
            typeof photo.url === "string" &&
            "created_at" in photo &&
            typeof photo.created_at === "string",
        ),
    )
  );
}

function isTicketList(value: unknown): value is { results: Ticket[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "results" in value &&
    Array.isArray(value.results) &&
    value.results.every(
      (ticket) =>
        typeof ticket === "object" &&
        ticket !== null &&
        "id_billet" in ticket &&
        typeof ticket.id_billet === "string" &&
        "code_billet" in ticket &&
        typeof ticket.code_billet === "string" &&
        "code_qr" in ticket &&
        typeof ticket.code_qr === "string" &&
        "reservation_reference" in ticket &&
        typeof ticket.reservation_reference === "string" &&
        "nom_passager" in ticket &&
        typeof ticket.nom_passager === "string" &&
        "numero_siege" in ticket &&
        typeof ticket.numero_siege === "string" &&
        "statut" in ticket &&
        typeof ticket.statut === "string" &&
        "voyage" in ticket &&
        typeof ticket.voyage === "object" &&
        ticket.voyage !== null &&
        "ville_depart_nom" in ticket.voyage &&
        typeof ticket.voyage.ville_depart_nom === "string" &&
        "ville_arrivee_nom" in ticket.voyage &&
        typeof ticket.voyage.ville_arrivee_nom === "string" &&
        "date_depart" in ticket.voyage &&
        typeof ticket.voyage.date_depart === "string" &&
        "heure_depart" in ticket.voyage &&
        typeof ticket.voyage.heure_depart === "string",
    )
  );
}

function isReservationList(
  value: unknown,
): value is { results: Reservation[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "results" in value &&
    Array.isArray(value.results) &&
    value.results.every(
      (reservation) =>
        typeof reservation === "object" &&
        reservation !== null &&
        "id_reservation" in reservation &&
        typeof reservation.id_reservation === "string" &&
        "reference" in reservation &&
        typeof reservation.reference === "string" &&
        "date_reservation" in reservation &&
        typeof reservation.date_reservation === "string" &&
        "date_expiration" in reservation &&
        (typeof reservation.date_expiration === "string" ||
          reservation.date_expiration === null) &&
        "montant_total" in reservation &&
        (typeof reservation.montant_total === "string" ||
          typeof reservation.montant_total === "number") &&
        "statut" in reservation &&
        typeof reservation.statut === "string" &&
        "voyage" in reservation &&
        typeof reservation.voyage === "object" &&
        reservation.voyage !== null &&
        "compagnie_nom" in reservation.voyage &&
        typeof reservation.voyage.compagnie_nom === "string" &&
        "ville_depart_nom" in reservation.voyage &&
        typeof reservation.voyage.ville_depart_nom === "string" &&
        "ville_arrivee_nom" in reservation.voyage &&
        typeof reservation.voyage.ville_arrivee_nom === "string" &&
        "gare_depart" in reservation.voyage &&
        (reservation.voyage.gare_depart === null ||
          (typeof reservation.voyage.gare_depart === "object" &&
            reservation.voyage.gare_depart !== null &&
            "id_gare" in reservation.voyage.gare_depart &&
            typeof reservation.voyage.gare_depart.id_gare === "string" &&
            "nom" in reservation.voyage.gare_depart &&
            typeof reservation.voyage.gare_depart.nom === "string" &&
            "adresse" in reservation.voyage.gare_depart &&
            typeof reservation.voyage.gare_depart.adresse === "string" &&
            "maps_url" in reservation.voyage.gare_depart &&
            (typeof reservation.voyage.gare_depart.maps_url === "string" ||
              reservation.voyage.gare_depart.maps_url === null))) &&
        "gare_arrivee" in reservation.voyage &&
        (reservation.voyage.gare_arrivee === null ||
          (typeof reservation.voyage.gare_arrivee === "object" &&
            reservation.voyage.gare_arrivee !== null &&
            "id_gare" in reservation.voyage.gare_arrivee &&
            typeof reservation.voyage.gare_arrivee.id_gare === "string" &&
            "nom" in reservation.voyage.gare_arrivee &&
            typeof reservation.voyage.gare_arrivee.nom === "string" &&
            "adresse" in reservation.voyage.gare_arrivee &&
            typeof reservation.voyage.gare_arrivee.adresse === "string" &&
            "maps_url" in reservation.voyage.gare_arrivee &&
            (typeof reservation.voyage.gare_arrivee.maps_url === "string" ||
              reservation.voyage.gare_arrivee.maps_url === null))) &&
        "date_depart" in reservation.voyage &&
        typeof reservation.voyage.date_depart === "string" &&
        "heure_depart" in reservation.voyage &&
        typeof reservation.voyage.heure_depart === "string" &&
        "places" in reservation &&
        Array.isArray(reservation.places),
    )
  );
}

function isNotificationList(value: unknown): value is { results: Notification[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "results" in value &&
    Array.isArray(value.results) &&
    value.results.every(
      (notification) =>
        typeof notification === "object" &&
        notification !== null &&
        "id_notification" in notification &&
        typeof notification.id_notification === "string" &&
        "type" in notification &&
        typeof notification.type === "string" &&
        "titre" in notification &&
        typeof notification.titre === "string" &&
        "message" in notification &&
        typeof notification.message === "string" &&
        "lue" in notification &&
        typeof notification.lue === "boolean" &&
        "date_creation" in notification &&
        typeof notification.date_creation === "string",
    )
  );
}

async function getErrorMessage(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  return getUserFacingApiError(
    data,
    "Une erreur est survenue. Réessayez dans quelques instants.",
    response.status,
  );
}

function isDashboardResources(value: unknown): value is DashboardResources {
  if (typeof value !== "object" || value === null) return false;
  const resources = value as Record<string, unknown>;
  return ["tickets", "baggages", "notifications"].every((key) => {
    const resource = resources[key];
    return (
      typeof resource === "object" &&
      resource !== null &&
      "status" in resource &&
      typeof resource.status === "number" &&
      "data" in resource
    );
  });
}

async function getDashboardResources(): Promise<DashboardResourcesResponse> {
  const response = await fetch("/api/voyageur/tableau-de-bord", {
    cache: "no-store",
  });
  if (!response.ok) {
    return {
      status: response.status,
      error: await getErrorMessage(response),
    };
  }
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("resources" in payload) ||
    !isDashboardResources(payload.resources)
  ) {
    return {
      status: 502,
      error: "Les informations du tableau de bord sont incomplètes.",
    };
  }
  return { status: response.status, resources: payload.resources };
}

function dashboardResourceError(
  resource: DashboardResource,
  fallback: string,
) {
  return new Error(
    getUserFacingApiError(resource.data, fallback, resource.status),
  );
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date non disponible"
    : new Intl.DateTimeFormat("fr-FR", options).format(date);
}

function formatPrice(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("fr-FR").format(amount)} F CFA`
    : "Montant non disponible";
}

function getPaymentCountdown(expiration: string, now: number) {
  const remaining = new Date(expiration).getTime() - now;
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0) return { text: "00:00", expired: true, urgent: true };

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return {
    text: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    expired: false,
    urgent: totalSeconds <= 60,
  };
}

export default function TravelerDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const hasDashboardData = useRef(false);
  const dashboardUserId = useRef<string | null>(null);
  const dashboardRequestId = useRef(0);
  const reservationRequestId = useRef(0);
  const paymentDataRevision = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [busyReservation, setBusyReservation] = useState<string | null>(null);
  const [reservationToCancel, setReservationToCancel] =
    useState<Reservation | null>(null);
  const [reservationDetail, setReservationDetail] = useState<Reservation | null>(null);
  const [ticketDetail, setTicketDetail] = useState<Ticket | null>(null);
  const [baggageDetail, setBaggageDetail] = useState<Baggage | null>(null);
  const [profileDetailOpen, setProfileDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TravelerTab>("overview");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [nom, setNom] = useState("");
  const [prenoms, setPrenoms] = useState("");
  const [telephone, setTelephone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const { pageItems: pageReservations, pagination: reservationPagination } =
    useListPagination(data?.reservations ?? []);
  const { pageItems: pageTickets, pagination: ticketPagination } =
    useListPagination(data?.tickets ?? []);
  const { pageItems: pageBaggages, pagination: baggagePagination } =
    useListPagination(data?.baggages ?? [], 5);
  const { pageItems: pageNotifications, pagination: notificationPagination } =
    useListPagination(data?.notifications ?? []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    let userSelectedTab = false;
    const queryTimer =
      requestedTab === "notifications"
        ? window.setTimeout(() => {
            if (!userSelectedTab) setActiveTab(requestedTab);
          }, 0)
        : undefined;

    function handleTravelerTab(event: Event) {
      const tab = (event as CustomEvent<TravelerTab>).detail;
      if (tab === "overview" || tab === "notifications") {
        userSelectedTab = true;
        setActiveTab(tab);
      }
    }

    window.addEventListener("kinesis:traveler-tab", handleTravelerTab);
    return () => {
      if (queryTimer !== undefined) window.clearTimeout(queryTimer);
      window.removeEventListener("kinesis:traveler-tab", handleTravelerTab);
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    const requestId = ++dashboardRequestId.current;
    setLoading(!hasDashboardData.current);
    setError(null);
    setReservationsError(null);
    setReservationsLoading(false);
    try {
      const profileResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      if (profileResponse.status === 401) {
        cachedTravelerDashboard = null;
        dashboardUserId.current = null;
        hasDashboardData.current = false;
        setData(null);
        router.replace("/connexion");
        return;
      }
      if (!profileResponse.ok) {
        throw new Error(await getErrorMessage(profileResponse));
      }

      const profileData: unknown = await profileResponse.json();
      if (!isUserProfile(profileData)) {
        throw new Error("Le profil reçu du serveur est invalide.");
      }

      const cachedData =
        profileData.role === "VOYAGEUR" &&
        cachedTravelerDashboard?.userId === profileData.id
          ? { ...cachedTravelerDashboard.data, profile: profileData }
          : null;
      if (cachedData) {
        hasDashboardData.current = true;
        dashboardUserId.current = profileData.id;
        setData(cachedData);
        setNom(profileData.nom);
        setPrenoms(profileData.prenoms);
        setTelephone(formatTogoPhoneInput(profileData.telephone ?? ""));
        setLoading(false);
      } else if (
        hasDashboardData.current &&
        dashboardUserId.current !== profileData.id
      ) {
        hasDashboardData.current = false;
        dashboardUserId.current = null;
        setData(null);
        setLoading(true);
      }

      if (profileData.role !== "VOYAGEUR") {
        setReservationsError(null);
        setReservationsLoading(false);
        setData({
          profile: profileData,
          reservations: [],
          tickets: [],
          baggages: [],
          notifications: [],
        });
        return;
      }

      if (!cachedData) {
        setData({
          profile: profileData,
          reservations: [],
          tickets: [],
          baggages: [],
          notifications: [],
        });
      }

      const paymentId = new URLSearchParams(window.location.search).get(
        "payment_id",
      );
      const validPaymentId =
        paymentId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          paymentId,
        )
          ? paymentId
          : null;

      const refreshReservations = async (showLoading: boolean) => {
        const reservationRequest = ++reservationRequestId.current;
        if (showLoading) setReservationsLoading(true);
        try {
          const response = await fetch("/api/reservations?page_size=100", {
            cache: "no-store",
          });
          if (response.status === 401) {
            router.replace("/connexion");
            return;
          }
          if (!response.ok) throw new Error(await getErrorMessage(response));
          const reservationData: unknown = await response.json();
          if (!isReservationList(reservationData)) {
            throw new Error("La liste des réservations reçue est invalide.");
          }
          if (
            requestId !== dashboardRequestId.current ||
            reservationRequest !== reservationRequestId.current
          ) {
            return;
          }
          setReservationsError(null);
          setReservationsLoading(false);
          setData((current) =>
            current?.profile?.id === profileData.id
              ? { ...current, reservations: reservationData.results }
              : current,
          );
        } catch (reservationLoadError: unknown) {
          if (
            requestId !== dashboardRequestId.current ||
            reservationRequest !== reservationRequestId.current
          ) {
            return;
          }
          setReservationsLoading(false);
          console.error(
            "Traveler reservations request failed",
            reservationLoadError,
          );
          setReservationsError(
            getUserFacingErrorMessage(
              reservationLoadError,
              "Vos réservations ne peuvent pas être chargées pour le moment.",
            ),
          );
        }
      };

      setReservationsLoading(true);
      void refreshReservations(true);

      const initialPaymentDataRevision = paymentDataRevision.current;
      if (validPaymentId) {
        window.history.replaceState(null, "", "/espace-voyageur");
        void (async () => {
          let paymentConfirmed = false;
          try {
            const response = await fetch(
              `/api/paiements/${encodeURIComponent(validPaymentId)}`,
              { cache: "no-store" },
            );
            if (!response.ok) {
              throw new Error(await getErrorMessage(response));
            }
            const payment: unknown = await response.json();
            const paymentStatus =
              typeof payment === "object" &&
              payment !== null &&
              "statut" in payment &&
              typeof payment.statut === "string"
                ? payment.statut
                : "";

            if (requestId !== dashboardRequestId.current) return;
            if (paymentStatus === "CONFIRME") {
              paymentConfirmed = true;
              toast.success(
                "Paiement confirmé. Vos billets sont disponibles ci-dessous.",
              );
              const refreshRevision = ++paymentDataRevision.current;
              ++reservationRequestId.current;
              const [reservationsResponse, dashboard] = await Promise.all([
                fetch("/api/reservations?page_size=100", {
                  cache: "no-store",
                }),
                getDashboardResources(),
              ]);
              if (reservationsResponse.status === 401 || dashboard.status === 401) {
                router.replace("/connexion");
                return;
              }
              if (!reservationsResponse.ok) {
                throw new Error(await getErrorMessage(reservationsResponse));
              }
              if (!dashboard.resources) {
                throw new Error(
                  dashboard.error ??
                    "Les informations du paiement reçu sont incomplètes.",
                );
              }
              const { tickets, notifications } = dashboard.resources;
              if (tickets.status === 401 || notifications.status === 401) {
                router.replace("/connexion");
                return;
              }
              if (tickets.status < 200 || tickets.status >= 300) {
                throw dashboardResourceError(
                  tickets,
                  "Vos billets ne peuvent pas être actualisés.",
                );
              }
              if (notifications.status < 200 || notifications.status >= 300) {
                throw dashboardResourceError(
                  notifications,
                  "Vos notifications ne peuvent pas être actualisées.",
                );
              }
              const reservationsData: unknown = await reservationsResponse.json();
              const ticketsData: unknown = tickets.data;
              const notificationsData: unknown = notifications.data;
              if (
                !isReservationList(reservationsData) ||
                !isTicketList(ticketsData) ||
                !isNotificationList(notificationsData)
              ) {
                throw new Error(
                  "Les informations du paiement reçu sont incomplètes.",
                );
              }
              if (
                requestId !== dashboardRequestId.current ||
                refreshRevision !== paymentDataRevision.current
              ) {
                return;
              }
              setReservationsError(null);
              setReservationsLoading(false);
              setData((current) =>
                current?.profile?.id === profileData.id
                  ? {
                      ...current,
                      reservations: reservationsData.results,
                      tickets: ticketsData.results,
                      notifications: notificationsData.results,
                    }
                  : current,
              );
            } else if (paymentStatus === "EN_ATTENTE") {
              toast.info(
                "Paiement en cours de confirmation. Vos billets apparaîtront dès validation.",
              );
            } else if (paymentStatus) {
              toast.warning(`État du paiement : ${paymentStatus}.`);
            } else {
              toast.info("Le paiement a été vérifié.");
            }
          } catch (paymentError: unknown) {
            if (requestId !== dashboardRequestId.current) return;
            console.error("Payment return status check failed", paymentError);
            if (paymentConfirmed) {
              setReservationsLoading(false);
              setReservationsError(
                "Paiement confirmé, mais les informations n’ont pas pu être actualisées. Actualisez la page pour les vérifier.",
              );
            }
            toast.error(
              getUserFacingErrorMessage(
                paymentError,
                "Le statut du paiement n’a pas pu être vérifié.",
              ),
            );
          }
        })();
      }

      const dashboard = await getDashboardResources();
      if (dashboard.status === 401) {
        router.replace("/connexion");
        return;
      }
      if (!dashboard.resources) {
        throw new Error(
          dashboard.error ?? "Les informations du tableau de bord sont invalides.",
        );
      }

      const {
        tickets: ticketsResource,
        baggages: baggagesResource,
        notifications: notificationsResource,
      } = dashboard.resources;
      if (
        ticketsResource.status === 401 ||
        baggagesResource.status === 401 ||
        notificationsResource.status === 401
      ) {
        router.replace("/connexion");
        return;
      }
      if (
        requestId !== dashboardRequestId.current ||
        initialPaymentDataRevision !== paymentDataRevision.current
      ) {
        return;
      }

      if (ticketsResource.status < 200 || ticketsResource.status >= 300) {
        throw dashboardResourceError(
          ticketsResource,
          "Vos billets ne peuvent pas être chargés pour le moment.",
        );
      }
      if (baggagesResource.status < 200 || baggagesResource.status >= 300) {
        throw dashboardResourceError(
          baggagesResource,
          "Vos bagages ne peuvent pas être chargés pour le moment.",
        );
      }
      if (
        notificationsResource.status < 200 ||
        notificationsResource.status >= 300
      ) {
        throw dashboardResourceError(
          notificationsResource,
          "Vos notifications ne peuvent pas être chargées pour le moment.",
        );
      }
      const ticketsData: unknown = ticketsResource.data;
      const baggagesData: unknown = baggagesResource.data;
      const notificationsData: unknown = notificationsResource.data;
      if (!isTicketList(ticketsData)) {
        throw new Error("La liste des billets reçue est invalide.");
      }
      if (!isBaggageList(baggagesData)) {
        throw new Error("La liste des bagages reçue est invalide.");
      }
      if (!isNotificationList(notificationsData)) {
        throw new Error("La liste des notifications reçue est invalide.");
      }
      if (
        requestId !== dashboardRequestId.current ||
        initialPaymentDataRevision !== paymentDataRevision.current
      ) {
        return;
      }
      setData((current) => ({
        profile: profileData,
        reservations:
          current?.profile?.id === profileData.id
            ? current.reservations
            : cachedData?.reservations ?? [],
        tickets: ticketsData.results,
        baggages: baggagesData,
        notifications: notificationsData.results,
      }));
      setNom(profileData.nom);
      setPrenoms(profileData.prenoms);
      setTelephone(formatTogoPhoneInput(profileData.telephone ?? ""));
    } catch (loadError) {
      if (requestId !== dashboardRequestId.current) return;
      console.error("Traveler dashboard request failed", loadError);
      setError(
        getUserFacingErrorMessage(
          loadError,
          "Impossible de charger votre espace pour le moment.",
        ),
      );
    } finally {
      if (requestId === dashboardRequestId.current) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        return loadDashboard();
      }
    });
    return () => {
      active = false;
      dashboardRequestId.current += 1;
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (data?.profile?.role === "VOYAGEUR") {
      cachedTravelerDashboard = {
        userId: data.profile.id,
        data,
      };
      hasDashboardData.current = true;
      dashboardUserId.current = data.profile.id;
    }
  }, [data]);

  async function signOut() {
    try {
      const response = await fetch("/api/auth/deconnexion", { method: "POST" });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      if (data?.profile) {
        cachedTravelerDashboard = null;
        dashboardUserId.current = null;
        hasDashboardData.current = false;
        setData(null);
      }
      router.replace("/");
    } catch (signOutError) {
      console.error("Logout request failed", signOutError);
      toast.error(
        getUserFacingErrorMessage(signOutError, "La déconnexion n’a pas pu être confirmée."),
      );
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    const formData = new FormData();
    formData.set("nom", nom.trim());
    formData.set("prenoms", prenoms.trim());
    formData.set("telephone", telephone.trim());
    if (photo) formData.set("photo_profil", photo);

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        body: formData,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const updatedProfile: unknown = await response.json();
      if (!isUserProfile(updatedProfile)) {
        throw new Error("Le profil mis à jour reçu du serveur est invalide.");
      }
      setData((current) =>
        current ? { ...current, profile: updatedProfile } : current,
      );
      setNom(updatedProfile.nom);
      setPrenoms(updatedProfile.prenoms);
      setTelephone(formatTogoPhoneInput(updatedProfile.telephone ?? ""));
      setPhoto(null);
      if (photoInput.current) photoInput.current.value = "";
      setEditingProfile(false);
      toast.success("Votre profil a été mis à jour.");
    } catch (saveError) {
      console.error("Profile update failed", saveError);
      toast.error(
        getUserFacingErrorMessage(saveError, "La mise à jour du profil a échoué."),
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function payReservation(reservationId: string) {
    setBusyReservation(reservationId);
    setError(null);
    try {
      const response = await fetch(
        `/api/paiements/reservations/${encodeURIComponent(reservationId)}/initier`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const payment: unknown = await response.json();
      if (
        typeof payment !== "object" ||
        payment === null ||
        !("payment_url" in payment) ||
        typeof payment.payment_url !== "string"
      ) {
        throw new Error("Le lien de paiement reçu est invalide.");
      }
      const paymentUrl = new URL(payment.payment_url);
      if (paymentUrl.protocol !== "https:") {
        throw new Error("Le lien de paiement sécurisé reçu est invalide.");
      }
      window.location.assign(paymentUrl.toString());
    } catch (payError) {
      console.error("Payment initialization failed", payError);
      toast.error(
        getUserFacingErrorMessage(payError, "Le paiement n’a pas pu être démarré."),
      );
    } finally {
      setBusyReservation(null);
    }
  }

  async function cancelReservation(reservationId: string) {
    setBusyReservation(reservationId);
    setError(null);
    try {
      const response = await fetch(
        `/api/reservations/${encodeURIComponent(reservationId)}/cancel`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      await loadDashboard();
      toast.success("Votre réservation a été annulée.");
    } catch (cancelError) {
      console.error("Reservation cancellation failed", cancelError);
      toast.error(
        getUserFacingErrorMessage(cancelError, "L’annulation n’a pas pu être effectuée."),
      );
    } finally {
      setBusyReservation(null);
    }
  }

  async function showReservationDetails(reservationId: string) {
    setDetailLoading(reservationId);
    setError(null);
    try {
      const response = await fetch(
        `/api/reservations/${encodeURIComponent(reservationId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const result: unknown = await response.json();
      const details = { results: [result] };
      if (!isReservationList(details)) {
        throw new Error("Les détails de la réservation reçus sont invalides.");
      }
      setReservationDetail(details.results[0]);
    } catch (detailError) {
      console.error("Reservation detail request failed", detailError);
      setError(
        getUserFacingErrorMessage(detailError, "Impossible de charger cette réservation."),
      );
    } finally {
      setDetailLoading(null);
    }
  }

  async function showTicketDetails(ticketId: string) {
    setDetailLoading(ticketId);
    setError(null);
    try {
      const response = await fetch(
        `/api/billets/${encodeURIComponent(ticketId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const result: unknown = await response.json();
      const details = { results: [result] };
      if (!isTicketList(details)) {
        throw new Error("Les détails du billet reçus sont invalides.");
      }
      setTicketDetail(details.results[0]);
    } catch (detailError) {
      console.error("Ticket detail request failed", detailError);
      setError(
        getUserFacingErrorMessage(detailError, "Impossible de charger ce billet."),
      );
    } finally {
      setDetailLoading(null);
    }
  }

  function downloadTicket(ticket: Ticket) {
    const ticketCard = document.querySelector<HTMLElement>(
      `[data-print-ticket-card="${ticket.id_billet}"]`,
    );
    if (!ticketCard) {
      setError("Impossible de préparer ce billet à l’impression.");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Autorisez les fenêtres contextuelles pour télécharger le billet.");
      return;
    }

    const qrCode = ticketCard.querySelector("svg")?.cloneNode(true);
    if (!(qrCode instanceof SVGElement)) {
      printWindow.close();
      setError("Le code QR de ce billet est indisponible.");
      return;
    }

    const printableTicket = printWindow.document.createElement("main");
    printableTicket.className = "print-ticket";
    const printableQrCode = printWindow.document.importNode(qrCode, true);
    printableTicket.append(printableQrCode);

    const ticketInfo = printWindow.document.createElement("section");
    ticketInfo.className = "print-ticket__info";
    const route = printWindow.document.createElement("h1");
    route.textContent = `${ticket.voyage.ville_depart_nom} → ${ticket.voyage.ville_arrivee_nom}`;
    ticketInfo.append(route);

    const departure = printWindow.document.createElement("p");
    departure.textContent = `Départ : ${formatDate(ticket.voyage.date_depart, {
      day: "numeric",
      month: "long",
      year: "numeric",
    })} à ${ticket.voyage.heure_depart.slice(0, 5)}`;
    ticketInfo.append(departure);

    const passenger = printWindow.document.createElement("p");
    passenger.textContent = `${ticket.nom_passager} · Siège ${ticket.numero_siege}`;
    ticketInfo.append(passenger);

    const ticketReference = printWindow.document.createElement("p");
    ticketReference.textContent = `Billet ${ticket.code_billet} · Réservation ${ticket.reservation_reference}`;
    ticketInfo.append(ticketReference);
    printableTicket.append(ticketInfo);

    const style = printWindow.document.createElement("style");
    style.textContent = `
      @page { size: A5 portrait; margin: 14mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #173b2b;
        font-family: Arial, Helvetica, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .print-ticket {
        width: 100%;
        max-width: 130mm;
        margin: 12mm auto 0;
        padding: 0 7mm;
        text-align: center;
      }
      .print-ticket > svg {
        display: block;
        width: 48mm;
        height: 48mm;
        margin: 0 auto 10mm;
      }
      .print-ticket__info {
        width: 100%;
        margin: 0 auto;
      }
      .print-ticket h1 {
        margin: 0 0 8mm;
        font-size: 17pt;
        line-height: 1.3;
      }
      .print-ticket__info p {
        margin: 0;
        padding: 4mm 0;
        border-top: 1px solid #e3ebe2;
        color: #405348;
        font-size: 11pt;
        line-height: 1.5;
      }
      @media print { body { break-inside: avoid; } }
    `;
    printWindow.document.head.append(style);
    printWindow.opener = null;
    printWindow.document.documentElement.lang = "fr";
    printWindow.document.title = `Billet ${ticket.code_billet}`;
    printWindow.document.body.replaceChildren(printableTicket);
    printWindow.addEventListener(
      "afterprint",
      () => printWindow.close(),
      { once: true },
    );
    printWindow.focus();
    printWindow.print();
  }

  async function markNotificationRead(notification: Notification) {
    if (notification.lue) return;
    try {
      const response = await fetch(
        `/api/notifications/${encodeURIComponent(notification.id_notification)}/lire`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setData((current) =>
        current
          ? {
              ...current,
              notifications: current.notifications.map((item) =>
                item.id_notification === notification.id_notification
                  ? { ...item, lue: true }
                  : item,
              ),
            }
          : current,
      );
    } catch (readError) {
      console.error("Notification read request failed", readError);
      setError(
        getUserFacingErrorMessage(
          readError,
          "Impossible de marquer cette notification comme lue.",
        ),
      );
    }
  }

  async function markAllNotificationsRead() {
    try {
      const response = await fetch("/api/notifications/lire-tout", {
        method: "POST",
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setData((current) =>
        current
          ? {
              ...current,
              notifications: current.notifications.map((item) => ({
                ...item,
                lue: true,
              })),
            }
          : current,
      );
    } catch (readError) {
      console.error("Mark all notifications as read failed", readError);
      setError(
        getUserFacingErrorMessage(
          readError,
          "Impossible de mettre à jour les notifications.",
        ),
      );
    }
  }

  const profile = data?.profile;
  const displayName = [profile?.prenoms, profile?.nom]
    .filter(Boolean)
    .join(" ");
  const pendingReservations =
    data?.reservations.filter(
      (reservation) => reservation.statut === "EN_ATTENTE_PAIEMENT",
    ).length ?? 0;
  const unreadNotifications =
    data?.notifications.filter((notification) => !notification.lue).length ?? 0;
  const activeTitle =
    travelerTabs.find((tab) => tab.id === activeTab)?.label ?? "Vue d’ensemble";

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<number>("kinesis:unread-notifications", {
        detail: unreadNotifications,
      }),
    );
  }, [unreadNotifications]);

  if (loading) {
    return <KinesisLoader message="Chargement de votre espace voyageur…" />;
  }

  if (error && !data) {
    return (
      <main className="traveler-workspace-state traveler-workspace-state--error" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => void loadDashboard()}>
          Réessayer
        </button>
      </main>
    );
  }

  if (!profile || profile.role !== "VOYAGEUR") {
    return (
      <main className="traveler-workspace-state">
        <h1>Votre espace arrive bientôt</h1>
        <p>
          La consultation des réservations est disponible pour les comptes
          voyageurs. Votre compte est bien connecté.
        </p>
      </main>
    );
  }

  return (
    <div className="traveler-app-shell">
      <header className="traveler-app-header">
        <div className="traveler-app-header__inner">
          <Link className="traveler-app-brand" href="/" aria-label="Kinesis, accueil">
            <Image src="/kinesis-mark.png" width={38} height={38} alt="" priority />
            <span>KINESIS</span>
          </Link>

          <nav className="traveler-app-nav" aria-label="Navigation de l’espace voyageur">
            {travelerTabs.filter((tab) => tab.id !== "profile").map((tab) => {
              const Icon = tab.icon;
              const badge =
                tab.id === "notifications"
                  ? unreadNotifications
                  : tab.id === "reservations"
                    ? pendingReservations
                    : 0;
              return (
                <button
                  type="button"
                  key={tab.id}
                  className={activeTab === tab.id ? "is-active" : ""}
                  aria-current={activeTab === tab.id ? "page" : undefined}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{tab.label}</span>
                  {badge > 0 ? (
                    <span
                      className={`traveler-app-nav__badge${tab.id === "notifications" ? " traveler-app-nav__badge--notification" : ""}`}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="traveler-app-header__actions">
            <button
              type="button"
              className="traveler-app-profile"
              onClick={() => setActiveTab("profile")}
              aria-label={`Ouvrir le profil de ${displayName || "votre compte"}`}
            >
              <ProfileAvatar
                className="traveler-app-profile__avatar"
                fallbackClassName="traveler-app-profile__avatar--fallback"
                src={profile.photo_profil}
                name={displayName}
                size={36}
              />
              <span className="traveler-app-profile__copy">
                <strong>{displayName || "Mon profil"}</strong>
                <small>{profile.email}</small>
              </span>
            </button>
            <button
              type="button"
              className="traveler-app-logout"
              onClick={() => void signOut()}
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="traveler-app-main">
        <div className="traveler-app-topbar">
          <div className="traveler-app-topbar__title">
            <PanelLeft aria-hidden="true" />
            <div>
              <p>ESPACE VOYAGEUR</p>
              <h1>{activeTitle}</h1>
            </div>
          </div>
          <div className="traveler-app-topbar__actions">
            <button
              type="button"
              className="traveler-app-topbar__notifications"
              onClick={() => setActiveTab("notifications")}
              aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} non lues` : ""}`}
            >
              <Bell aria-hidden="true" />
              {unreadNotifications > 0 ? (
                <span>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
              ) : null}
            </button>
            <button
              type="button"
              className="traveler-app-topbar__logout"
              onClick={() => void signOut()}
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="traveler-workspace-content">
        {error ? (
          <div className="traveler-workspace-refresh-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadDashboard()}>
              Réessayer
            </button>
          </div>
        ) : null}
        {activeTab === "overview" ? (
          <section className="traveler-overview-welcome" aria-label="Bienvenue">
            <div className="traveler-overview-welcome__photo">
              <ProfileAvatar
                className="traveler-github-avatar"
                fallbackClassName="traveler-profile-photo--fallback"
                src={profile.photo_profil}
                name={displayName}
                size={104}
                alt={`Photo de ${displayName}`}
              />
              <div className="traveler-profile-actions">
                <button
                  type="button"
                  className="traveler-profile-action"
                  onClick={() => setProfileDetailOpen(true)}
                >
                  Voir mon profil
                </button>
                <button
                  type="button"
                  className="traveler-profile-action traveler-profile-action--edit"
                  onClick={() => {
                    setActiveTab("profile");
                    setEditingProfile(true);
                  }}
                >
                  Modifier mon profil
                </button>
              </div>
            </div>
            <div className="traveler-overview-welcome__copy">
              <p className="traveler-eyebrow">ESPACE VOYAGEUR</p>
              <h2>Bienvenue {profile.prenoms || profile.nom}</h2>
              <h3>{displayName || "Voyageur KINESIS"}</h3>
              <p className="traveler-overview-welcome__email">{profile.email}</p>
            </div>
            <Link className="traveler-overview-search" href="/voyages">
              <Search aria-hidden="true" />
              Rechercher un voyage
            </Link>
          </section>
        ) : (
          <div className="traveler-page-heading">
            <div>
              <p className="traveler-eyebrow">ESPACE VOYAGEUR</p>
              <h2>{activeTitle}</h2>
              <p>
                {activeTab === "reservations"
                  ? "Consultez et gérez vos réservations de voyage."
                  : activeTab === "tickets"
                    ? "Retrouvez vos billets et leurs codes de vérification."
                    : activeTab === "notifications"
                      ? "Suivez les informations concernant vos réservations et vos voyages."
                      : "Consultez et mettez à jour les informations de votre compte."}
              </p>
            </div>
            {activeTab !== "profile" ? (
              <Link className="traveler-primary-link" href="/voyages">
                <Search aria-hidden="true" />
                Rechercher un voyage
              </Link>
            ) : null}
          </div>
        )}


        {activeTab === "overview" ? (
          <div className="traveler-overview-layout">
            <aside className="traveler-overview-profile" aria-label="Profil voyageur">
              <ProfileAvatar
                className="traveler-overview-profile__avatar"
                fallbackClassName="traveler-profile-photo--fallback"
                src={profile.photo_profil}
                name={displayName}
                size={240}
                alt={`Photo de ${displayName}`}
              />
              <h3>{displayName || "Voyageur KINESIS"}</h3>
              <p>{profile.email}</p>
              <button
                type="button"
                onClick={() => setProfileDetailOpen(true)}
              >
                Voir mon profil
              </button>
            </aside>
            <div className="traveler-overview-main">
              <section className="traveler-repository-grid" aria-label="Résumé du compte">
                <button type="button" onClick={() => setActiveTab("reservations")}>
                  <span><CalendarDays aria-hidden="true" /> Réservations</span>
                  <strong>{data?.reservations.length ?? 0}</strong>
                  <small>Voyages réservés sur votre compte</small>
                </button>
                <button type="button" onClick={() => setActiveTab("tickets")}>
                  <span><Ticket aria-hidden="true" /> Billets</span>
                  <strong>{data?.tickets.length ?? 0}</strong>
                  <small>Billets disponibles après paiement</small>
                </button>
                <button type="button" onClick={() => setActiveTab("reservations")}>
                  <span><CreditCard aria-hidden="true" /> À régler</span>
                  <strong>{pendingReservations}</strong>
                  <small>Réservations en attente de paiement</small>
                </button>
                <button type="button" onClick={() => setActiveTab("notifications")}>
                  <span><Bell aria-hidden="true" /> Notifications</span>
                  <strong>{unreadNotifications}</strong>
                  <small>Informations non lues</small>
                </button>
              </section>


              <section className="traveler-overview-list">
                <div className="traveler-github-section-heading">
                  <div>
                    <h3>Réservations récentes</h3>
                    <p>Les derniers voyages associés à votre compte</p>
                  </div>
                  <button type="button" onClick={() => setActiveTab("reservations")}>
                    Tout afficher <ArrowRight aria-hidden="true" />
                  </button>
                </div>
                {data?.reservations.length ? (
                  <div className="traveler-recent-list">
                    {data.reservations.slice(0, 4).map((reservation) => (
                      <article key={reservation.id_reservation}>
                        <span className="traveler-recent-icon">
                          <BusFront aria-hidden="true" />
                        </span>
                        <div>
                          <strong>
                            {reservation.voyage.ville_depart_nom}
                            <span aria-hidden="true"> → </span>
                            {reservation.voyage.ville_arrivee_nom}
                          </strong>
                          <small>
                            {reservation.voyage.compagnie_nom} · Départ le{" "}
                            {formatDate(reservation.voyage.date_depart, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </small>
                        </div>
                        <span className={`traveler-status traveler-status--${reservation.statut.toLowerCase()}`}>
                          {statusLabels[reservation.statut] ?? reservation.statut}
                        </span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="traveler-empty traveler-empty--compact">
                    <h3>Aucune réservation pour le moment</h3>
                    <p>Vos prochains voyages apparaîtront ici.</p>
                    <Link href="/voyages">Découvrir les voyages</Link>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "profile" ? (
          <section className="traveler-profile-card traveler-profile-card--workspace" aria-labelledby="profile-title">
            <div className="traveler-profile-summary">
              <ProfileAvatar
                className="traveler-profile-photo"
                fallbackClassName="traveler-profile-photo--fallback"
                src={profile.photo_profil}
                name={displayName}
                size={76}
                alt={`Photo de ${displayName}`}
              />
              <div>
                <p className="traveler-eyebrow">VOTRE COMPTE</p>
                <h2 id="profile-title">{displayName || "Mon profil"}</h2>
                <p>{profile.email}</p>
                {profile.telephone ? <p>{profile.telephone}</p> : null}
              </div>
              <div className="traveler-profile-summary__actions">
                <button
                  className="traveler-secondary-button traveler-profile-summary__view"
                  type="button"
                  onClick={() => setProfileDetailOpen(true)}
                >
                  <Eye aria-hidden="true" />
                  Voir mon profil
                </button>
                <button
                  className="traveler-secondary-button"
                  type="button"
                  onClick={() => setEditingProfile((value) => !value)}
                  aria-expanded={editingProfile}
                >
                  <UserRoundPen aria-hidden="true" />
                  {editingProfile ? "Fermer" : "Modifier mon profil"}
                </button>
              </div>
            </div>
            {editingProfile ? (
              <form className="traveler-profile-form" onSubmit={saveProfile}>
                <label>
                  <span>Prénoms</span>
                  <input
                    autoComplete="given-name"
                    maxLength={150}
                    value={prenoms}
                    onChange={(event) => setPrenoms(event.target.value)}
                  />
                </label>
                <label>
                  <span>Nom</span>
                  <input
                    autoComplete="family-name"
                    maxLength={100}
                    required
                    value={nom}
                    onChange={(event) => setNom(event.target.value)}
                  />
                </label>
                <label>
                  <span>Téléphone</span>
                  <TogoPhoneInput
                    value={telephone}
                    onChange={(value) =>
                      setTelephone(formatTogoPhoneInput(value))
                    }
                  />
                </label>
                <label className="traveler-photo-field">
                  <span>Photo de profil</span>
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/*"
                    onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                  />
                </label>
                <button className="traveler-save-button" type="submit" disabled={profileSaving}>
                  {profileSaving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </form>
            ) : null}
          </section>
        ) : null}

        {activeTab === "reservations" ? (
          <>
          <section className="traveler-reservations" id="reservations" aria-labelledby="bookings-title">
            <div className="traveler-section-heading">
              <div>
                <p className="traveler-eyebrow">VOTRE ACTIVITÉ</p>
                <h2 id="bookings-title">
                  <CalendarDays aria-hidden="true" />
                  Mes réservations
                </h2>
              </div>
              <span className="traveler-count">
                {data?.reservations.length ?? 0} réservation
                {(data?.reservations.length ?? 0) > 1 ? "s" : ""}
              </span>
            </div>

            {reservationsError ? (
              <div className="traveler-workspace-refresh-error" role="alert">
                <span>{reservationsError}</span>
                <button type="button" onClick={() => void loadDashboard()}>
                  Réessayer
                </button>
              </div>
            ) : null}
            {reservationsLoading && !data?.reservations.length ? (
              <p role="status">Chargement de vos réservations…</p>
            ) : data?.reservations.length ? (
              <div className="traveler-booking-list">
                {pageReservations.map((reservation) => (
                  <article
                    className="traveler-booking-card"
                    key={reservation.id_reservation}
                  >
                    <div className="traveler-booking-main">
                      <div className="traveler-route">
                        <span>{reservation.voyage.ville_depart_nom}</span>
                        <span className="traveler-route-arrow" aria-hidden="true">
                          →
                        </span>
                        <span>{reservation.voyage.ville_arrivee_nom}</span>
                      </div>
                      {reservation.voyage.gare_depart || reservation.voyage.gare_arrivee ? (
                        <div className="traveler-booking-stations">
                          {reservation.voyage.gare_depart?.maps_url ? (
                            <a
                              className="traveler-map-link"
                              href={reservation.voyage.gare_depart.maps_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Voir la gare de départ ${reservation.voyage.gare_depart.nom} sur Google Maps`}
                            >
                              <MapPin aria-hidden="true" />
                              <span><small>Départ</small>{reservation.voyage.gare_depart.nom}</span>
                              <ExternalLink aria-hidden="true" />
                            </a>
                          ) : null}
                          {reservation.voyage.gare_arrivee?.maps_url ? (
                            <a
                              className="traveler-map-link"
                              href={reservation.voyage.gare_arrivee.maps_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Voir la gare d’arrivée ${reservation.voyage.gare_arrivee.nom} sur Google Maps`}
                            >
                              <MapPin aria-hidden="true" />
                              <span><small>Arrivée</small>{reservation.voyage.gare_arrivee.nom}</span>
                              <ExternalLink aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="traveler-booking-summary">
                        <p className="traveler-price">
                          {formatPrice(reservation.montant_total)}
                        </p>
                      </div>
                    </div>
                    <div className="traveler-booking-details">
                      <span
                        className={`traveler-status traveler-status--${reservation.statut.toLowerCase()}`}
                      >
                        {statusLabels[reservation.statut] ?? reservation.statut}
                      </span>
                      <p className="traveler-departure">
                        <Clock3 aria-hidden="true" />
                        {formatDate(reservation.voyage.date_depart, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        {" · "}
                        {reservation.voyage.heure_depart.slice(0, 5)}
                      </p>
                      {reservation.statut === "EN_ATTENTE_PAIEMENT" &&
                      reservation.date_expiration &&
                      currentTime > 0 ? (
                        (() => {
                          const countdown = getPaymentCountdown(
                            reservation.date_expiration,
                            currentTime,
                          );
                          return countdown ? (
                            <div
                              className={`traveler-payment-countdown${countdown.urgent ? " traveler-payment-countdown--urgent" : ""}${countdown.expired ? " traveler-payment-countdown--expired" : ""}`}
                              role="timer"
                              aria-label={
                                countdown.expired
                                  ? "Le délai de paiement est expiré"
                                  : `Temps restant pour payer : ${countdown.text}`
                              }
                            >
                              <span className="traveler-payment-countdown__label">
                                {countdown.expired
                                  ? "Délai de paiement expiré"
                                  : "Temps restant"}
                              </span>
                              <strong className="traveler-payment-countdown__time">
                                {countdown.text}
                              </strong>
                            </div>
                          ) : null;
                        })()
                      ) : null}
                      <div className="traveler-booking-actions">
                        <button
                          type="button"
                          onClick={() =>
                            reservationDetail?.id_reservation === reservation.id_reservation
                              ? setReservationDetail(null)
                              : void showReservationDetails(reservation.id_reservation)
                          }
                          disabled={detailLoading === reservation.id_reservation}
                        >
                          {detailLoading === reservation.id_reservation
                            ? "Chargement…"
                            : "Détails"}
                        </button>
                      </div>
                      {reservation.statut === "EN_ATTENTE_PAIEMENT" ? (
                        <div className="traveler-booking-actions">
                          <button
                            type="button"
                            onClick={() => void payReservation(reservation.id_reservation)}
                            disabled={busyReservation === reservation.id_reservation}
                          >
                            {busyReservation === reservation.id_reservation
                              ? "Chargement…"
                              : "Payer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReservationToCancel(reservation)}
                            disabled={busyReservation === reservation.id_reservation}
                          >
                            Annuler
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : reservationsError ? null : (
              <div className="traveler-empty">
                <span aria-hidden="true"><CalendarDays /></span>
                <h3>Aucune réservation pour le moment</h3>
                <p>
                  Vos prochains voyages réservés apparaîtront dans cet espace.
                </p>
                <Link href="/#search-form">Trouver un voyage</Link>
              </div>
            )}
            {reservationPagination}
          </section>
          </>
        ) : null}

        {activeTab === "baggages" ? (
          <section className="traveler-baggages" id="bagages" aria-labelledby="baggages-title">
            <div className="traveler-section-heading">
              <div>
                <p className="traveler-eyebrow">SUIVI DE VOS BAGAGES</p>
                <h2 id="baggages-title">
                  <Luggage aria-hidden="true" />
                  Mes bagages
                </h2>
              </div>
              <span className="traveler-count">
                {data?.baggages.length ?? 0} bagage
                {(data?.baggages.length ?? 0) > 1 ? "s" : ""}
              </span>
            </div>
            {data?.baggages.length ? (
              <div className="traveler-baggage-list">
                {pageBaggages.map((baggage) => (
                  <article className="traveler-baggage-card" key={baggage.id_bagage}>
                    <div className="traveler-baggage-main">
                      <strong>Réservation {baggage.reservation_reference}</strong>
                      <span>{baggage.poids} kg</span>
                      {baggage.description ? <p>{baggage.description}</p> : null}
                      <small>
                        Enregistré le{" "}
                        {formatDate(baggage.date_creation, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </small>
                    </div>
                    <div className="traveler-baggage-status">
                      <span
                        className={`traveler-status traveler-status--${baggage.statut.toLowerCase()}`}
                      >
                        {baggageStatusLabels[baggage.statut] ?? baggage.statut}
                      </span>
                      <strong>{formatPrice(baggage.frais_total)}</strong>
                      <small className={baggage.frais_payes ? "is-paid" : "is-due"}>
                        {baggage.frais_payes
                          ? "Frais réglés"
                          : "Frais à régler à la gare"}
                      </small>
                      <button
                        className="traveler-baggage-details-button"
                        type="button"
                        onClick={() => setBaggageDetail(baggage)}
                      >
                        Voir les détails
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="traveler-empty traveler-empty--compact">
                <h3>Aucun bagage enregistré</h3>
                <p>
                  Les bagages enregistrés par la compagnie le jour du départ
                  apparaîtront ici.
                </p>
              </div>
            )}
            {baggagePagination}
          </section>
        ) : null}

        {activeTab === "tickets" ? (
          <section className="traveler-tickets" id="billets" aria-labelledby="tickets-title">
            <div className="traveler-section-heading">
              <div>
                <p className="traveler-eyebrow">APRÈS PAIEMENT</p>
                <h2 id="tickets-title">
                  <Ticket aria-hidden="true" />
                  Mes billets
                </h2>
              </div>
              <span className="traveler-count">
                {data?.tickets.length ?? 0} billet
                {(data?.tickets.length ?? 0) > 1 ? "s" : ""}
              </span>
            </div>
            {data?.tickets.length ? (
              <div className="traveler-ticket-list">
                {pageTickets.map((ticket) => (
                  <article
                    className="traveler-ticket-card"
                    data-print-ticket-card={ticket.id_billet}
                    key={ticket.id_billet}
                  >
                    <QRCodeSVG
                      className="traveler-ticket-qr"
                      value={ticket.code_qr}
                      size={112}
                      level="M"
                      includeMargin
                      title={`Billet de ${ticket.nom_passager}`}
                    />
                    <div className="traveler-ticket-card__summary">
                      <p className="traveler-ticket-brand">KINESIS · BILLET DE VOYAGE</p>
                      <h3>
                        {ticket.voyage.ville_depart_nom}
                        <span aria-hidden="true"> → </span>
                        {ticket.voyage.ville_arrivee_nom}
                      </h3>
                      <p className="traveler-ticket-passenger">
                        <UserRound aria-hidden="true" />
                        {ticket.nom_passager} · Siège {ticket.numero_siege}
                      </p>
                      <div className="traveler-ticket-actions">
                        <span
                          className={`traveler-status traveler-status--${ticket.statut.toLowerCase()}`}
                        >
                          {ticket.statut === "EMBARQUE"
                            ? "Embarqué"
                            : ticket.statut === "VALIDE"
                              ? "Valide"
                              : ticket.statut}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            ticketDetail?.id_billet === ticket.id_billet
                              ? setTicketDetail(null)
                              : void showTicketDetails(ticket.id_billet)
                          }
                          disabled={detailLoading === ticket.id_billet}
                        >
                          {detailLoading === ticket.id_billet
                            ? "Chargement…"
                            : "Détails du billet"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="traveler-empty traveler-empty--compact">
                <h3>Vos billets apparaîtront ici</h3>
                <p>Ils sont générés dès que votre paiement est confirmé.</p>
              </div>
            )}
            {ticketPagination}
          </section>
        ) : null}

        {activeTab === "notifications" ? (
          <section className="traveler-notifications" id="notifications" aria-labelledby="notifications-title">
            <div className="traveler-section-heading">
              <div>
                <p className="traveler-eyebrow">INFORMATIONS IMPORTANTES</p>
                <h2 id="notifications-title">
                  <Bell aria-hidden="true" />
                  Mes notifications
                </h2>
              </div>
              <span className="traveler-count">
                {data?.notifications.filter((notification) => !notification.lue).length ?? 0} non lue(s)
              </span>
              {data?.notifications.some((notification) => !notification.lue) ? (
                <button className="traveler-secondary-button" type="button" onClick={() => void markAllNotificationsRead()}>
                  <CheckCircle2 aria-hidden="true" />
                  Tout marquer comme lu
                </button>
              ) : null}
            </div>
            {data?.notifications.length ? (
              <div className="traveler-notification-list">
                {pageNotifications.map((notification) => (
                  <article className={`traveler-notification-card ${notification.lue ? "" : "traveler-notification-card--unread"}`} key={notification.id_notification}>
                    <span className="traveler-notification-dot" aria-hidden="true" />
                    <div className="traveler-notification-copy">
                      <h3>{notification.titre}</h3>
                      <p>{notification.message}</p>
                      <time dateTime={notification.date_creation}>
                        {formatDate(notification.date_creation, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </div>
                    {!notification.lue ? (
                      <button
                        type="button"
                        onClick={() => void markNotificationRead(notification)}
                      >
                        Marquer comme lue
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="traveler-empty traveler-empty--compact">
                <h3>Aucune notification pour le moment</h3>
                <p>Les informations liées à vos réservations et vos voyages apparaîtront ici.</p>
              </div>
            )}
            {notificationPagination}
          </section>
        ) : null}

        {reservationToCancel ? (
          <ConfirmationDialog
            open
            title="Annuler cette réservation ?"
            description={`La réservation ${reservationToCancel.reference} sera annulée. Cette action est définitive et les places associées seront libérées.`}
            confirmLabel="Annuler la réservation"
            tone="danger"
            pending={busyReservation === reservationToCancel.id_reservation}
            onCancel={() => setReservationToCancel(null)}
            onConfirm={async () => {
              await cancelReservation(reservationToCancel.id_reservation);
              setReservationToCancel(null);
            }}
          />
        ) : null}
        {profileDetailOpen ? (
          <ProfileViewDialog
            profile={profile}
            name={displayName}
            avatarClassName="traveler-github-avatar"
            onClose={() => setProfileDetailOpen(false)}
          />
        ) : null}
        {baggageDetail ? (
          <AppDialog
            open
            title={`Détails du bagage · ${baggageDetail.reservation_reference}`}
            className="traveler-details-dialog"
            onClose={() => setBaggageDetail(null)}
          >
            <div className="traveler-detail-panel traveler-baggage-detail">
              <div className="traveler-baggage-detail__summary">
                <span
                  className={`traveler-status traveler-status--${baggageDetail.statut.toLowerCase()}`}
                >
                  {baggageStatusLabels[baggageDetail.statut] ?? baggageDetail.statut}
                </span>
                <strong>{baggageDetail.poids} kg</strong>
                <span>{formatPrice(baggageDetail.frais_total)}</span>
                <small className={baggageDetail.frais_payes ? "is-paid" : "is-due"}>
                  {baggageDetail.frais_payes
                    ? "Frais réglés"
                    : "Frais à régler à la gare"}
                </small>
              </div>
              {baggageDetail.description ? (
                <div className="traveler-baggage-detail__section">
                  <h3>Description</h3>
                  <p>{baggageDetail.description}</p>
                </div>
              ) : null}
              {baggageDetail.photos.length ? (
                <div className="traveler-baggage-detail__section">
                  <h3>Photos du bagage</h3>
                  <div className="traveler-baggage-photos">
                    {baggageDetail.photos.map((photo, index) => (
                      <a
                        href={photo.url}
                        target="_blank"
                        rel="noreferrer"
                        key={photo.id_photobagage}
                      >
                        Photo {index + 1}
                        <ExternalLink aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="traveler-baggage-detail__section">
                <h3>Suivi</h3>
                <dl className="traveler-baggage-detail__fields">
                  <div>
                    <dt>Enregistré le</dt>
                    <dd>
                      {formatDate(baggageDetail.date_creation, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </dd>
                  </div>
                  {baggageDetail.date_paiement_frais ? (
                    <div>
                      <dt>Frais réglés le</dt>
                      <dd>
                        {formatDate(baggageDetail.date_paiement_frais, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </dd>
                    </div>
                  ) : null}
                  {baggageDetail.date_restitution ? (
                    <div>
                      <dt>Restitué le</dt>
                      <dd>
                        {formatDate(baggageDetail.date_restitution, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Enregistré par</dt>
                    <dd>{baggageDetail.enregistre_par_nom ?? "Non renseigné"}</dd>
                  </div>
                  <div>
                    <dt>Paiement confirmé par</dt>
                    <dd>
                      {baggageDetail.paiement_enregistre_par_nom ?? "En attente"}
                    </dd>
                  </div>
                  <div>
                    <dt>Restitué par</dt>
                    <dd>{baggageDetail.restitue_par_nom ?? "Non restitué"}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </AppDialog>
        ) : null}
        {reservationDetail ? (
          <AppDialog
            open
            title="Détails de la réservation"
            className="traveler-details-dialog"
            onClose={() => setReservationDetail(null)}
          >
            <div className="traveler-detail-panel">
              <strong>
                {reservationDetail.voyage.ville_depart_nom} →{" "}
                {reservationDetail.voyage.ville_arrivee_nom}
              </strong>
              <span>Compagnie : {reservationDetail.voyage.compagnie_nom}</span>
              <span>Référence : {reservationDetail.reference}</span>
              <span>
                {reservationDetail.places.length} place
                {reservationDetail.places.length > 1 ? "s" : ""} ·{" "}
                {formatPrice(reservationDetail.montant_total)}
              </span>
              <span>
                Départ le{" "}
                {formatDate(reservationDetail.voyage.date_depart, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                à {reservationDetail.voyage.heure_depart.slice(0, 5)}
              </span>
              <strong>Passagers et sièges</strong>
              <ul>
                {reservationDetail.places.map((place) => (
                  <li key={place.numero_siege}>
                    {place.nom_passager} · Siège {place.numero_siege}
                  </li>
                ))}
              </ul>
              <span>
                Réservée le{" "}
                {formatDate(reservationDetail.date_reservation, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              {reservationDetail.date_expiration ? (
                <span>
                  Expiration du paiement :{" "}
                  {formatDate(reservationDetail.date_expiration, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </div>
          </AppDialog>
        ) : null}
        {ticketDetail ? (
          <AppDialog
            open
            title="Détails du billet"
            className="traveler-details-dialog"
            onClose={() => setTicketDetail(null)}
          >
            <article
              className="traveler-ticket-modal"
              data-print-ticket-card={ticketDetail.id_billet}
            >
              <QRCodeSVG
                className="traveler-ticket-qr"
                value={ticketDetail.code_qr}
                size={180}
                level="M"
                includeMargin
                title={`Billet de ${ticketDetail.nom_passager}`}
              />
              <div className="traveler-detail-panel">
                <strong>
                  {ticketDetail.voyage.ville_depart_nom} →{" "}
                  {ticketDetail.voyage.ville_arrivee_nom}
                </strong>
                <span>
                  Passager : {ticketDetail.nom_passager} · Siège{" "}
                  {ticketDetail.numero_siege}
                </span>
                <span>
                  Départ le{" "}
                  {formatDate(ticketDetail.voyage.date_depart, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  à {ticketDetail.voyage.heure_depart.slice(0, 5)}
                </span>
                <span>Code du billet : {ticketDetail.code_billet}</span>
                <span>Réservation : {ticketDetail.reservation_reference}</span>
                <span>
                  Statut :{" "}
                  {ticketDetail.statut === "EMBARQUE" ? "Embarqué" : "Valide"}
                </span>
                {ticketDetail.date_creation ? (
                  <span>
                    Émis le{" "}
                    {formatDate(ticketDetail.date_creation, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : null}
                {ticketDetail.date_embarquement ? (
                  <span>
                    Embarquement confirmé le{" "}
                    {formatDate(ticketDetail.date_embarquement, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : null}
              </div>
              <button
                className="traveler-ticket-download"
                type="button"
                title="Choisissez « Enregistrer au format PDF » dans la fenêtre d’impression."
                onClick={() => downloadTicket(ticketDetail)}
              >
                <Download aria-hidden="true" size={15} />
                Télécharger le billet
              </button>
            </article>
          </AppDialog>
        ) : null}
        </div>
      </main>

    </div>
  );
}
