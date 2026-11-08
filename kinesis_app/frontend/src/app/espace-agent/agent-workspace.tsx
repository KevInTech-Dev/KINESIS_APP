"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  BusFront,
  ExternalLink,
  ImagePlus,
  LayoutDashboard,
  Luggage,
  Plus,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import ConfirmationDialog, {
  type ConfirmationTone,
} from "@/components/confirmation-dialog";
import KinesisLoader from "@/components/kinesis-loader";
import { useListPagination } from "@/components/list-pagination";
import ProfileAvatar from "@/components/profile-avatar";
import PasswordInput from "@/components/password-input";
import TicketQrScanner from "@/components/ticket-qr-scanner";
import RoleWorkspaceShell, {
  type RoleWorkspaceItem,
} from "@/components/role-workspace-shell";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

const PERMISSIONS = {
  registerBaggage: "ENREGISTRER_BAGAGE",
  scanTicket: "SCANNER_BILLET",
  validateBoarding: "VALIDER_EMBARQUEMENT",
  consultBaggage: "CONSULTER_BAGAGES",
  returnBaggage: "RESTITUER_BAGAGE",
} as const;

type Tab = "overview" | "scan" | "boarding" | "baggage" | "notifications";
type Trip = {
  id_voyage: string;
  ville_depart_nom: string;
  ville_arrivee_nom: string;
  date_depart: string;
  heure_depart: string;
  date_depart_effective: string | null;
  statut: string;
};
type Ticket = {
  id_billet: string;
  reservation_reference: string;
  nom_passager: string;
  numero_siege: string;
  voyage: Trip;
  code_billet: string;
  statut: string;
  date_creation: string;
  date_embarquement: string | null;
};
type Reservation = {
  id_reservation: string;
  reference: string;
  statut: string;
  voyage: Trip;
  places: { id_place: string; numero_siege: string; nom_passager: string }[];
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
  enregistre_par_nom: string | null;
  paiement_enregistre_par_nom: string | null;
  restitue_par_nom: string | null;
  photos: { id_photobagage: string; url: string; created_at: string }[];
};
type Notification = {
  id_notification: string;
  type: string;
  titre: string;
  message: string;
  lue: boolean;
  date_lecture: string | null;
  date_creation: string;
};
type ScanResult = {
  id_billet: string;
  reservation_reference: string;
  nom_passager: string;
  numero_siege: string;
  code_billet: string;
  statut: string;
  date_embarquement: string | null;
  voyage: {
    compagnie: string;
    ville_depart: string;
    ville_arrivee: string;
    date_depart: string;
    heure_depart: string;
  };
};
type Feedback = { kind: "success" | "error"; message: string };
type ConfirmationRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: ConfirmationTone;
  action: () => Promise<void>;
};
type TabDefinition = { id: Tab; label: string };

const TABS: TabDefinition[] = [
  { id: "overview", label: "Accueil" },
  { id: "scan", label: "Billets" },
  { id: "boarding", label: "Embarquement" },
  { id: "baggage", label: "Bagages" },
  { id: "notifications", label: "Notifications" },
];
const TAB_ICONS: Record<Tab, LucideIcon> = {
  overview: LayoutDashboard,
  scan: ScanLine,
  boarding: BusFront,
  baggage: Luggage,
  notifications: Bell,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function listFrom<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): T[] {
  let items: unknown[] | null = null;
  if (Array.isArray(value)) items = value;
  else if (isRecord(value) && Array.isArray(value.results)) {
    items = value.results;
  }
  if (!items || !items.every(guard)) {
    throw new Error("Le format des données reçu de l’API est invalide.");
  }
  return items;
}

function isTrip(value: unknown): value is Trip {
  return (
    isRecord(value) &&
    typeof value.id_voyage === "string" &&
    typeof value.ville_depart_nom === "string" &&
    typeof value.ville_arrivee_nom === "string" &&
    typeof value.date_depart === "string" &&
    typeof value.heure_depart === "string" &&
    (typeof value.date_depart_effective === "string" ||
      value.date_depart_effective === null) &&
    typeof value.statut === "string"
  );
}

function isTicket(value: unknown): value is Ticket {
  return (
    isRecord(value) &&
    typeof value.id_billet === "string" &&
    typeof value.reservation_reference === "string" &&
    typeof value.nom_passager === "string" &&
    typeof value.numero_siege === "string" &&
    isTrip(value.voyage) &&
    typeof value.code_billet === "string" &&
    typeof value.statut === "string" &&
    typeof value.date_creation === "string" &&
    (typeof value.date_embarquement === "string" ||
      value.date_embarquement === null)
  );
}

function isReservation(value: unknown): value is Reservation {
  return (
    isRecord(value) &&
    typeof value.id_reservation === "string" &&
    typeof value.reference === "string" &&
    typeof value.statut === "string" &&
    isTrip(value.voyage) &&
    Array.isArray(value.places) &&
    value.places.every(
      (place) =>
        isRecord(place) &&
        typeof place.id_place === "string" &&
        typeof place.numero_siege === "string" &&
        typeof place.nom_passager === "string",
    )
  );
}

