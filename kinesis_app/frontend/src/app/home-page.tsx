"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { getUserFacingErrorMessage } from "@/lib/user-facing-errors";
import type { Ville, Voyage } from "@/lib/types";
import AppDialog from "@/components/app-dialog";
import ProfileAvatar from "@/components/profile-avatar";
import VoyageCoverImage from "@/components/voyage-cover-image";
import { HomeTripSkeletons } from "@/components/voyage-skeletons";
import { fetchPaginatedApiResponse } from "@/lib/paginated-api";
import { getPublicCities } from "@/lib/public-cities";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";
import { useListPagination } from "@/components/list-pagination";
import { cacheVoyages } from "@/lib/voyage-cache";

type IconName =
  | "arrow"
  | "calendar"
  | "check"
  | "chevron"
  | "clock"
  | "headphones"
  | "location"
  | "menu"
  | "shield"
  | "swap"
  | "ticket"
  | "user"
  | "users"
  | "wifi"
  | "x";

const iconPaths: Record<IconName, ReactNode> = {
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M18 19c0 1.1-.9 2-2 2h-1v-7h3a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2ZM6 19a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h3v7H8a2 2 0 0 1-2-2Z" />
    </>
  ),
  location: (
    <>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h14M15 5l3 3-3 3" />
      <path d="M20 16H6M9 13l-3 3 3 3" />
    </>
  ),
  ticket: (
    <>
      <path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2M13 17v2M13 11v2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 22a8 8 0 0 1 16 0" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  wifi: (
    <>
      <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r=".5" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
};

function isVoyage(value: unknown): value is Voyage {
  return (
    typeof value === "object" &&
    value !== null &&
    "id_voyage" in value &&
    typeof value.id_voyage === "string" &&
    "compagnie" in value &&
    typeof value.compagnie === "string" &&
    "compagnie_nom" in value &&
    typeof value.compagnie_nom === "string" &&
    "ville_depart" in value &&
    typeof value.ville_depart === "string" &&
    "ville_depart_nom" in value &&
    typeof value.ville_depart_nom === "string" &&
    "ville_arrivee" in value &&
    typeof value.ville_arrivee === "string" &&
    "ville_arrivee_nom" in value &&
    typeof value.ville_arrivee_nom === "string" &&
    "date_depart" in value &&
    typeof value.date_depart === "string" &&
    "heure_depart" in value &&
    typeof value.heure_depart === "string" &&
    "date_depart_effective" in value &&
    (typeof value.date_depart_effective === "string" ||
      value.date_depart_effective === null) &&
    "place_totale" in value &&
    typeof value.place_totale === "number" &&
    "places_disponibles" in value &&
    typeof value.places_disponibles === "number" &&
    "prix" in value &&
    (typeof value.prix === "string" || typeof value.prix === "number") &&
    "image" in value &&
    (typeof value.image === "string" || value.image === null) &&
    "statut" in value &&
    typeof value.statut === "string"
  );
}

const benefits: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "ticket",
    title: "Réservez simplement",
    text: "Choisissez votre trajet et le nombre de places directement en ligne.",
  },
  {
    icon: "shield",
    title: "Voyagez sereinement",
    text: "Retrouvez les informations de votre réservation dans votre espace.",
  },
  {
    icon: "wifi",
    title: "Le confort à bord",
    text: "Consultez les informations communiquées par votre compagnie.",
  },
  {
    icon: "headphones",
    title: "Une équipe à vos côtés",
    text: "Kinesis vous accompagne à chaque étape de votre réservation.",
  },
];

function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getErrorMessage(error: unknown) {
  return getUserFacingErrorMessage(
    error,
    "Une erreur inattendue s’est produite. Réessayez dans quelques instants.",
  );
}

