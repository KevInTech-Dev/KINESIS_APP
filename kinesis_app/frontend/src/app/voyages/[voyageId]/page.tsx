"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowUpRight, MapPin, UsersRound } from "lucide-react";
import type { Voyage } from "@/lib/types";
import KinesisLoader from "@/components/kinesis-loader";
import VoyagesPageHeader from "@/components/voyages-page-header";

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

function formatPrice(price: string | number) {
  return `${new Intl.NumberFormat("fr-FR").format(Number(price))} FCFA`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function VoyageDetailContent() {
  const params = useParams<{ voyageId: string }>();
  const searchParams = useSearchParams();
  const voyageId = params.voyageId;
  const [trip, setTrip] = useState<Voyage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const rawPassengers = Number.parseInt(searchParams.get("passagers") || "1", 10);
  const passengers =
    Number.isFinite(rawPassengers) && rawPassengers > 0 ? rawPassengers : 1;

  useEffect(() => {
    let active = true;
    async function loadTrip() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/voyages/${encodeURIComponent(voyageId)}`,
          { cache: "no-store" },
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
          const detail =
            typeof payload === "object" &&
            payload !== null &&
            "detail" in payload &&
            typeof payload.detail === "string"
              ? payload.detail
              : "Ce voyage n’est plus disponible.";
          throw new Error(detail);
        }
        if (!isVoyage(payload)) {
          throw new Error("Les informations reçues pour ce voyage sont invalides.");
        }
        if (active) setTrip(payload);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Le voyage n’a pas pu être chargé.",
          );
        }

      } finally {
        if (active) setLoading(false);
      }
    }
    if (voyageId) void loadTrip();
    return () => {
      active = false;
    };
  }, [voyageId]);

  const enoughSeats = trip !== null && trip.places_disponibles >= passengers;
  const bookingHref = trip
    ? `/reservation/${encodeURIComponent(trip.id_voyage)}?passagers=${passengers}`
    : "#";

  if (loading) {
    return <KinesisLoader message="Chargement du voyage…" />;
  }

  return (
    <main className="voyage-detail-page">
      <VoyagesPageHeader currentPage="detail" />

      {!loading && error ? (
        <section className="detail-state" role="alert">
          <h1>Voyage indisponible</h1>
          <p>{error}</p>
          <Link className="catalog-submit" href="/voyages">Parcourir les voyages</Link>
        </section>
      ) : null}
      {!loading && trip ? (
        <article className="voyage-detail-page__content">
          <div className="voyage-detail__cover">
            {trip.image ? (
              <Image
                src={trip.image}
                alt=""
                fill
                priority
                sizes="(max-width: 900px) 100vw, 1240px"
                unoptimized
              />
            ) : null}
            <div className="voyage-detail__cover-shade" />
            <Link href="/voyages" className="voyage-detail__back">
              <span aria-hidden="true">←</span> Tous les voyages
            </Link>
            <div className="voyage-detail__cover-copy">
              <p>VOTRE PROCHAIN DÉPART</p>
              <h1>
                <span className="voyage-detail__origin">{trip.ville_depart_nom}</span>
                <span className="voyage-detail__route-arrow" aria-hidden="true"> →  </span>
                <span className="voyage-detail__destination">{trip.ville_arrivee_nom}</span>
              </h1>
              <span className="voyage-detail__cover-date">
                {formatDate(trip.date_depart)} <span aria-hidden="true">·</span>{" "}
                {trip.heure_depart.slice(0, 5)}
              </span>
            </div>
            <span className="voyage-detail__company">
              Opéré par <strong>{trip.compagnie_nom || "une compagnie partenaire"}</strong>
            </span>
          </div>

          <div className="voyage-detail__lower">
            <section className="voyage-detail__information">
              <p className="voyage-detail__section-label">LES INFORMATIONS DU TRAJET</p>
              <h2>Les étapes de votre voyage</h2>
              <div className="voyage-detail__facts">
                <article className="voyage-detail__stop">
                  <span className="voyage-detail__stop-icon voyage-detail__stop-icon--origin" aria-hidden="true">
                    <MapPin />
                  </span>
                  <div className="voyage-detail__stop-copy">
                    <small>Ville de départ</small>
                    <h3>{trip.ville_depart_nom}</h3>
                    {trip.gare_depart ? (
                      <>
                        <span className="voyage-detail__station-name">{trip.gare_depart.nom}</span>
                        <span className="voyage-detail__station-address">{trip.gare_depart.adresse}</span>
                        {trip.gare_depart.maps_url ? (
                          <a className="maps-link" href={trip.gare_depart.maps_url} target="_blank" rel="noreferrer">
                            <MapPin aria-hidden="true" />
                            <span>Ouvrir dans Google Maps</span>
                            <ArrowUpRight aria-hidden="true" />
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <span className="voyage-detail__station-address">Lieu exact à confirmer auprès de la compagnie</span>
                    )}
                  </div>
                  <span className="voyage-detail__stop-tag">DÉPART</span>
                </article>
                <article className="voyage-detail__stop">
                  <span className="voyage-detail__stop-icon voyage-detail__stop-icon--destination" aria-hidden="true">
                    <MapPin />
                  </span>
                  <div className="voyage-detail__stop-copy">
                    <small>Ville d’arrivée</small>
                    <h3>{trip.ville_arrivee_nom}</h3>
                    {trip.gare_arrivee ? (
                      <>
                        <span className="voyage-detail__station-name">{trip.gare_arrivee.nom}</span>
                        <span className="voyage-detail__station-address">{trip.gare_arrivee.adresse}</span>
                        {trip.gare_arrivee.maps_url ? (
                          <a className="maps-link" href={trip.gare_arrivee.maps_url} target="_blank" rel="noreferrer">
                            <MapPin aria-hidden="true" />
                            <span>Ouvrir dans Google Maps</span>
                            <ArrowUpRight aria-hidden="true" />
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <span className="voyage-detail__station-address">Lieu exact à confirmer auprès de la compagnie</span>
                    )}
                  </div>
                  <span className="voyage-detail__stop-tag voyage-detail__stop-tag--destination">ARRIVÉE</span>
                </article>
              </div>
              <div className="voyage-detail__availability">
                <UsersRound aria-hidden="true" />
                <span>Disponibilité</span>
                <strong>{trip.places_disponibles} place{trip.places_disponibles > 1 ? "s" : ""}</strong>
              </div>
            </section>

            <aside className="voyage-detail__booking">
              <p className="voyage-detail__section-label">RÉSERVATION</p>
              <span className="voyage-detail__price-caption">Prix par passager</span>
              <strong className="voyage-detail__price">{formatPrice(trip.prix)}</strong>
              {enoughSeats ? (
                <Link className="catalog-submit" href={bookingHref}>
                  Réserver {passengers > 1 ? `pour ${passengers} passagers` : "ma place"}
                  <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <p className="detail-seats-warning">
                  Il ne reste que {trip.places_disponibles} place{trip.places_disponibles > 1 ? "s" : ""} pour {passengers} passager{passengers > 1 ? "s" : ""}.
                </p>
              )}
              <p className="voyage-detail__secure">
                <span aria-hidden="true">✓</span>
                Paiement sécurisé · Places bloquées pendant 10 minutes
              </p>
            </aside>
          </div>
          <div className="voyage-detail__help">
            <p>Un voyage, sans stress. Réservez en ligne et retrouvez votre billet dans votre espace voyageur.</p>
            <Link href="/voyages">Explorer d’autres départs <span aria-hidden="true">→</span></Link>
          </div>
        </article>
      ) : null}
    </main>
  );
}

export default function VoyageDetailPage() {
  return (
    <Suspense fallback={<KinesisLoader message="Chargement du voyage…" />}>
      <VoyageDetailContent />
    </Suspense>
  );
}