function isBaggage(value: unknown): value is Baggage {
  return (
    isRecord(value) &&
    typeof value.id_bagage === "string" &&
    typeof value.reservation === "string" &&
    typeof value.reservation_reference === "string" &&
    typeof value.description === "string" &&
    (typeof value.poids === "string" || typeof value.poids === "number") &&
    (typeof value.frais_total === "string" ||
      typeof value.frais_total === "number") &&
    typeof value.frais_payes === "boolean" &&
    typeof value.statut === "string" &&
    typeof value.date_creation === "string" &&
    (typeof value.enregistre_par_nom === "string" ||
      value.enregistre_par_nom === null) &&
    (typeof value.paiement_enregistre_par_nom === "string" ||
      value.paiement_enregistre_par_nom === null) &&
    (typeof value.restitue_par_nom === "string" ||
      value.restitue_par_nom === null) &&
    Array.isArray(value.photos) &&
    value.photos.every(
      (photo) =>
        isRecord(photo) &&
        typeof photo.id_photobagage === "string" &&
        typeof photo.url === "string" &&
        typeof photo.created_at === "string",
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
    (typeof value.date_lecture === "string" || value.date_lecture === null) &&
    typeof value.date_creation === "string"
  );
}

function isScanResult(value: unknown): value is ScanResult {
  return (
    isRecord(value) &&
    typeof value.id_billet === "string" &&
    typeof value.reservation_reference === "string" &&
    typeof value.nom_passager === "string" &&
    typeof value.numero_siege === "string" &&
    typeof value.code_billet === "string" &&
    typeof value.statut === "string" &&
    (typeof value.date_embarquement === "string" ||
      value.date_embarquement === null) &&
    isRecord(value.voyage) &&
    typeof value.voyage.compagnie === "string" &&
    typeof value.voyage.ville_depart === "string" &&
    typeof value.voyage.ville_arrivee === "string" &&
    typeof value.voyage.date_depart === "string" &&
    typeof value.voyage.heure_depart === "string"
  );
}

function apiMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = apiMessage(item);
      if (message) return message;
    }
  }
  if (isRecord(value)) {
    if ("detail" in value) {
      const detail = apiMessage(value.detail);
      if (detail) return detail;
    }
    for (const child of Object.values(value)) {
      const message = apiMessage(child);
      if (message) return message;
    }
  }
  return null;
}