function formatPrice(price: string | number) {
  const amount = Number(price);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`
    : `${price} FCFA`;
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function TripCard({
  trip,
  onSelect,
  onBook,
}: {
  trip: Voyage;
  onSelect?: (trip: Voyage) => void;
  onBook?: (trip: Voyage) => void;
}) {
  return (
    <article className="trip-card">
      {onSelect || onBook ? (
        <button
          className="trip-card__select"
          onClick={() => (onBook ?? onSelect)?.(trip)}
          type="button"
          aria-label={`${onBook ? "Consulter" : "Préparer une recherche pour"} ${trip.ville_depart_nom} vers ${trip.ville_arrivee_nom}`}
        />
      ) : null}
      <VoyageCoverImage
        image={trip.image}
        voyageId={trip.id_voyage}
        alt=""
        sizes="(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 33vw"
        className="trip-card__image"
      />
      <div className="trip-card__shade" />
      <span className="trip-card__badge">
        {trip.places_disponibles}{" "}
        {trip.places_disponibles > 1 ? "places disponibles" : "place disponible"}
      </span>
      <div className="trip-card__content">
        <p className="trip-card__route">
          {trip.ville_depart_nom} <Icon name="arrow" className="icon-small" />{" "}
          {trip.ville_arrivee_nom}
        </p>
        <div className="trip-card__heading">
          <div>
            <h3>{trip.compagnie_nom || "Compagnie"}</h3>
          </div>
          <span className="trip-card__arrow" aria-hidden="true">
            <Icon name="arrow" />
          </span>
        </div>
        <div className="trip-card__details">
          <span>
            <Icon name="calendar" className="icon-small" />
            {formatDate(trip.date_depart)}
          </span>
          <span>
            <Icon name="clock" className="icon-small" />
            {trip.heure_depart.slice(0, 5)}
          </span>
          <strong>{formatPrice(trip.prix)}</strong>
        </div>
      </div>
    </article>
  );
}

type BookingSearchFormProps = {
  id: string;
  cities: Ville[];
  from: string;
  to: string;
  date: string;
  minimumDate: string;
  passengers: number;
  loadingCities: boolean;
  searching: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onPassengersChange: (value: number | ((current: number) => number)) => void;
  onSwap: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function BookingSearchForm({
  id,
  cities,
  from,
  to,
  date,
  minimumDate,
  passengers,
  loadingCities,
  searching,
  onFromChange,
  onToChange,
  onDateChange,
  onPassengersChange,
  onSwap,
  onSubmit,
}: BookingSearchFormProps) {
  return (
    <form className="booking-form" id={id} onSubmit={onSubmit}>
      <label className="booking-field booking-field--from">
        <span className="booking-field__label">Départ</span>
        <span className="booking-field__control">
          <span className="field-icon"><Icon name="location" /></span>
          <select
            aria-label="Ville de départ"
            value={from}
            onChange={(event) => onFromChange(event.target.value)}
            disabled={cities.length === 0}
            required
          >
            {cities.length === 0 ? <option value="">Chargement…</option> : null}
            {cities.map((city) => (
              <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>
            ))}
          </select>
          <Icon name="chevron" className="field-chevron" />
        </span>
      </label>

      <button
        className="swap-button"
        type="button"
        onClick={onSwap}
        disabled={!from || !to}
        aria-label="Inverser départ et arrivée"
      >
        <Icon name="swap" />
      </button>

      <label className="booking-field booking-field--to">
        <span className="booking-field__label">Arrivée</span>
        <span className="booking-field__control">
          <span className="field-icon"><Icon name="location" /></span>
          <select
            aria-label="Ville d’arrivée"
            value={to}
            onChange={(event) => onToChange(event.target.value)}
            disabled={cities.length === 0}
            required
          >
            {cities.length === 0 ? <option value="">Chargement…</option> : null}
            {cities.map((city) => (
              <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>
            ))}
          </select>
          <Icon name="chevron" className="field-chevron" />
        </span>
      </label>

      <label className="booking-field booking-field--date">
        <span className="booking-field__label">Date</span>
        <span className="booking-field__control">
          <span className="field-icon"><Icon name="calendar" /></span>
          <input
            type="date"
            aria-label="Date de départ"
            min={minimumDate}
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            required
          />
        </span>
      </label>

      <div className="booking-field booking-field--passengers">
        <span className="booking-field__label">Voyageurs</span>
        <span className="booking-field__control">
          <span className="field-icon"><Icon name="users" /></span>
          <div className="passenger-stepper" aria-label="Voyageurs">
            <button
              className="passenger-stepper__button"
              type="button"
              onClick={() => onPassengersChange((count) => Math.max(1, count - 1))}
              disabled={passengers <= 1}
              aria-label="Retirer un voyageur"
            >
              −
            </button>
            <span className="passenger-stepper__value" aria-live="polite" aria-atomic="true">
              {passengers} {passengers > 1 ? "places" : "place"}
            </span>
            <button
              className="passenger-stepper__button"
              type="button"
              onClick={() => onPassengersChange((count) => Math.min(100, count + 1))}
              disabled={passengers >= 100}
              aria-label="Ajouter un voyageur (maximum 100)"
            >
              +
            </button>
          </div>
        </span>
      </div>

      <button
        className="search-button"
        type="submit"
        disabled={searching || loadingCities || cities.length < 2}
      >
        {searching ? "Recherche…" : "Rechercher"}
        <span><Icon name="arrow" /></span>
      </button>
    </form>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [cities, setCities] = useState<Ville[]>([]);
  const [trips, setTrips] = useState<Voyage[]>([]);
  const [tripCount, setTripCount] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [minimumDate, setMinimumDate] = useState("");
  const [cityError, setCityError] = useState("");
  const [tripError, setTripError] = useState("");
  const [searchResults, setSearchResults] = useState<Voyage[] | null>(null);
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [searchMessage, setSearchMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const profileHref =
    profile?.role === "COMPAGNIE"
      ? "/espace-compagnie"
      : profile?.role === "AGENT_COMPAGNIE"
        ? "/espace-agent"
        : profile?.role === "ADMINISTRATEUR"
          ? "/espace-administration"
        : "/espace-voyageur";
  const {
    pageItems: pageSearchResults,
    pagination: searchResultsPagination,
    resetPage: resetSearchResultsPage,
  } = useListPagination(searchResults ?? []);

  useEffect(() => {
    let active = true;

    async function loadHomeData() {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setMinimumDate(localDateString(new Date()));
      setDate(localDateString(tomorrow));

      void fetch("/api/auth/session", { cache: "no-store" })
        .then(async (response): Promise<UserProfile | null> => {
          if (response.status === 401) return null;
          if (!response.ok) {
            throw new Error(
              `Le profil n’a pas pu être chargé (${response.status}).`,
            );
          }
          const currentProfile: unknown = await response.json();
          if (!isUserProfile(currentProfile)) {
            throw new Error("Le profil reçu du serveur est invalide.");
          }
          return currentProfile;
        })
        .then((currentProfile) => {
          if (active) setProfile(currentProfile);
        })
        .catch((error: unknown) => {
          if (active) {
            console.error("Could not load current user profile", error);
          }
        });

      async function loadCities() {
        try {
          const cityList = await getPublicCities();
          if (!active) return;

          setCities(cityList);
          setCityError(
            cityList.length === 0
              ? "Aucune ville n’est encore configurée."
              : "",
          );
          if (cityList.length > 0) {
            setFrom((current) => current || cityList[0].id_ville);
            setTo(
              (current) =>
                current ||
                cityList.find((city) => city.id_ville !== cityList[0].id_ville)
                  ?.id_ville ||
                "",
            );
          }
        } catch (error) {
          if (active) setCityError(getErrorMessage(error));
        } finally {
          if (active) setLoadingCities(false);
        }
      }

      async function loadTrips() {
        try {
          const tripPage = await fetchPaginatedApiResponse(
            "/api/voyages?page=1&page_size=3",
            isVoyage,
            "Les voyages n’ont pas pu être chargés.",
          );
          if (!active) return;

          setTrips(tripPage.results);
          cacheVoyages(tripPage.results);
          setTripCount(tripPage.count);
          setTripError("");
        } catch (error) {
          if (active) setTripError(getErrorMessage(error));
        } finally {
          if (active) setLoadingTrips(false);
        }
      }

      void loadCities();
      void loadTrips();
    }

    void loadHomeData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function updateHeaderOnScroll() {
      setHeaderScrolled(window.scrollY > 0);
    }

    updateHeaderOnScroll();
    window.addEventListener("scroll", updateHeaderOnScroll, { passive: true });

    return () => window.removeEventListener("scroll", updateHeaderOnScroll);
  }, []);

  function swapCities() {
    setFrom(to);
    setTo(from);
  }

  async function searchTrips(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchResults(null);
    setSearchResultCount(0);

    if (!from || !to || !date) {
      setSearchMessage("Choisissez une ville de départ, d’arrivée et une date.");
      return;
    }
    if (from === to) {
      setSearchMessage("Les villes de départ et d’arrivée doivent être différentes.");
      return;
    }
    if (date < localDateString(new Date())) {
      setSearchMessage("Choisissez une date à partir d’aujourd’hui.");
      return;
    }

    setSearching(true);
    setSearchMessage("");
    const query = new URLSearchParams({
      ville_depart: from,
      ville_arrivee: to,
      date_depart: date,
      places_min: String(passengers),
    });

    try {
      const matchingTrips = await fetchPaginatedApiResponse(
        `/api/voyages?${query.toString()}&page=1&page_size=100`,
        isVoyage,
        "La recherche a échoué.",
      );
      const suitableTrips = matchingTrips.results.filter(
        (trip) => trip.places_disponibles >= passengers,
      );
      cacheVoyages(suitableTrips);
      if (suitableTrips.length === 1) {
        setSearchDialogOpen(false);
        router.push(
          `/voyages/${encodeURIComponent(suitableTrips[0].id_voyage)}?passagers=${passengers}`,
        );
        return;
      }
      resetSearchResultsPage();
      setSearchResults(suitableTrips);
      setSearchResultCount(matchingTrips.count);
      if (suitableTrips.length === 0) {
        setSearchMessage("");
        toast.info(
            "Aucun départ ne correspond à ces critères. Essayez une autre date ou un autre trajet.",
            { duration: 10_000 },
        );
      } else {
        setSearchMessage(
            matchingTrips.count > suitableTrips.length
            ? `${suitableTrips.length} premiers départs affichés sur ${matchingTrips.count} disponibles.`
            : `${matchingTrips.count} départ${matchingTrips.count > 1 ? "s" : ""} disponible${matchingTrips.count > 1 ? "s" : ""}.`,
        );
      }
      setSearchDialogOpen(false);
    } catch (error) {
      setSearchMessage(
        getUserFacingErrorMessage(error, "La recherche a échoué. Réessayez."),
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="site-shell">
      <header
        className={`site-header${headerScrolled ? " site-header--scrolled" : ""}${menuOpen ? " site-header--menu-open" : ""}`}
      >
        <div className="header-inner">
          <a className="brand" href="#accueil" aria-label="Kinesis, accueil">
            <Image
              src="/kinesis-mark.png"
              width={48}
              height={48}
              alt=""
              priority
              className="brand__mark"
            />
            <span>KINESIS</span>
          </a>

          <nav className="main-nav" aria-label="Navigation principale">
            <a href="#accueil">Accueil</a>
            <Link href="/voyages">Voyages</Link>
            <a href="#avantages">Pourquoi Kinesis ?</a>
          </nav>

          <Link
            className={`account-button${profile ? " account-button--profile" : ""}`}
            href={profile ? profileHref : "/connexion"}
          >
            {profile ? (
              <ProfileAvatar
                className="account-avatar"
                fallbackClassName="account-avatar--fallback"
                src={profile.photo_profil}
                name={[profile.prenoms, profile.nom].filter(Boolean).join(" ")}
                size={32}
              />
            ) : (
              <Icon name="user" className="icon-small" />
            )}
            {profile ? "Profil" : "Connexion"}
          </Link>

          <button
            className="menu-button"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? "x" : "menu"} />
          </button>
        </div>
        {menuOpen ? (
          <nav className="mobile-nav" aria-label="Navigation mobile">
            <a href="#accueil" onClick={() => setMenuOpen(false)}>
              Accueil
            </a>
            <Link href="/voyages" onClick={() => setMenuOpen(false)}>Voyages</Link>
            <a href="#avantages" onClick={() => setMenuOpen(false)}>
              Pourquoi Kinesis ?
            </a>
            <Link
              className={profile ? "mobile-profile-link" : undefined}
              href={profile ? profileHref : "/connexion"}
              onClick={() => setMenuOpen(false)}
            >
              {profile ? (
                <ProfileAvatar
                  className="account-avatar"
                  fallbackClassName="account-avatar--fallback"
                  src={profile.photo_profil}
                  name={[profile.prenoms, profile.nom].filter(Boolean).join(" ")}
                  size={32}
                />
              ) : null}
              {profile ? "Profil" : "Connexion"}
            </Link>
          </nav>
        ) : null}
      </header>

      <main>
        <section className="hero" id="accueil">
          <div className="hero__background" />
          <div className="hero__rings" aria-hidden="true" />
          <div className="hero__inner">
            <div className="hero__copy">
              <p className="eyebrow eyebrow--hero">
                <span />
                Voyagez autrement au Togo
              </p>
              <h1>
                Finies les files d’attente
                <span>dans les agences de voyage.</span>
              </h1>
              <p className="hero__description">
                Avec KINESIS, réservez votre place en quelques clics et voyagez
                entre les villes du Togo en toute sérénité.
              </p>
              <a className="hero-cta hero-cta--desktop" href="#recherche">
                Rechercher un voyage
                <span>
                  <Icon name="arrow" />
                </span>
              </a>
              <button
                className="hero-cta hero-cta--mobile"
                type="button"
                onClick={() => setSearchDialogOpen(true)}
              >
                Rechercher un voyage
                <span><Icon name="arrow" /></span>
              </button>
            </div>
          </div>
        </section>

        <section
          className="booking-section"
          id="recherche"
          aria-labelledby="booking-heading"
        >
          <div className="booking-section__inner">
            <div className="booking-section__heading">
              <p className="eyebrow eyebrow--section">
                <span className="eyebrow__line" />
                <span className="eyebrow__label">Votre prochain trajet</span>
                <span className="eyebrow__line" />
              </p>
              <h2 id="booking-heading">
                Où souhaitez-vous <span>aller ?</span>
              </h2>
              <p>
                Choisissez votre itinéraire et votre date pour découvrir les
                prochains départs.
              </p>
            </div>
            <BookingSearchForm
              id="search-form"
              cities={cities}
              from={from}
              to={to}
              date={date}
              minimumDate={minimumDate}
              passengers={passengers}
              loadingCities={loadingCities}
              searching={searching}
              onFromChange={setFrom}
              onToChange={setTo}
              onDateChange={setDate}
              onPassengersChange={setPassengers}
              onSwap={swapCities}
              onSubmit={searchTrips}
            />

            {cityError || tripError ? (
              <div className="api-notice" role="status">
                <strong>Informations de voyage indisponibles.</strong>
                {cityError ? <span>Villes : {cityError}</span> : null}
                {tripError ? <span>Départs : {tripError}</span> : null}
              </div>
            ) : null}

            <div className="trust-row">
              <span>
                <Icon name="shield" /> Paiement sécurisé
              </span>
              <span>
                <Icon name="ticket" /> Billet instantané
              </span>
              <span>
                <Icon name="headphones" /> Assistance à vos côtés
              </span>
            </div>

            {searchMessage ? (
              <div className="search-feedback" role="status" aria-live="polite">
                <span className="search-feedback__icon">
                  <Icon
                    name={searchResults?.length ? "check" : "ticket"}
                  />
                </span>
                <p>{searchMessage}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchMessage("");
                    setSearchResults(null);
                    setSearchResultCount(0);
                  }}
                  aria-label="Fermer le résultat"
                >
                  <Icon name="x" />
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="destinations-section" id="destinations">
          <div className="section-heading">
            <p className="eyebrow eyebrow--section">
              <span className="eyebrow__line" />
              <span className="eyebrow__label">Prochains départs</span>
              <span className="eyebrow__line" />
            </p>
            <h2>
              Où partons-nous <span>aujourd’hui ?</span>
            </h2>
            <p className="section-heading__description">
              Découvrez les prochains voyages disponibles à la réservation.
            </p>
          </div>

          {loadingTrips ? (
            <HomeTripSkeletons />
          ) : tripError ? (
            <p className="empty-state">
              Les départs ne peuvent pas être chargés pour le moment.
            </p>
          ) : trips.length === 0 ? (
            <p className="empty-state">
              Aucun voyage à venir n’est publié pour le moment.
            </p>
          ) : (
            <div className="trip-grid">
              {trips.slice(0, 3).map((trip) => (
                <TripCard
                  key={trip.id_voyage}
                  trip={trip}
                  onBook={(selectedTrip) => {
                    router.push(`/voyages/${encodeURIComponent(selectedTrip.id_voyage)}`);
                  }}
                />
              ))}
            </div>
          )}
          {tripCount > 3 ? (
            <div className="trip-more">
              <Link className="trip-more__button" href="/voyages">
                Voir plus de voyages <Icon name="arrow" className="icon-small" />
              </Link>
            </div>
          ) : null}
          {searchResults?.length ? (
            <section className="home-search-results" aria-live="polite">
              <div className="section-heading">
                <h3>Résultats de votre recherche</h3>
              </div>
              <div className="trip-grid trip-grid--results">
                {pageSearchResults.map((trip) => (
                  <TripCard
                    key={trip.id_voyage}
                    trip={trip}
                    onBook={(selectedTrip) => {
                      router.push(
                        `/voyages/${encodeURIComponent(selectedTrip.id_voyage)}?passagers=${passengers}`,
                      );
                    }}
                  />
                ))}
              </div>
              {searchResultsPagination}
              {searchResultCount > 1 ? (
                <div className="trip-more">
                  <Link
                    className="trip-more__button"
                    href={`/voyages?${new URLSearchParams({
                      ville_depart: from,
                      ville_arrivee: to,
                      date_depart: date,
                      places_min: String(passengers),
                    })}`}
                  >
                    Afficher tous les résultats <Icon name="arrow" className="icon-small" />
                  </Link>
                </div>
              ) : null}
            </section>
          ) : null}
        </section>

        <section className="benefits-section" id="avantages">
          <div className="benefits-inner">
            <div className="section-heading">
              <p className="eyebrow eyebrow--section">
                <span className="eyebrow__line" />
                <span className="eyebrow__label">
                  Simple. Rapide. Sans attente.
                </span>
                <span className="eyebrow__line" />
              </p>
              <h2>
                Votre voyage commence <span>avant le départ.</span>
              </h2>
              <p className="section-heading__description">
                Kinesis rassemble les compagnies et les voyageurs dans une
                expérience pensée pour les déplacements au Togo.
              </p>
            </div>
            <div className="benefit-grid">
              {benefits.map((benefit) => (
                <article className="benefit-card" key={benefit.title}>
                  <span className="benefit-card__icon">
                    <Icon name={benefit.icon} />
                  </span>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <AppDialog
        open={searchDialogOpen}
        title="Rechercher un voyage"
        className="booking-search-dialog"
        onClose={() => setSearchDialogOpen(false)}
      >
        <BookingSearchForm
          id="mobile-search-form"
          cities={cities}
          from={from}
          to={to}
          date={date}
          minimumDate={minimumDate}
          passengers={passengers}
          loadingCities={loadingCities}
          searching={searching}
          onFromChange={setFrom}
          onToChange={setTo}
          onDateChange={setDate}
          onPassengersChange={setPassengers}
          onSwap={swapCities}
          onSubmit={searchTrips}
        />
        {cityError || tripError ? (
          <div className="api-notice" role="status">
            <strong>Informations de voyage indisponibles.</strong>
            {cityError ? <span>Villes : {cityError}</span> : null}
            {tripError ? <span>Départs : {tripError}</span> : null}
          </div>
        ) : null}
        {searchMessage ? (
          <div className="search-feedback" role="status" aria-live="polite">
            <p>{searchMessage}</p>
          </div>
        ) : null}
      </AppDialog>

      <footer className="site-footer">
        <div className="footer-main">
          <a className="brand" href="#accueil" aria-label="Kinesis, accueil">
            <Image
              src="/kinesis-mark.png"
              width={48}
              height={48}
              alt=""
              className="brand__mark"
            />
            <span>KINESIS</span>
          </a>
          <p>Le Togo en mouvement, avec vous.</p>
          <nav aria-label="Navigation de pied de page">
            <a href="#avantages">À propos</a>
            <Link href="/voyages">Voyages</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          © Kinesis. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}
