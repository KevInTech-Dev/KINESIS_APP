"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { Voyage } from "@/lib/types";
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

  return (
    <main className="voyage-detail-page">
      <VoyagesPageHeader currentPage="detail" />

      {loading ? <p className="catalog-message">Chargement du voyage…</p> : null}
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
              <h2>Tout est prêt pour votre départ.</h2>
              <div className="voyage-detail__facts">
                <div>
                  <span className="voyage-detail__fact-icon" aria-hidden="true">01</span>
                  <span><small>Ville de départ</small><strong>{trip.ville_depart_nom}</strong></span>
                </div>
                <div>
                  <span className="voyage-detail__fact-icon" aria-hidden="true">02</span>
                  <span><small>Ville d’arrivée</small><strong>{trip.ville_arrivee_nom}</strong></span>
                </div>
                <div>
                  <span className="voyage-detail__fact-icon" aria-hidden="true">03</span>
                  <span>
                    <small>Places disponibles</small>
                    <strong>{trip.places_disponibles} place{trip.places_disponibles > 1 ? "s" : ""}</strong>
                  </span>
                </div>
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
    <Suspense fallback={<p className="catalog-message">Chargement du voyage…</p>}>
      <VoyageDetailContent />
    </Suspense>
  );
}
