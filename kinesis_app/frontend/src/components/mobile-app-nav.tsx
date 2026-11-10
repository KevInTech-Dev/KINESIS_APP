"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  BusFront,
  House,
  Luggage,
  ScanLine,
  Search,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

type TravelerTabRequest = "overview" | "notifications";
type AgentTabId = "overview" | "scan" | "boarding" | "baggage" | "notifications";
type AgentTab = { id: AgentTabId; label: string };
const AGENT_TABS: AgentTab[] = [
  { id: "overview", label: "Accueil" },
  { id: "scan", label: "Billets" },
  { id: "boarding", label: "Embarquement" },
  { id: "baggage", label: "Bagages" },
  { id: "notifications", label: "Notifi..." },
];

export default function MobileAppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [selectedTab, setSelectedTab] =
    useState<TravelerTabRequest>("overview");
  const [selectedAgentTab, setSelectedAgentTab] =
    useState<AgentTabId>("overview");
  const [agentTabs, setAgentTabs] = useState<AgentTab[]>(AGENT_TABS);
  const [agentUnreadCount, setAgentUnreadCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const isTravelerSpace = pathname === "/espace-voyageur";
  const isAgentSpace = pathname === "/espace-agent";
  const isUserWorkspace = pathname.startsWith("/espace-");

  useEffect(() => {
    function syncTravelerTab(event: Event) {
      const tab = (event as CustomEvent<TravelerTabRequest>).detail;
      if (tab === "overview" || tab === "notifications") setSelectedTab(tab);
    }

    window.addEventListener("kinesis:traveler-tab", syncTravelerTab);
    return () =>
      window.removeEventListener("kinesis:traveler-tab", syncTravelerTab);
  }, []);

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

  function openAgentTab(tab: AgentTabId) {
    setSelectedAgentTab(tab);
    window.dispatchEvent(
      new CustomEvent<AgentTabId>("kinesis:agent-tab-request", {
        detail: tab,
      }),
    );
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
        className={`mobile-app-nav${isAgentSpace ? " mobile-app-nav--agent" : ""}`}
        aria-label={isAgentSpace ? "Navigation espace agent" : "Navigation principale mobile"}
      >
      {isAgentSpace ? (
        agentTabs.map((tab) => {
          const Icon =
            tab.id === "overview"
              ? House
              : tab.id === "scan"
                ? ScanLine
                : tab.id === "boarding"
                  ? BusFront
                  : tab.id === "baggage"
                    ? Luggage
                    : Bell;
          const isActive = selectedAgentTab === tab.id;
          const badge = tab.id === "notifications" ? agentUnreadCount : 0;
          return (
            <button
              type="button"
              key={tab.id}
              className={isActive ? "is-active" : ""}
              aria-current={isActive ? "page" : undefined}
              onClick={() => openAgentTab(tab.id)}
            >
              <span className="mobile-app-nav__icon">
                <Icon aria-hidden="true" />
                {badge > 0 ? (
                  <span className="mobile-app-nav__badge">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span>{tab.id === "notifications" ? "Notifi..." : tab.label}</span>
            </button>
          );
        })
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
    </>
  );
}
