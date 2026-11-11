"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CircleHelp,
  Bell,
  BusFront,
  CreditCard,
  House,
  Luggage,
  MapPin,
  ScanLine,
  Search,
  TicketCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import AppDialog from "@/components/app-dialog";

type TravelerTabRequest = "overview" | "notifications";
type AgentTabId = "overview" | "scan" | "boarding" | "baggage" | "notifications";
type AgentTab = { id: AgentTabId; label: string; disabled?: boolean };
const AGENT_TABS: AgentTab[] = [
  { id: "overview", label: "Accueil" },
  { id: "scan", label: "Billets" },
  { id: "boarding", label: "Embarquement", disabled: true },
  { id: "baggage", label: "Bagages", disabled: true },
  { id: "notifications", label: "Notifi..." },
  { id: "overview", label: "Profil" },
];
type WorkspaceTab = { id: string; label: string; disabled?: boolean };
type RoleMobileState = {
  role: "AGENT_COMPAGNIE" | "COMPAGNIE" | "ADMINISTRATEUR";
  activeTab: string;
  operations: WorkspaceTab[];
  notificationsTabId: string | null;
  profileTabId: string | null;
  unreadCount: number;
};
type MobileNotification = {
  id_notification: string;
  titre: string;
  message: string;
  lue: boolean;
  date_creation: string;
};

function isMobileNotification(value: unknown): value is MobileNotification {
  return (
    typeof value === "object" &&
    value !== null &&
    "id_notification" in value &&
    typeof value.id_notification === "string" &&
    "titre" in value &&
    typeof value.titre === "string" &&
    "message" in value &&
    typeof value.message === "string" &&
    "lue" in value &&
    typeof value.lue === "boolean" &&
    "date_creation" in value &&
    typeof value.date_creation === "string" &&
    Number.isFinite(Date.parse(value.date_creation))
  );
}