async function requestAgentApi(
  resource: string,
  method = "GET",
  payload?: FormData | Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`/api/agent/${resource}`, {
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
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      apiMessage(data) ?? `La requête a échoué (${response.status}).`,
    );
  }
  return data;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPrice(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`
    : `${value} FCFA`;
}

function statusLabel(status: string) {
  return (
    {
      VALIDE: "Billet valide",
      EMBARQUE: "Embarqué",
      NON_UTILISE: "Non utilisé",
      PAYEE: "Payée",
      ANNULEE: "Annulée",
      EN_ATTENTE_PAIEMENT: "En attente de paiement",
      EXPIREE: "Expirée",
      ENREGISTRE: "Enregistré",
      RESTITUE: "Restitué",
      PUBLIE: "Publié",
      ARCHIVE: "Archivé",
    }[status] ?? status
  );
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function AgentWorkspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [baggages, setBaggages] = useState<Baggage[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState("");
  const [baggagePhotoSlots, setBaggagePhotoSlots] = useState<(string | null)[]>([
    null,
  ]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(null);
  const [confirmation, setConfirmation] =
    useState<ConfirmationRequest | null>(null);
  const { pageItems: pageTrips, pagination: tripPagination } =
    useListPagination(trips);
  const { pageItems: pageTickets, pagination: ticketPagination } =
    useListPagination(tickets);
  const { pageItems: pageBaggages, pagination: baggagePagination } =
    useListPagination(baggages, 5);
  const { pageItems: pageNotifications, pagination: notificationPagination } =
    useListPagination(notifications);

  const permissions = profile?.agent_permissions ?? [];
  const canScan = permissions.includes(PERMISSIONS.scanTicket);
  const canBoard =
    canScan && permissions.includes(PERMISSIONS.validateBoarding);
  const canRegisterBaggage = permissions.includes(PERMISSIONS.registerBaggage);
  const canConsultBaggage = permissions.includes(PERMISSIONS.consultBaggage);
  const canReturnBaggage = permissions.includes(PERMISSIONS.returnBaggage);
  const tabs = useMemo(
    () =>
      TABS.filter((item) => {
        if (item.id === "scan") return canScan;
        if (item.id === "boarding") return canBoard;
        if (item.id === "baggage") {
          return canRegisterBaggage || canConsultBaggage || canReturnBaggage;
        }
        return true;
      }),
    [canBoard, canConsultBaggage, canRegisterBaggage, canReturnBaggage, canScan],
  );
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "overview";
  function selectTab(nextTab: string) {
    const item = tabs.find((candidate) => candidate.id === nextTab);
    if (!item) return;
    setTab(item.id);
    setError(null);
  }

  const loadWorkspace = useCallback(async () => {
    setError(null);
    try {
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const sessionData: unknown = await sessionResponse.json().catch(() => null);
      if (!sessionResponse.ok || !isUserProfile(sessionData)) {
        setRedirecting(true);
        router.replace("/connexion?next=%2Fespace-agent");
        return;
      }
      if (sessionData.role !== "AGENT_COMPAGNIE") {
        setRedirecting(true);
        router.replace(
          sessionData.role === "COMPAGNIE"
            ? "/espace-compagnie"
            : "/espace-voyageur",
        );
        return;
      }
      setProfile(sessionData);
      if (sessionData.must_change_password) {
        setTrips([]);
        setTickets([]);
        setReservations([]);
        setBaggages([]);
        setNotifications([]);
        return;
      }

      const agentPermissions = sessionData.agent_permissions ?? [];
      const canListBaggages =
        agentPermissions.includes(PERMISSIONS.consultBaggage) ||
        agentPermissions.includes(PERMISSIONS.returnBaggage);
      const canListReservations =
        agentPermissions.includes(PERMISSIONS.registerBaggage);
      const canListTrips =
        agentPermissions.includes(PERMISSIONS.scanTicket) &&
        agentPermissions.includes(PERMISSIONS.validateBoarding);
      const [tripData, ticketData, reservationData, baggageData, notificationData] =
        await Promise.all([
          canListTrips
            ? requestAgentApi("voyages?page_size=100")
            : Promise.resolve({ results: [] }),
          agentPermissions.includes(PERMISSIONS.validateBoarding)
            ? requestAgentApi("billets?page_size=100")
            : Promise.resolve({ results: [] }),
          canListReservations
            ? requestAgentApi("reservations?page_size=100")
            : Promise.resolve({ results: [] }),
          canListBaggages
            ? requestAgentApi("bagages?page_size=100")
            : Promise.resolve({ results: [] }),
          requestAgentApi("notifications?page_size=100"),
        ]);
      setTrips(listFrom(tripData, isTrip));
      setTickets(listFrom(ticketData, isTicket));
      setReservations(listFrom(reservationData, isReservation));
      setBaggages(listFrom(baggageData, isBaggage));
      setNotifications(listFrom(notificationData, isNotification));
    } catch (loadError) {
      console.error("Agent workspace loading failed", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger votre espace agent.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void Promise.resolve().then(loadWorkspace);
  }, [loadWorkspace]);

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    setPasswordFeedback(null);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_password: formData.get("old_password"),
          new_password: formData.get("new_password"),
          password_confirmation: formData.get("password_confirmation"),
        }),
      });
      const result: unknown =
        response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        setPasswordFeedback({
          kind: "error",
          message:
            apiMessage(result) ??
            "Le changement a échoué. Vérifiez le mot de passe et réessayez.",
        });
        return;
      }
      form.reset();
      toast.success("Mot de passe modifié. Chargement de vos accès agent…");
      setLoading(true);
      await loadWorkspace();
    } catch (changeError) {
      console.error("Agent password change failed", changeError);
      setPasswordFeedback({
        kind: "error",
        message:
          changeError instanceof Error
            ? changeError.message
            : "Le serveur est inaccessible.",
      });
    } finally {
      setSaving(false);
    }
  }

  const verifyScan = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setScanCode(code);
    setSaving(true);
    setError(null);
    setScanResult(null);
    try {
      const result = await requestAgentApi("scan", "POST", {
        code_qr: code.trim(),
      });
      if (!isScanResult(result)) {
        throw new Error("Les informations du billet scanné sont invalides.");
      }
      setScanResult(result);
      toast.info("Billet valide. Vérifiez le voyageur avant de confirmer l’embarquement.");
    } catch (scanError) {
      toast.error(
        scanError instanceof Error
          ? scanError.message
          : "Impossible de vérifier ce billet.",
      );
    } finally {
      setSaving(false);
    }
  }, []);

  async function submitScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await verifyScan(scanCode);
  }

  async function confirmBoarding() {
    setSaving(true);
    setError(null);
    try {
      const result = await requestAgentApi("embarquement", "POST", {
        code_qr: scanCode.trim(),
      });
      if (!isScanResult(result)) {
        throw new Error("La confirmation d’embarquement reçue est invalide.");
      }
      setScanResult(result);
      toast.success(`Embarquement confirmé pour ${result.nom_passager}.`);
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id_billet === result.id_billet
            ? { ...ticket, statut: result.statut, date_embarquement: result.date_embarquement }
            : ticket,
        ),
      );
    } catch (boardingError) {
      toast.error(
        boardingError instanceof Error
          ? boardingError.message
          : "Impossible de confirmer l’embarquement.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function declareDeparture(trip: Trip) {
    setSaving(true);
    setError(null);
    try {
      const result = await requestAgentApi(
        `voyages/${trip.id_voyage}/depart`,
        "POST",
      );
      if (!isRecord(result) || typeof result.date_depart_effective !== "string") {
        throw new Error("La confirmation de départ reçue est invalide.");
      }
      setTrips((current) =>
        current.map((item) =>
          item.id_voyage === trip.id_voyage
            ? { ...item, date_depart_effective: result.date_depart_effective as string }
            : item,
        ),
      );
      toast.success(
        `Départ enregistré. ${typeof result.billets_non_utilises === "number" ? result.billets_non_utilises : 0} billet(s) non utilisés.`,
      );
    } catch (departureError) {
      toast.error(
        departureError instanceof Error
          ? departureError.message
          : "Impossible d’enregistrer le départ.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function registerBaggage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const photos = formData
      .getAll("photos")
      .filter((item): item is File => item instanceof File && item.size > 0);
    if (photos.length < 1 || photos.length > 5) {
      toast.warning("Ajoutez de 1 à 5 photos pour le bagage.");
      return;
    }
    if (photos.some((photo) => photo.size > 5 * 1024 * 1024)) {
      toast.warning("Chaque photo doit faire 5 Mo maximum.");
      return;
    }
    formData.delete("photos");
    for (const photo of photos) formData.append("photos", photo);
    setSaving(true);
    setError(null);
    try {
      const result = await requestAgentApi("bagages", "POST", formData);
      if (!isBaggage(result)) {
        throw new Error("Les informations du bagage enregistré sont invalides.");
      }
      form.reset();
      setBaggagePhotoSlots([null]);
      toast.success(
        `Bagage enregistré pour ${result.reservation_reference}. Frais : ${formatPrice(result.frais_total)}.`,
      );
      setBaggages((current) => [result, ...current]);
      if (canRegisterBaggage && !reservations.some((item) => item.id_reservation === result.reservation)) {
        await loadWorkspace();
      }
    } catch (baggageError) {
      toast.error(
        baggageError instanceof Error
          ? baggageError.message
          : "Impossible d’enregistrer le bagage.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function markFeePaid(baggage: Baggage) {
    setSaving(true);
    setError(null);
    try {
      const result = await requestAgentApi(
        `bagages/${baggage.id_bagage}/paiement-frais`,
        "POST",
      );
      if (!isBaggage(result)) throw new Error("La réponse du serveur est invalide.");
      setBaggages((current) =>
        current.map((item) => (item.id_bagage === result.id_bagage ? result : item)),
      );
      toast.success(`Paiement des frais enregistré pour ${result.reservation_reference}.`);
    } catch (feeError) {
      toast.error(
        feeError instanceof Error ? feeError.message : "Impossible d’enregistrer le paiement.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function returnBaggage(baggage: Baggage) {
    setSaving(true);
    setError(null);
    try {
      const result = await requestAgentApi(
        `bagages/${baggage.id_bagage}/restitution`,
        "POST",
      );
      if (!isBaggage(result)) throw new Error("La réponse du serveur est invalide.");
      setBaggages((current) =>
        current.map((item) => (item.id_bagage === result.id_bagage ? result : item)),
      );
      toast.success(`Bagage ${result.reservation_reference} restitué.`);
    } catch (returnError) {
      toast.error(
        returnError instanceof Error ? returnError.message : "Impossible de restituer le bagage.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function markNotificationRead(notification: Notification) {
    if (notification.lue) return;
    setSaving(true);
    setError(null);
    try {
      const result = await requestAgentApi(
        `notifications/${notification.id_notification}/lire`,
        "POST",
      );
      if (!isNotification(result)) throw new Error("La notification reçue est invalide.");
      setNotifications((current) =>
        current.map((item) =>
          item.id_notification === result.id_notification ? result : item,
        ),
      );
    } catch (notificationError) {
      setError(
        notificationError instanceof Error
          ? notificationError.message
          : "Impossible de marquer la notification comme lue.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function markAllNotificationsRead() {
    setSaving(true);
    setError(null);
    try {
      await requestAgentApi("notifications/lire-tout", "POST");
      setNotifications((current) =>
        current.map((item) =>
          item.lue ? item : { ...item, lue: true, date_lecture: new Date().toISOString() },
        ),
      );
    } catch (notificationError) {
      setError(
        notificationError instanceof Error
          ? notificationError.message
          : "Impossible de mettre à jour les notifications.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    try {
      const response = await fetch("/api/auth/deconnexion", { method: "POST" });
      if (!response.ok) throw new Error("La déconnexion n’a pas abouti.");
      router.push("/");
      router.refresh();
    } catch (logoutError) {
      console.error("Agent logout failed", logoutError);
      toast.error(
        logoutError instanceof Error ? logoutError.message : "Impossible de fermer la session.",
      );
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.lue).length;
  const availableReservations = reservations.filter((reservation) => reservation.statut === "PAYEE");
  const workspaceItems: RoleWorkspaceItem[] = [
    ...tabs.map((item) => ({
      id: item.id,
      label: item.label,
      icon: TAB_ICONS[item.id],
      group: item.id === "notifications" ? "account" as const : "operations" as const,
      ...(item.id === "notifications" && unreadCount > 0
        ? { badge: unreadCount }
        : {}),
    })),
    { id: "website", label: "Voir le site", icon: ExternalLink, href: "/", group: "account" },
  ];

  if (loading || redirecting) {
    return <KinesisLoader message="Chargement de votre espace agent…" />;
  }

  if (!profile) {
    return (
      <main className="agent-loading">
        <section className="agent-error-card">
          <h1>Votre espace n’est pas disponible</h1>
          <p>{error ?? "Vérifiez votre connexion puis réessayez."}</p>
          <button type="button" className="agent-button" onClick={() => void loadWorkspace()}>
            Réessayer
          </button>
          <Link href="/connexion">Retour à la connexion</Link>
        </section>
      </main>
    );
  }

  if (profile.must_change_password) {
    return (
      <main className="agent-password-page">
        <Link className="agent-brand" href="/" aria-label="Kinesis, accueil">
          <Image src="/kinesis-mark.png" width={44} height={44} alt="" priority />
          <span>KINESIS</span>
        </Link>
        <section className="agent-password-card">
          <span className="agent-password-icon" aria-hidden="true">!</span>
          <p className="agent-eyebrow">PREMIÈRE CONNEXION</p>
          <h1>Choisissez votre mot de passe personnel</h1>
          <p>
            Votre compagnie vous a attribué un mot de passe provisoire. Changez-le
            pour sécuriser votre compte et accéder aux outils qui vous sont autorisés.
          </p>
          <form className="agent-form" onSubmit={submitPasswordChange}>
            <label>
              <span>Mot de passe provisoire</span>
              <PasswordInput name="old_password" autoComplete="current-password" required />
            </label>
            <label>
              <span>Nouveau mot de passe</span>
              <PasswordInput name="new_password" autoComplete="new-password" minLength={8} required />
            </label>
            <label>
              <span>Confirmer le nouveau mot de passe</span>
              <PasswordInput name="password_confirmation" autoComplete="new-password" minLength={8} required />
            </label>
            {passwordFeedback ? (
              <p className={`agent-feedback agent-feedback--${passwordFeedback.kind}`} role="status">
                {passwordFeedback.message}
              </p>
            ) : null}
            <button type="submit" className="agent-button" disabled={saving}>
              {saving ? "Mise à jour…" : "Sécuriser mon compte"}
            </button>
          </form>
          <button type="button" className="agent-link-button" onClick={() => void logout()}>
            Se déconnecter
          </button>
        </section>
      </main>
    );
  }

  return (
    <RoleWorkspaceShell
      eyebrow="ESPACE AGENT"
      title={tabs.find((item) => item.id === activeTab)?.label ?? "Accueil"}
      profile={profile}
      activeId={activeTab}
      items={workspaceItems}
      notificationCount={unreadCount}
      onSelect={selectTab}
      onNotificationsClick={() => selectTab("notifications")}
      onProfileUpdated={setProfile}
      onLogout={() => void logout()}
    >
      <div className="agent-workspace-content">

        {error ? <p className="agent-alert agent-alert--error" role="alert">{error}</p> : null}

        {activeTab === "overview" ? (
          <div className="agent-content agent-overview-layout">
            <aside className="agent-overview-profile">
              <ProfileAvatar
                className="agent-overview-avatar"
                fallbackClassName="agent-overview-avatar--fallback"
                src={profile.photo_profil}
                name={[profile.prenoms, profile.nom].filter(Boolean).join(" ")}
                size={260}
                alt={`Photo de ${[profile.prenoms, profile.nom].filter(Boolean).join(" ")}`}
              />
              <h2>{[profile.prenoms, profile.nom].filter(Boolean).join(" ") || "Agent KINESIS"}</h2>
              <p className="agent-overview-email">{profile.email}</p>
              {profile.compagnie_nom ? (
                <p className="agent-overview-company">{profile.compagnie_nom}</p>
              ) : null}
              {canScan ? (
                <button
                  type="button"
                  className="agent-overview-primary"
                  onClick={() => selectTab("scan")}
                >
                  Vérifier un billet
                </button>
              ) : null}
              <p className="agent-overview-role">Agent de compagnie</p>
            </aside>

            <div className="agent-overview-main">
              <section className="agent-overview-stats" aria-label="Résumé des opérations">
                {canBoard ? (
                  <article className="agent-overview-stat">
                    <span>Billets à traiter</span>
                    <strong>{tickets.filter((ticket) => ticket.statut === "VALIDE").length}</strong>
                    <small>Billets valides à embarquer</small>
                  </article>
                ) : null}
                {canConsultBaggage ? (
                  <article className="agent-overview-stat">
                    <span>Bagages enregistrés</span>
                    <strong>{baggages.length}</strong>
                    <small>{baggages.filter((baggage) => !baggage.frais_payes).length} frais à percevoir</small>
                  </article>
                ) : null}
                {canRegisterBaggage ? (
                  <article className="agent-overview-stat">
                    <span>Réservations payées</span>
                    <strong>{availableReservations.length}</strong>
                    <small>Éligibles à l’enregistrement d’un bagage</small>
                  </article>
                ) : null}
                <article className="agent-overview-stat">
                  <span>Notifications non lues</span>
                  <strong>{unreadCount}</strong>
                  <small>Informations de votre compagnie</small>
                </article>
              </section>

              <section className="agent-overview-panel">
                <div className="agent-overview-panel-heading">
                  <div>
                    <h3>Outils qui vous sont attribués</h3>
                    <p>Accédez rapidement aux opérations autorisées par votre compagnie.</p>
                  </div>
                </div>
                <div className="agent-overview-tools">
                  {tabs
                    .filter((item) => item.id !== "overview")
                    .map((item) => {
                      const Icon = TAB_ICONS[item.id];
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => selectTab(item.id)}
                        >
                          <span className="agent-overview-tool-icon"><Icon aria-hidden="true" /></span>
                          <span>
                            <strong>{item.label}</strong>
                            <small>
                              {item.id === "scan"
                                ? "Contrôler un billet et son QR code"
                                : item.id === "boarding"
                                  ? "Suivre les départs et l’embarquement"
                                  : item.id === "baggage"
                                    ? "Enregistrer et suivre les bagages"
                                    : "Consulter les messages reçus"}
                            </small>
                          </span>
                        </button>
                      );
                    })}
                </div>
              </section>

              <section className="agent-overview-panel agent-overview-permissions">
                <div className="agent-overview-panel-heading">
                  <div>
                    <h3>Vos autorisations</h3>
                    <p>Les accès disponibles sur votre compte agent.</p>
                  </div>
                </div>
                <div className="agent-access-list">
                  {permissions.map((permission) => (
                    <span className="agent-access-tag" key={permission}>{permissionLabel(permission)}</span>
                  ))}
                  {permissions.length === 0 ? (
                    <p>Aucune permission opérationnelle n’a été attribuée. Contactez votre compagnie.</p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {activeTab === "scan" ? (
          <div className="agent-content agent-content--narrow">
            <section className="agent-panel">
              <div className="agent-panel-heading">
                <div><h2>Vérifier un billet</h2><p>Scannez le QR code avec la caméra ou saisissez son code manuellement.</p></div>
              </div>
              <TicketQrScanner onDetected={(code) => void verifyScan(code)} />
              <form className="agent-scan-form" onSubmit={submitScan}>
                <label>
                  <span>Code du billet / contenu du QR code (saisie manuelle)</span>
                  <input value={scanCode} onChange={(event) => setScanCode(event.target.value)} autoComplete="off" autoFocus required placeholder="Placez le curseur ici puis scannez…" />
                </label>
                <button className="agent-button" type="submit" disabled={saving || !scanCode.trim()}>
                  {saving ? "Vérification…" : "Vérifier le billet"}
                </button>
              </form>
              {scanResult ? (
                <article className={`agent-scan-result ${scanResult.statut === "EMBARQUE" ? "agent-scan-result--used" : ""}`}>
                  <div className="agent-scan-result-heading">
                    <span className="agent-scan-check">{scanResult.statut === "VALIDE" ? "✓" : "!"}</span>
                    <div><strong>{statusLabel(scanResult.statut)}</strong><span>Réservation {scanResult.reservation_reference}</span></div>
                  </div>
                  <div className="agent-scan-details">
                    <p><span>Passager</span><strong>{scanResult.nom_passager}</strong></p>
                    <p><span>Siège</span><strong>{scanResult.numero_siege}</strong></p>
                    <p><span>Trajet</span><strong>{scanResult.voyage.ville_depart} → {scanResult.voyage.ville_arrivee}</strong></p>
                    <p><span>Départ</span><strong>{formatDate(scanResult.voyage.date_depart)} · {scanResult.voyage.heure_depart.slice(0, 5)}</strong></p>
                  </div>
                  {canBoard && scanResult.statut === "VALIDE" ? (
                    <button className="agent-button" type="button" disabled={saving} onClick={() => void confirmBoarding()}>
                      {saving ? "Confirmation…" : "Confirmer l’embarquement"}
                    </button>
                  ) : null}
                </article>
              ) : null}
            </section>
            {canBoard ? (
              <section className="agent-panel">
                <div className="agent-panel-heading"><div><h2>Billets récents</h2><p>La liste ne révèle jamais le code QR secret.</p></div></div>
                {tickets.length ? <div className="agent-ticket-list">{pageTickets.map((ticket) => <TicketRow key={ticket.id_billet} ticket={ticket} />)}</div> : <p className="agent-empty">Aucun billet n’est encore associé aux trajets de votre compagnie.</p>}
                {ticketPagination}
              </section>
            ) : null}
          </div>
        ) : null}

        {activeTab === "boarding" ? (
          <div className="agent-content">
            <section className="agent-panel">
              <div className="agent-panel-heading"><div><h2>Départs de la compagnie</h2><p>Le départ réel ne peut être enregistré qu’à partir de la date prévue.</p></div></div>
              {trips.length ? (
                <div className="agent-trip-list">{pageTrips.map((trip) => (
                  <article className="agent-trip-row" key={trip.id_voyage}>
                    <div className="agent-trip-details">
                      <strong>{trip.ville_depart_nom} <span aria-hidden="true">→</span> {trip.ville_arrivee_nom}</strong>
                      <span>{formatDate(trip.date_depart)} · {trip.heure_depart.slice(0, 5)}</span>
                      <span className={`agent-status ${trip.date_depart_effective ? "agent-status--done" : ""}`}>{trip.date_depart_effective ? `Départ enregistré · ${formatDateTime(trip.date_depart_effective)}` : statusLabel(trip.statut)}</span>
                    </div>
                    {!trip.date_depart_effective && trip.statut !== "ANNULEE" && trip.date_depart <= todayString() ? (
                      <button type="button" className="agent-button agent-button--small" disabled={saving} onClick={() => setConfirmation({ title: "Enregistrer le départ réel ?", description: `Confirmez le départ du trajet ${trip.ville_depart_nom} → ${trip.ville_arrivee_nom}. Les billets non embarqués seront invalidés.`, confirmLabel: "Enregistrer le départ", tone: "danger", action: () => declareDeparture(trip) })}>Enregistrer le départ</button>
                    ) : null}
                  </article>
                ))}</div>
              ) : <p className="agent-empty">Aucun trajet n’est disponible pour votre compagnie.</p>}
              {tripPagination}
            </section>
            <section className="agent-panel">
              <div className="agent-panel-heading"><div><h2>Billets et embarquement</h2><p>Un billet doit être vérifié avant de valider l’embarquement.</p></div><button className="agent-text-button" type="button" onClick={() => setTab("scan")}>Vérifier un billet →</button></div>
              {tickets.length ? <div className="agent-ticket-list">{pageTickets.map((ticket) => <TicketRow key={ticket.id_billet} ticket={ticket} />)}</div> : <p className="agent-empty">Aucun billet à afficher.</p>}
              {ticketPagination}
            </section>
          </div>
        ) : null}

        {activeTab === "baggage" ? (
          <div className="agent-content agent-content--split">
            {canRegisterBaggage ? (
              <section className="agent-panel">
                <div className="agent-panel-heading"><div><h2>Enregistrer un bagage</h2><p>Réservation payée et au moins une photo obligatoires.</p></div></div>
                <form className="agent-form" onSubmit={registerBaggage}>
                  <label><span>Réservation du voyageur</span><select name="reservation_id" required defaultValue=""><option value="" disabled>Choisir une réservation payée</option>{availableReservations.map((reservation) => <option value={reservation.id_reservation} key={reservation.id_reservation}>{reservation.reference} · {reservation.voyage.ville_depart_nom} → {reservation.voyage.ville_arrivee_nom}</option>)}</select></label>
                  <label><span>Poids (kg)</span><input name="poids" type="number" min="0" step="1" required /></label>
                  <label><span>Description <small>(facultative)</small></span><textarea name="description" rows={3} /></label>
                  <div className="agent-baggage-photo-field">
                    <div className="agent-baggage-photo-field__heading">
                      <span>Photos du bagage <small>1 à 5 photos obligatoires</small></span>
                      <span>{baggagePhotoSlots.filter(Boolean).length}/5</span>
                    </div>
                    <div className="agent-baggage-photo-inputs">
                      {baggagePhotoSlots.map((fileName, index) => (
                        <label className="agent-baggage-photo-input" key={index}>
                          <input
                            name="photos"
                            type="file"
                            accept="image/*"
                            required={index === 0}
                            onChange={(event) =>
                              setBaggagePhotoSlots((current) =>
                                current.map((name, slotIndex) =>
                                  slotIndex === index
                                    ? event.target.files?.[0]?.name ?? null
                                    : name,
                                ),
                              )
                            }
                          />
                          <span className="agent-baggage-photo-input__icon">
                            <ImagePlus aria-hidden="true" size={18} />
                          </span>
                          <span className="agent-baggage-photo-input__copy">
                            <strong>
                              {fileName ?? `Choisir une photo ${index + 1}`}
                            </strong>
                            <small>
                              {fileName
                                ? "Photo prête à être enregistrée"
                                : index === 0
                                  ? "Obligatoire · JPG, PNG ou WEBP"
                                  : "Facultative · JPG, PNG ou WEBP"}
                            </small>
                          </span>
                          <span className="agent-baggage-photo-input__action">
                            {fileName ? "Modifier" : "Parcourir"}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="agent-baggage-photo-field__actions">
                      {baggagePhotoSlots.length < 5 ? (
                        <button
                          type="button"
                          className="agent-baggage-add-photo"
                          onClick={() =>
                            setBaggagePhotoSlots((current) => [...current, null])
                          }
                        >
                          <Plus aria-hidden="true" size={15} />
                          Ajouter une photo
                        </button>
                      ) : null}
                      {baggagePhotoSlots.length > 1 ? (
                        <button
                          type="button"
                          className="agent-baggage-remove-photo"
                          onClick={() =>
                            setBaggagePhotoSlots((current) => current.slice(0, -1))
                          }
                        >
                          Retirer la dernière
                        </button>
                      ) : null}
                      <small>Images uniquement · 5 Mo maximum par photo</small>
                    </div>
                  </div>
                  <details className="agent-special-fee">
                    <summary>Poids hors grille tarifaire ?</summary>
                    <p>À renseigner uniquement si aucun tarif de la compagnie ne couvre ce poids.</p>
                    <label><span>Frais spéciaux (FCFA)</span><input name="frais_special" type="number" min="0" step="1" /></label>
                    <label><span>Motif du tarif spécial</span><input name="motif_tarif_special" maxLength={255} /></label>
                  </details>
                  <button type="submit" className="agent-button" disabled={saving || availableReservations.length === 0}>
                    {saving ? "Enregistrement…" : availableReservations.length ? "Enregistrer le bagage" : "Aucune réservation payée"}
                  </button>
                </form>
              </section>
            ) : null}
            {canRegisterBaggage || canConsultBaggage || canReturnBaggage ? (
              <section className="agent-panel">
                <div className="agent-panel-heading"><div><h2>Suivi des bagages</h2><p>Bagages enregistrés pour les voyages de votre compagnie.</p></div></div>
                {baggages.length ? (
                  <div className="agent-baggage-list">{pageBaggages.map((baggage) => (
                    <article className="agent-baggage-card" key={baggage.id_bagage}>
                      <div className="agent-baggage-heading">
                        <div><strong>Réservation {baggage.reservation_reference}</strong><span>{baggage.poids} kg · {formatPrice(baggage.frais_total)}</span></div>
                        <span className={`agent-status ${baggage.statut === "RESTITUE" ? "agent-status--done" : ""}`}>{statusLabel(baggage.statut)}</span>
                      </div>
                      {baggage.description ? <p>{baggage.description}</p> : null}
                      <div className="agent-baggage-actors" aria-label="Historique de gestion">
                        <div className="agent-baggage-actor">
                          <span>Enregistré par</span>
                          <strong>{baggage.enregistre_par_nom ?? "Non renseigné"}</strong>
                        </div>
                        <div className="agent-baggage-actor">
                          <span>Paiement confirmé par</span>
                          <strong>{baggage.paiement_enregistre_par_nom ?? "En attente"}</strong>
                        </div>
                        <div className="agent-baggage-actor">
                          <span>Restitué par</span>
                          <strong>{baggage.restitue_par_nom ?? "Non restitué"}</strong>
                        </div>
                      </div>
                      <div className="agent-baggage-photos">{baggage.photos.map((photo) => <a href={photo.url} target="_blank" rel="noreferrer" key={photo.id_photobagage}>Voir la photo</a>)}</div>
                      {!baggage.frais_payes && canRegisterBaggage ? <button className="agent-button agent-button--small" type="button" disabled={saving} onClick={() => setConfirmation({ title: "Confirmer le paiement en espèces ?", description: `Confirmez avoir reçu ${formatPrice(baggage.frais_total)} pour les frais du bagage de la réservation ${baggage.reservation_reference}.`, confirmLabel: "Confirmer le paiement", tone: "primary", action: () => markFeePaid(baggage) })}>Confirmer le paiement des frais</button> : null}
                      {baggage.statut !== "RESTITUE" && baggage.frais_payes && canReturnBaggage ? <button className="agent-button agent-button--small" type="button" disabled={saving} onClick={() => setConfirmation({ title: "Confirmer la restitution ?", description: `Confirmez la remise du bagage associé à la réservation ${baggage.reservation_reference} à son propriétaire.`, confirmLabel: "Confirmer la restitution", tone: "primary", action: () => returnBaggage(baggage) })}>Confirmer la restitution</button> : null}
                      {!baggage.frais_payes ? <span className="agent-fee-due">Frais à percevoir</span> : <span className="agent-fee-paid">Frais payés</span>}
                    </article>
                  ))}</div>
                ) : <p className="agent-empty">{canConsultBaggage || canReturnBaggage ? "Aucun bagage enregistré." : "Les bagages enregistrés pendant cette session apparaîtront ici pour le suivi des frais."}</p>}
                {baggagePagination}
              </section>
            ) : null}
            {!canRegisterBaggage && !canConsultBaggage && !canReturnBaggage ? <section className="agent-panel"><p className="agent-empty">Aucun accès bagage ne vous a été attribué.</p></section> : null}
          </div>
        ) : null}

        {activeTab === "notifications" ? (
          <div className="agent-content">
            <section className="agent-panel">
              <div className="agent-panel-heading">
                <div><h2>Notifications</h2><p>{unreadCount} non lue(s)</p></div>
                {unreadCount > 0 ? <button type="button" className="agent-text-button" disabled={saving} onClick={() => void markAllNotificationsRead()}>Tout marquer comme lu</button> : null}
              </div>
              {notifications.length ? (
                <div className="agent-notification-list">{pageNotifications.map((notification) => (
                  <button type="button" className={`agent-notification ${notification.lue ? "is-read" : ""}`} key={notification.id_notification} onClick={() => void markNotificationRead(notification)} disabled={saving || notification.lue}>
                    <span className="agent-notification-dot" />
                    <span className="agent-notification-copy"><strong>{notification.titre}</strong><span>{notification.message}</span><small>{formatDateTime(notification.date_creation)}</small></span>
                    {!notification.lue ? <span className="agent-unread-label">Marquer comme lue</span> : null}
                  </button>
                ))}</div>
              ) : <p className="agent-empty">Vous n’avez aucune notification pour le moment.</p>}
              {notificationPagination}
            </section>
          </div>
        ) : null}
        {confirmation ? (
          <ConfirmationDialog
            open
            title={confirmation.title}
            description={confirmation.description}
            confirmLabel={confirmation.confirmLabel}
            tone={confirmation.tone}
            pending={saving}
            onCancel={() => setConfirmation(null)}
            onConfirm={async () => {
              await confirmation.action();
              setConfirmation(null);
            }}
          />
        ) : null}
      </div>
    </RoleWorkspaceShell>
  );
}

function permissionLabel(permission: string) {
  return (
    {
      ENREGISTRER_BAGAGE: "Enregistrer et facturer des bagages",
      SCANNER_BILLET: "Scanner et vérifier les billets",
      VALIDER_EMBARQUEMENT: "Valider l’embarquement et déclarer un départ",
      CONSULTER_BAGAGES: "Consulter les bagages",
      RESTITUER_BAGAGE: "Confirmer la restitution",
    }[permission] ?? permission
  );
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  return (
    <article className="agent-ticket-row">
      <div>
        <strong>{ticket.nom_passager}</strong>
        <span>{ticket.voyage.ville_depart_nom} → {ticket.voyage.ville_arrivee_nom}</span>
        <small>{ticket.reservation_reference} · Siège {ticket.numero_siege}</small>
      </div>
      <div className="agent-ticket-side">
        <span className={`agent-status ${ticket.statut === "EMBARQUE" ? "agent-status--done" : ""}`}>{statusLabel(ticket.statut)}</span>
        <small>{formatDate(ticket.voyage.date_depart)}</small>
      </div>
    </article>
  );
}
