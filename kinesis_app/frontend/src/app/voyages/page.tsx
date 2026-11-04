"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import type { Ville, Voyage } from "@/lib/types";
import KinesisLoader from "@/components/kinesis-loader";
import { useListPagination } from "@/components/list-pagination";
import VoyagesPageHeader from "@/components/voyages-page-header";

type Filters = {
  ville_depart: string;
  ville_arrivee: string;
  date_depart: string;
  date_depart_apres: string;
  date_depart_avant: string;
  compagnie: string;
  prix_min: string;
  prix_max: string;
  places_min: string;
  ordering: string;
};

const emptyFilters: Filters = {
  ville_depart: "",
  ville_arrivee: "",
  date_depart: "",
  date_depart_apres: "",
  date_depart_avant: "",
  compagnie: "",
  prix_min: "",
  prix_max: "",
  places_min: "1",
  ordering: "date_depart",
};

function filtersFromQuery(query: string): Filters {
  const params = new URLSearchParams(query);
  const initialFilters = { ...emptyFilters };
  for (const key of Object.keys(initialFilters) as (keyof Filters)[]) {
    const value = params.get(key);
    if (value) initialFilters[key] = value;
  }
  return initialFilters;
}

function isVille(value: unknown): value is Ville {
  return (
    typeof value === "object" &&
    value !== null &&
    "id_ville" in value &&
    typeof value.id_ville === "string" &&
    "nom" in value &&
    typeof value.nom === "string"
  );
}

function isVoyage(value: unknown): value is Voyage {
  return (
    typeof value === "object" &&
    value !== null &&
    "id_voyage" in value &&
    typeof value.id_voyage === "string" &&
    "ville_depart_nom" in value &&
    typeof value.ville_depart_nom === "string" &&
    "ville_arrivee_nom" in value &&
    typeof value.ville_arrivee_nom === "string" &&
    "places_disponibles" in value &&
    typeof value.places_disponibles === "number"
  );
}

async function getList<T>(
  url: string,
  isItem: (value: unknown) => value is T,
): Promise<T[]> {
  const response = await fetch(url, { cache: "no-store" });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const detail =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : "Le chargement des voyages a échoué.";
    throw new Error(detail);
  }
  if (!Array.isArray(payload) || !payload.every(isItem)) {
    throw new Error("Les données reçues du serveur sont invalides.");
  }
  return payload;
}

function formatPrice(price: string | number) {
  const amount = Number(price);
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function buildQuery(filters: Filters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && !(key === "places_min" && value === "1") && key !== "ordering") {
      query.set(key, value);
    }
  }
  if (filters.ordering !== "date_depart") query.set("ordering", filters.ordering);
  return query;
}

