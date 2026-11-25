"use client";

import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Ville, Voyage } from "@/lib/types";
import AppDialog from "@/components/app-dialog";
import KinesisLoader from "@/components/kinesis-loader";
import { CatalogTripSkeletons } from "@/components/voyage-skeletons";
import VoyageCard from "@/components/voyage-card";
import {
  ListPagination,
  type ListPageSize,
} from "@/components/list-pagination";
import VoyagesPageHeader from "@/components/voyages-page-header";
import {
  fetchPaginatedApiResponse,
  type PaginatedApiResponse,
} from "@/lib/paginated-api";
import { getPublicCities } from "@/lib/public-cities";
import { getUserFacingErrorMessage } from "@/lib/user-facing-errors";
import { cacheVoyages, isCachedVoyage } from "@/lib/voyage-cache";

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

type CompanyOption = { id: string; name: string };
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

function isCompanyOption(value: unknown): value is CompanyOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function parseCompanyOptions(value: unknown): CompanyOption[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(isCompanyOption)) {
    throw new Error("La liste des compagnies reçue est invalide.");
  }
  return value;
}

async function getCatalogPage(url: string): Promise<
  PaginatedApiResponse<Voyage> & { companies?: CompanyOption[] }
> {
  const result = await fetchPaginatedApiResponse(
    url,
    isCachedVoyage,
    "Le chargement des voyages a échoué.",
  );
  return {
    ...result,
    companies: parseCompanyOptions(result.companies),
  };
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

type CatalogFiltersFormProps = {
  filters: Filters;
  cities: Ville[];
  companies: { id: string; name: string }[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onChange: (field: keyof Filters, value: string) => void;
};

function CatalogFiltersForm({
  filters,
  cities,
  companies,
  onSubmit,
  onClear,
  onChange,
}: CatalogFiltersFormProps) {
  return (
    <form className="catalog-filters" onSubmit={onSubmit}>
      <div className="catalog-filters__heading">
        <div>
          <span className="catalog-filters__eyebrow">AFFINER</span>
          <h2>Votre recherche</h2>
        </div>
        <button type="button" onClick={onClear}>Effacer</button>
      </div>
      <label>
        Ville de départ
        <select value={filters.ville_depart} onChange={(event) => onChange("ville_depart", event.target.value)}>
          <option value="">Toutes les villes</option>
          {cities.map((city) => <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>)}
        </select>
      </label>
      <label>
        Ville d’arrivée
        <select value={filters.ville_arrivee} onChange={(event) => onChange("ville_arrivee", event.target.value)}>
          <option value="">Toutes les villes</option>
          {cities.map((city) => <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>)}
        </select>
      </label>
      <label>
        Date précise
        <input type="date" value={filters.date_depart} onChange={(event) => onChange("date_depart", event.target.value)} />
      </label>
      <div className="catalog-filters__row">
        <label>
          À partir du
          <input type="date" value={filters.date_depart_apres} onChange={(event) => onChange("date_depart_apres", event.target.value)} />
        </label>
        <label>
          Jusqu’au
          <input type="date" value={filters.date_depart_avant} onChange={(event) => onChange("date_depart_avant", event.target.value)} />
        </label>
      </div>
      <label>
        Compagnie
        <select value={filters.compagnie} onChange={(event) => onChange("compagnie", event.target.value)}>
          <option value="">Toutes les compagnies</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </label>
      <div className="catalog-filters__row">
        <label>
          Prix min. (FCFA)
          <input type="number" min="0" value={filters.prix_min} onChange={(event) => onChange("prix_min", event.target.value)} />
        </label>
        <label>
          Prix max. (FCFA)
          <input type="number" min="0" value={filters.prix_max} onChange={(event) => onChange("prix_max", event.target.value)} />
        </label>
      </div>
      <label>
        Nombre de places
        <input type="number" min="1" max="100" value={filters.places_min} onChange={(event) => onChange("places_min", event.target.value)} />
      </label>
      <label>
        Trier par
        <select value={filters.ordering} onChange={(event) => onChange("ordering", event.target.value)}>
          <option value="date_depart">Départ le plus proche</option>
          <option value="prix">Prix croissant</option>
          <option value="-prix">Prix décroissant</option>
        </select>
      </label>
      <button className="catalog-submit" type="submit">Rechercher</button>
    </form>
  );
}

function VoyagesCatalog() {
  const searchParams = useSearchParams();
  const [submittedQuery, setSubmittedQuery] = useState(() =>
    searchParams.toString(),
  );
  const [cities, setCities] = useState<Ville[]>([]);
  const [trips, setTrips] = useState<Voyage[]>([]);
  const [tripCount, setTripCount] = useState(0);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filters, setFilters] = useState<Filters>(() => filtersFromQuery(submittedQuery));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestFailed, setRequestFailed] = useState(false);
  const [cityError, setCityError] = useState("");
  const includeFacetsOnNextRequest = useRef(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(5);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    getPublicCities()
      .then((cityList) => {
        if (active) setCities(cityList);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setCityError(
            getUserFacingErrorMessage(
              loadError,
              "Les villes n’ont pas pu être chargées.",
            ),
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(submittedQuery);
    query.set("page", String(page));
    query.set("page_size", String(pageSize));
    if (includeFacetsOnNextRequest.current) {
      query.set("include_facets", "1");
    }

    getCatalogPage(`/api/voyages?${query.toString()}`)
      .then((result) => {
        if (!active) return;
        setTrips(result.results);
        cacheVoyages(result.results);
        setTripCount(result.count);
        setRequestFailed(false);
        if (result.companies) {
          setCompanies(result.companies);
          includeFacetsOnNextRequest.current = false;
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setRequestFailed(true);
          setError(
            getUserFacingErrorMessage(
              loadError,
              "Les voyages n’ont pas pu être chargés.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [submittedQuery, page, pageSize, refreshKey]);

  function updateFilter(field: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestFailed(false);
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
    setRequestFailed(false);
    includeFacetsOnNextRequest.current = true;
    setSubmittedQuery(query.toString());
    setPage(1);
    setRefreshKey((current) => current + 1);
    setMobileFiltersOpen(false);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    window.history.replaceState(null, "", "/voyages");
    setLoading(true);
    setError("");
    setRequestFailed(false);
    includeFacetsOnNextRequest.current = true;
    setSubmittedQuery("");
    setPage(1);
    setRefreshKey((current) => current + 1);
    setMobileFiltersOpen(false);
  }

  function retryCatalogRequest() {
    setLoading(true);
    setError("");
    setRequestFailed(false);
    setRefreshKey((current) => current + 1);
  }

  return (
    <main className="voyage-catalog">
      <VoyagesPageHeader currentPage="catalogue" />

      <div className="catalog-layout">
        <div className="catalog-filters-desktop">
          <CatalogFiltersForm
            filters={filters}
            cities={cities}
            companies={companies}
            onSubmit={search}
            onClear={clearFilters}
            onChange={updateFilter}
          />
        </div>
        <button
          className="catalog-mobile-filter-trigger"
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
        >
          Filtrer les voyages
        </button>
        <AppDialog
          open={mobileFiltersOpen}
          title="Filtrer les voyages"
          className="catalog-filters-dialog"
          onClose={() => setMobileFiltersOpen(false)}
        >
          {error ? (
            requestFailed ? (
              <div className="catalog-message catalog-message--error catalog-message--retry" role="alert">
                <span>{error}</span>
                <button type="button" onClick={retryCatalogRequest}>Réessayer</button>
              </div>
            ) : (
              <p className="catalog-message catalog-message--error" role="alert">{error}</p>
            )
          ) : null}
          <CatalogFiltersForm
            filters={filters}
            cities={cities}
            companies={companies}
            onSubmit={search}
            onClear={clearFilters}
            onChange={updateFilter}
          />
        </AppDialog>

        <section className="catalog-results" aria-live="polite">
          {cityError ? (
            <p className="catalog-message catalog-message--error" role="alert">
              Les filtres de ville sont indisponibles : {cityError}
            </p>
          ) : null}
          <div className="catalog-results__heading">
            <div>
              <p className="catalog-results__eyebrow">SÉLECTION KINESIS</p>
              <h2>Les prochains départs</h2>
            </div>
            {!loading && !error ? (
              <span className="catalog-results__count">
                <strong>{tripCount}</strong>
                <span>voyage{tripCount > 1 ? "s" : ""}</span>
              </span>
            ) : null}
          </div>
          {error ? (
            requestFailed ? (
              <div className="catalog-message catalog-message--error catalog-message--retry" role="alert">
                <span>{error}</span>
                <button type="button" onClick={retryCatalogRequest}>Réessayer</button>
              </div>
            ) : (
              <p className="catalog-message catalog-message--error" role="alert">{error}</p>
            )
          ) : null}
          {!loading && !error && trips.length === 0 ? (
            <p className="catalog-message">Aucun voyage ne correspond à ces critères. Modifiez vos filtres et réessayez.</p>
          ) : null}
          {loading ? (
            <CatalogTripSkeletons count={pageSize} />
          ) : (
          <div className="catalog-grid">
            {trips.map((trip) => (
              <VoyageCard
                href={`/voyages/${encodeURIComponent(trip.id_voyage)}?passagers=${encodeURIComponent(filters.places_min || "1")}`}
                key={trip.id_voyage}
                trip={trip}
              />
            ))}
          </div>
          )}
          <ListPagination
            totalItems={tripCount}
            page={page}
            pageSize={pageSize}
            loading={loading}
            onPageChange={(nextPage) => {
              setLoading(true);
              setError("");
              setRequestFailed(false);
              setPage(nextPage);
            }}
            onPageSizeChange={(nextPageSize) => {
              setLoading(true);
              setError("");
              setRequestFailed(false);
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
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