export default function MobileAppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [selectedTab, setSelectedTab] =
    useState<TravelerTabRequest>("overview");
  const [selectedAgentTab, setSelectedAgentTab] =
    useState<AgentTabId>("overview");
  const [agentTabs, setAgentTabs] = useState<AgentTab[]>(() =>
    AGENT_TABS.map((tab) =>
      tab.id === "scan" ? { ...tab, disabled: true } : tab,
    ),
  );
  const [agentUnreadCount, setAgentUnreadCount] = useState(0);
  const [roleState, setRoleState] = useState<RoleMobileState | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNotifications, setMobileNotifications] = useState<MobileNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const travelerTabRevision = useRef(0);
  const isTravelerSpace = pathname === "/espace-voyageur";
  const isAgentSpace = pathname === "/espace-agent";
  const isCompanySpace = pathname === "/espace-compagnie";
  const isAdminSpace = pathname === "/espace-administration";
  const activeRoleState =
    roleState?.role ===
    (isAgentSpace
      ? "AGENT_COMPAGNIE"
      : isCompanySpace
        ? "COMPAGNIE"
        : isAdminSpace
          ? "ADMINISTRATEUR"
          : pathname === "/"
            ? roleState?.role
            : null)
      ? roleState
      : null;
  const isRoleSpace =
    isAgentSpace ||
    isCompanySpace ||
    isAdminSpace ||
    (pathname === "/" && activeRoleState !== null);
  const isUserWorkspace = pathname.startsWith("/espace-");
  const mobileRole = activeRoleState?.role;
  const roleWorkspacePath =
    mobileRole === "AGENT_COMPAGNIE"
      ? "/espace-agent"
      : mobileRole === "COMPAGNIE"
        ? "/espace-compagnie"
        : mobileRole === "ADMINISTRATEUR"
          ? "/espace-administration"
          : null;

  useEffect(() => {
    function syncTravelerTab(event: Event) {
      const tab = (event as CustomEvent<TravelerTabRequest>).detail;
      if (tab === "overview" || tab === "notifications") {
        travelerTabRevision.current += 1;
        setSelectedTab(tab);
      }
    }

    window.addEventListener("kinesis:traveler-tab", syncTravelerTab);
    return () =>
      window.removeEventListener("kinesis:traveler-tab", syncTravelerTab);
  }, []);

  useEffect(() => {
    const tab =
      isTravelerSpace &&
      new URLSearchParams(window.location.search).get("tab") ===
        "notifications"
        ? "notifications"
        : "overview";
    const revision = travelerTabRevision.current;
    const timer = window.setTimeout(() => {
      if (travelerTabRevision.current === revision) setSelectedTab(tab);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isTravelerSpace, pathname]);

  useEffect(() => {
    function syncAgentState(event: Event) {
      const state = (event as CustomEvent<{
        tab: AgentTabId;
        tabs: AgentTab[];
        unreadCount: number;
      }>).detail;
      if (!state || !Array.isArray(state.tabs)) return;
      if (
        state.tabs.every(
          (tab) =>
            typeof tab.id === "string" &&
            AGENT_TABS.some((knownTab) => knownTab.id === tab.id) &&
            typeof tab.label === "string",
        )
      ) {
        setAgentTabs(state.tabs);
      }
      if (AGENT_TABS.some((tab) => tab.id === state.tab)) {
        setSelectedAgentTab(state.tab);
      }
      if (Number.isInteger(state.unreadCount) && state.unreadCount >= 0) {
        setAgentUnreadCount(state.unreadCount);
      }
    }

    window.addEventListener("kinesis:agent-tab-state", syncAgentState);
    return () =>
      window.removeEventListener("kinesis:agent-tab-state", syncAgentState);
  }, []);

  useEffect(() => {
    function syncRoleState(event: Event) {
      const state = (event as CustomEvent<RoleMobileState>).detail;
      if (
        !state ||
        !["AGENT_COMPAGNIE", "COMPAGNIE", "ADMINISTRATEUR"].includes(state.role) ||
        typeof state.activeTab !== "string" ||
        !Array.isArray(state.operations) ||
        !state.operations.every(
          (item) =>
            typeof item.id === "string" &&
            typeof item.label === "string" &&
            (item.disabled === undefined || typeof item.disabled === "boolean"),
        ) ||
        !Number.isInteger(state.unreadCount) ||
        state.unreadCount < 0
      ) {
        return;
      }
      setRoleState(state);
    }

    window.addEventListener("kinesis:role-mobile-state", syncRoleState);
    const requestTimer = window.setTimeout(
      () => window.dispatchEvent(new Event("kinesis:role-mobile-state-request")),
      0,
    );
    return () => {
      window.clearTimeout(requestTimer);
      window.removeEventListener("kinesis:role-mobile-state", syncRoleState);
    };
  }, []);

  useEffect(() => {
    function resetRoleState() {
      setRoleState(null);
      setSelectedAgentTab("overview");
      setAgentUnreadCount(0);
    }

    window.addEventListener("kinesis:role-mobile-reset", resetRoleState);
    return () =>
      window.removeEventListener(
        "kinesis:role-mobile-reset",
        resetRoleState,
      );
  }, []);

  useEffect(() => {
    function syncUnreadCount(event: Event) {
      const count = (event as CustomEvent<number>).detail;
      if (Number.isInteger(count) && count >= 0) setUnreadCount(count);
    }

    window.addEventListener("kinesis:unread-notifications", syncUnreadCount);
    return () =>
      window.removeEventListener(
        "kinesis:unread-notifications",
        syncUnreadCount,
      );
  }, []);

  useEffect(() => {
    let active = true;

    async function refreshUnreadCount() {
      try {
        const response = await fetch("/api/notifications?page_size=100", {
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403) {
          if (active) setUnreadCount(0);
          return;
        }
        if (!response.ok) {
          throw new Error(`Les alertes n’ont pas pu être chargées (${response.status}).`);
        }

        const payload: unknown = await response.json();
        const notifications =
          typeof payload === "object" &&
          payload !== null &&
          "results" in payload
            ? payload.results
            : payload;
        if (
          !Array.isArray(notifications) ||
          !notifications.every(
            (notification) =>
              typeof notification === "object" &&
              notification !== null &&
              "lue" in notification &&
              typeof notification.lue === "boolean",
          )
        ) {
          throw new Error("La liste des alertes reçue est invalide.");
        }
        if (active) {
          setUnreadCount(
            notifications.filter((notification) => !notification.lue).length,
          );
        }
      } catch (error) {
        if (active) console.error("Could not load mobile unread alerts", error);
      }
    }

    void refreshUnreadCount();
    return () => {
      active = false;
    };
  }, [pathname]);

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  function openTravelerTab(tab: TravelerTabRequest) {
    setSelectedTab(tab);
    if (isTravelerSpace) {
      const url = new URL(window.location.href);
      if (tab !== "overview") {
        url.searchParams.set("tab", tab);
      } else {
        url.searchParams.delete("tab");
      }
      window.history.replaceState(window.history.state, "", url);
      window.dispatchEvent(
        new CustomEvent<TravelerTabRequest>("kinesis:traveler-tab", {
          detail: tab,
        }),
      );
      return;
    }

    router.push(
      tab === "notifications"
        ? "/espace-voyageur?tab=notifications"
        : "/espace-voyageur",
    );
  }

  function openSearch() {
    if (pathname === "/") {
      window.dispatchEvent(new Event("kinesis:open-search"));
      return;
    }

    router.push("/?openSearch=1");
  }

  function openRoleTab(tabId: string | null) {
    if (!tabId) {
      if (isAdminSpace) void showAdminNotifications();
      return;
    }
    if (pathname === "/" && roleWorkspacePath) {
      router.push(
        `${roleWorkspacePath}?mobileTab=${encodeURIComponent(tabId)}`,
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent<string>("kinesis:role-mobile-tab-request", {
        detail: tabId,
      }),
    );
  }

  function openRoleProfile() {
    if (isAdminSpace || activeRoleState?.role === "ADMINISTRATEUR") {
      if (pathname === "/" && roleWorkspacePath) {
        router.push(`${roleWorkspacePath}?mobileProfile=1`);
      } else {
        window.dispatchEvent(new Event("kinesis:role-profile-view-request"));
      }
      return;
    }
    openRoleTab("overview");
  }

  async function showAdminNotifications() {
    setNotificationsOpen(true);
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const response = await fetch("/api/notifications?page_size=100", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Les notifications n’ont pas pu être chargées (${response.status}).`);
      }
      const payload: unknown = await response.json();
      const notifications =
        typeof payload === "object" &&
        payload !== null &&
        "results" in payload
          ? payload.results
          : payload;
      if (
        !Array.isArray(notifications) ||
        !notifications.every(isMobileNotification)
      ) {
        throw new Error("La liste des notifications reçue est invalide.");
      }
      setMobileNotifications(notifications);
      const unread = notifications.filter((item) => !item.lue).length;
      setUnreadCount(unread);
      setRoleState((current) =>
        current ? { ...current, unreadCount: unread } : current,
      );
    } catch (loadError) {
      console.error("Could not load admin mobile notifications", loadError);
      setNotificationsError(
        loadError instanceof Error
          ? loadError.message
          : "Les notifications n’ont pas pu être chargées.",
      );
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function markAdminNotificationsRead() {
    try {
      const response = await fetch("/api/notifications/lire-tout", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Les notifications n’ont pas pu être mises à jour (${response.status}).`);
      }
      setMobileNotifications((current) =>
        current.map((item) => ({ ...item, lue: true })),
      );
      setUnreadCount(0);
      setRoleState((current) =>
        current ? { ...current, unreadCount: 0 } : current,
      );
    } catch (readError) {
      console.error("Could not mark admin mobile notifications as read", readError);
      setNotificationsError(
        readError instanceof Error
          ? readError.message
          : "Les notifications n’ont pas pu être mises à jour.",
      );
    }
  }

  return (
    <>
      {pathname !== "/" && !isUserWorkspace ? (
        <button
          type="button"
          className="app-back-button"
          onClick={goBack}
          aria-label="Revenir à la page précédente"
          title="Retour"
        >
          <ArrowLeft aria-hidden="true" />
          <span>Retour</span>
        </button>
      ) : null}
      <nav
        className={`mobile-app-nav${mobileRole === "AGENT_COMPAGNIE" ? " mobile-app-nav--agent" : ""}${isRoleSpace ? " mobile-app-nav--workspace" : ""}`}
        aria-label={isRoleSpace ? "Navigation de l’espace utilisateur" : "Navigation principale mobile"}
      >
      {isRoleSpace ? (
        (() => {
          const roleIsAgent = activeRoleState?.role === "AGENT_COMPAGNIE";
          const roleIsCompany = activeRoleState?.role === "COMPAGNIE";
          const roleIsAdmin = activeRoleState?.role === "ADMINISTRATEUR";
          const configuredOperations =
            activeRoleState?.operations ??
            (roleIsAgent
              ? agentTabs
                  .filter(
                    (item) =>
                      item.id !== "overview" && item.id !== "notifications",
                  )
                  .map(({ id, label, disabled }) => ({ id, label, disabled }))
              : roleIsCompany
                ? [
                    { id: "trips", label: "Mes trajets" },
                    { id: "reservations", label: "Réservations" },
                  ]
                : [
                    { id: "accounts", label: "Utilisateurs" },
                    { id: "companies", label: "Dossiers compagnies" },
                  ]);
          const operations = configuredOperations
            .filter((item) => !item.disabled)
            .slice(0, 2);
          while (operations.length < 2) {
            operations.push({
              id: `unavailable-${operations.length}`,
              label: "Accès limité",
              disabled: true,
            });
          }
          const roleTabs: WorkspaceTab[] = [
            { id: "overview", label: "Accueil" },
            ...operations,
            {
              id: activeRoleState?.notificationsTabId ?? (roleIsAdmin ? "" : "notifications"),
              label: "Notifi...",
            },
            { id: "profile", label: "Profil" },
          ];
          const unread = roleIsAgent
            ? activeRoleState?.unreadCount ?? agentUnreadCount
            : roleIsAdmin
              ? unreadCount
              : activeRoleState?.unreadCount ?? unreadCount;
          return roleTabs.map((tab, index) => {
            const Icon =
              index === 0
                ? House
                : tab.label === "Billets"
                  ? ScanLine
                  : tab.label === "Embarquement"
                    ? BusFront
                    : tab.label === "Bagages"
                      ? Luggage
                      : tab.label === "Notifi..."
                        ? Bell
                        : tab.id === "trips"
                          ? BusFront
                          : tab.id === "reservations"
                            ? TicketCheck
                            : tab.id === "stations"
                              ? MapPin
                              : tab.id === "tariffs"
                                ? Luggage
                                : tab.id === "payments"
                                  ? CreditCard
                                  : tab.id === "accounts"
                                    ? UserRound
                                    : tab.id === "companies"
                                      ? Building2
                        : tab.disabled
                          ? CircleHelp
                          : UserRound;
            const isProfile = index === 4;
            const isNotifications = index === 3;
            const isActive =
              index === 0
                ? pathname === "/"
                : isProfile
                  ? pathname !== "/" &&
                    activeRoleState?.activeTab === "overview"
                : isNotifications
                  ? activeRoleState?.notificationsTabId
                    ? activeRoleState.activeTab === activeRoleState.notificationsTabId
                    : notificationsOpen ||
                      (roleIsAgent && selectedAgentTab === "notifications")
                  : activeRoleState
                    ? activeRoleState.activeTab === tab.id
                    : roleIsAgent && selectedAgentTab === tab.id;
            const badge = isNotifications ? unread : 0;
          return (
            <button
              type="button"
              key={`${index}-${tab.id}`}
              className={`${isActive ? "is-active" : ""}${tab.disabled ? " is-disabled" : ""}`}
              aria-current={isActive ? "page" : undefined}
              aria-disabled={tab.disabled || undefined}
              onClick={() => {
                if (tab.disabled) return;
                if (index === 0) {
                  router.push("/");
                } else if (isProfile) {
                  openRoleProfile();
                } else {
                  openRoleTab(
                    isNotifications
                      ? activeRoleState?.notificationsTabId ?? null
                      : tab.id,
                  );
                }
              }}
            >
              <span className="mobile-app-nav__icon">
                <Icon aria-hidden="true" />
                {badge > 0 ? (
                  <span className="mobile-app-nav__badge">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span>{tab.label}</span>
            </button>
          );
          });
        })()
      ) : (
        <>
      <Link
        href="/"
        className={pathname === "/" ? "is-active" : ""}
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <House aria-hidden="true" />
        <span>Accueil</span>
      </Link>
      <Link
        href="/voyages"
        className={pathname.startsWith("/voyages") ? "is-active" : ""}
        aria-current={pathname.startsWith("/voyages") ? "page" : undefined}
      >
        <BusFront aria-hidden="true" />
        <span>Voyages</span>
      </Link>
      <button type="button" onClick={openSearch}>
        <Search aria-hidden="true" />
        <span>Rechercher</span>
      </button>
      <button
        type="button"
        className={isTravelerSpace && selectedTab === "notifications" ? "is-active" : ""}
        aria-current={
          isTravelerSpace && selectedTab === "notifications" ? "page" : undefined
        }
        onClick={() => openTravelerTab("notifications")}
      >
        <span className="mobile-app-nav__icon">
          <Bell aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="mobile-app-nav__badge">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </span>
        <span>Notifi...</span>
      </button>
      <button
        type="button"
        className={isTravelerSpace && selectedTab === "overview" ? "is-active" : ""}
        aria-current={
          isTravelerSpace && selectedTab === "overview" ? "page" : undefined
        }
        onClick={() => openTravelerTab("overview")}
      >
        <UserRound aria-hidden="true" />
        <span>Profil</span>
      </button>
        </>
      )}
      </nav>
      {isAdminSpace ? (
        <AppDialog
          open={notificationsOpen}
          title="Notifications"
          onClose={() => setNotificationsOpen(false)}
          className="mobile-notifications-dialog"
        >
          <div className="mobile-notifications">
            {unreadCount > 0 ? (
              <button
                type="button"
                className="mobile-notifications__read-all"
                onClick={() => void markAdminNotificationsRead()}
              >
                Tout marquer comme lu
              </button>
            ) : null}
            {notificationsError ? (
              <p className="mobile-notifications__error" role="alert">
                {notificationsError}
              </p>
            ) : null}
            {notificationsLoading ? <p>Chargement des notifications…</p> : null}
            {!notificationsLoading && !notificationsError && !mobileNotifications.length ? (
              <p>Aucune notification pour le moment.</p>
            ) : null}
            {mobileNotifications.map((item) => (
              <article
                key={item.id_notification}
                className={item.lue ? "" : "is-unread"}
              >
                <strong>{item.titre}</strong>
                <p>{item.message}</p>
                <time dateTime={item.date_creation}>
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(item.date_creation))}
                </time>
              </article>
            ))}
          </div>
        </AppDialog>
      ) : null}
    </>
  );
}