function VoyagesCatalog() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.toString();
  const [cities, setCities] = useState<Ville[]>([]);
  const [allTrips, setAllTrips] = useState<Voyage[]>([]);
  const [trips, setTrips] = useState<Voyage[]>([]);
  const [filters, setFilters] = useState<Filters>(() =>
    filtersFromQuery(initialQuery),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { pageItems: pageTrips, pagination, resetPage } =
    useListPagination(trips);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [cityList, allVoyages] = await Promise.all([
          getList("/api/villes", isVille),
          getList("/api/voyages", isVoyage),
        ]);
        if (!active) return;
        setCities(cityList);
        setAllTrips(allVoyages);
        const query = buildQuery(filtersFromQuery(initialQuery));
        const visibleTrips =
          query.size > 0
            ? await getList(
                `/api/voyages?${query.toString()}`,
                isVoyage,
              )
            : allVoyages;
        if (active) {
          setTrips(visibleTrips);
          setError("");
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Les voyages n’ont pas pu être chargés.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [initialQuery]);

  function updateFilter(field: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetPage();
    if (
      filters.ville_depart &&
      filters.ville_arrivee &&
      filters.ville_depart === filters.ville_arrivee
    ) {
      setError("Les villes de départ et d’arrivée doivent être différentes.");
      return;
    }
    if (
      filters.date_depart_apres &&
      filters.date_depart_avant &&
      filters.date_depart_apres > filters.date_depart_avant
    ) {
      setError("La date de fin doit suivre la date de début.");
      return;
    }
    if (
      filters.prix_min &&
      filters.prix_max &&
      Number(filters.prix_min) > Number(filters.prix_max)
    ) {
      setError("Le prix maximum doit être supérieur au prix minimum.");
      return;
    }
    const query = buildQuery(filters);
    const nextUrl = query.size ? `/voyages?${query.toString()}` : "/voyages";
    window.history.replaceState(null, "", nextUrl);
    setLoading(true);
    setError("");
    try {
      const results = await getList(
        query.size ? `/api/voyages?${query.toString()}` : "/api/voyages",
        isVoyage,
      );
      setTrips(results);
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "La recherche a échoué.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function clearFilters() {
    resetPage();
    setFilters(emptyFilters);
    window.history.replaceState(null, "", "/voyages");
    setLoading(true);
    setError("");
    try {
      setTrips(await getList("/api/voyages", isVoyage));
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Les voyages n’ont pas pu être chargés.",
      );
    } finally {
      setLoading(false);
    }
  }

  const companies = Array.from(
    new Map(
      allTrips
        .filter((trip) => trip.compagnie && trip.compagnie_nom)
        .map((trip) => [
          trip.compagnie,
          { id: trip.compagnie, name: trip.compagnie_nom },
        ]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <main className="voyage-catalog">
      <VoyagesPageHeader currentPage="catalogue" />

      <section className="catalog-hero">
        <div className="catalog-hero__content">
          <p className="catalog-hero__eyebrow">LE TOGO EN MOUVEMENT, AVEC VOUS</p>
          <h1>Trouvez votre prochain <span>départ.</span></h1>
          <p>Comparez les itinéraires et choisissez le voyage qui vous convient.</p>
        </div>
      </section>

      <div className="catalog-layout">
        <form className="catalog-filters" onSubmit={search}>
          <div className="catalog-filters__heading">
            <div>
              <span className="catalog-filters__eyebrow">AFFINER</span>
              <h2>Votre recherche</h2>
            </div>
            <button type="button" onClick={() => void clearFilters()}>Effacer</button>
          </div>
          <label>
            Ville de départ
            <select
              value={filters.ville_depart}
              onChange={(event) => updateFilter("ville_depart", event.target.value)}
            >
              <option value="">Toutes les villes</option>
              {cities.map((city) => <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>)}
            </select>
          </label>
          <label>
            Ville d’arrivée
            <select
              value={filters.ville_arrivee}
              onChange={(event) => updateFilter("ville_arrivee", event.target.value)}
            >
              <option value="">Toutes les villes</option>
              {cities.map((city) => <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>)}
            </select>
          </label>
          <label>
            Date précise
            <input
              type="date"
              value={filters.date_depart}
              onChange={(event) => updateFilter("date_depart", event.target.value)}
            />
          </label>
          <div className="catalog-filters__row">
            <label>
              À partir du
              <input
                type="date"
                value={filters.date_depart_apres}
                onChange={(event) => updateFilter("date_depart_apres", event.target.value)}
              />
            </label>
            <label>
              Jusqu’au
              <input
                type="date"
                value={filters.date_depart_avant}
                onChange={(event) => updateFilter("date_depart_avant", event.target.value)}
              />
            </label>
          </div>
          <label>
            Compagnie
            <select
              value={filters.compagnie}
              onChange={(event) => updateFilter("compagnie", event.target.value)}
            >
              <option value="">Toutes les compagnies</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <div className="catalog-filters__row">
            <label>
              Prix min. (FCFA)
              <input
                type="number"
                min="0"
                value={filters.prix_min}
                onChange={(event) => updateFilter("prix_min", event.target.value)}
              />
            </label>
            <label>
              Prix max. (FCFA)
              <input
                type="number"
                min="0"
                value={filters.prix_max}
                onChange={(event) => updateFilter("prix_max", event.target.value)}
              />
            </label>
          </div>
          <label>
            Nombre de places
            <input
              type="number"
              min="1"
              max="100"
              value={filters.places_min}
              onChange={(event) => updateFilter("places_min", event.target.value)}
            />
          </label>
          <label>
            Trier par
            <select
              value={filters.ordering}
              onChange={(event) => updateFilter("ordering", event.target.value)}
            >
              <option value="date_depart">Départ le plus proche</option>
              <option value="prix">Prix croissant</option>
              <option value="-prix">Prix décroissant</option>
            </select>
          </label>
          <button className="catalog-submit" type="submit">Rechercher</button>
        </form>

        <section className="catalog-results" aria-live="polite">
          <div className="catalog-results__heading">
            <div>
              <p className="catalog-results__eyebrow">SÉLECTION KINESIS</p>
              <h2>Les prochains départs</h2>
            </div>
            {!loading && !error ? (
              <span className="catalog-results__count">
                <strong>{trips.length}</strong>
                <span>voyage{trips.length > 1 ? "s" : ""}</span>
              </span>
            ) : null}
          </div>
          {loading ? <KinesisLoader message="Chargement des voyages…" variant="inline" /> : null}
          {error ? <p className="catalog-message catalog-message--error" role="alert">{error}</p> : null}
          {!loading && !error && trips.length === 0 ? (
            <p className="catalog-message">Aucun voyage ne correspond à ces critères. Modifiez vos filtres et réessayez.</p>
          ) : null}
          <div className="catalog-grid">
            {pageTrips.map((trip) => (
              <Link
                className="catalog-card"
                href={`/voyages/${encodeURIComponent(trip.id_voyage)}?passagers=${encodeURIComponent(filters.places_min || "1")}`}
                key={trip.id_voyage}
              >
                <div className="catalog-card__image">
                  {trip.image ? <Image src={trip.image} alt="" fill sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw" unoptimized /> : null}
                  <span>{trip.places_disponibles} place{trip.places_disponibles > 1 ? "s" : ""} disponible{trip.places_disponibles > 1 ? "s" : ""}</span>
                </div>
                <div className="catalog-card__body">
                  <p>{trip.compagnie_nom || "Compagnie"}</p>
                  <h3>{trip.ville_depart_nom} <span aria-hidden="true">→</span> {trip.ville_arrivee_nom}</h3>
                  <div className="catalog-card__meta">
                    <span>{formatDate(trip.date_depart)}</span>
                    <span>{trip.heure_depart.slice(0, 5)}</span>
                  </div>
                  <div className="catalog-card__footer">
                    <strong>{formatPrice(trip.prix)}</strong>
                    <span>Voir le voyage <span aria-hidden="true">→</span></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {pagination}
        </section>
      </div>
    </main>
  );
}

export default function VoyagesPage() {
  return (
    <Suspense fallback={<KinesisLoader message="Chargement des voyages…" />}>
      <VoyagesCatalog />
    </Suspense>
  );
}
