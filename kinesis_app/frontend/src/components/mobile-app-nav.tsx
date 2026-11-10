"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  BusFront,
  House,
  Search,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

type TravelerTabRequest = "overview" | "notifications";

export default function MobileAppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [selectedTab, setSelectedTab] =
    useState<TravelerTabRequest>("overview");
  const [unreadCount, setUnreadCount] = useState(0);
  const isTravelerSpace = pathname === "/espace-voyageur";

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

  return (
    <>
      {pathname !== "/" ? (
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
      <nav className="mobile-app-nav" aria-label="Navigation principale mobile">
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
        <span>Alerte</span>
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
      </nav>
    </>
  );
}
