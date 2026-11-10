"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  MapPin,
  Minus,
  Plus,
  UsersRound,
} from "lucide-react";
import type { Voyage } from "@/lib/types";
import KinesisLoader from "@/components/kinesis-loader";
import VoyageCoverImage from "@/components/voyage-cover-image";
import VoyagesPageHeader from "@/components/voyages-page-header";
import { getUserFacingErrorMessage } from "@/lib/user-facing-errors";
import { cacheVoyages, getCachedVoyage, isCachedVoyage } from "@/lib/voyage-cache";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";
import {
  isReservationDraft,
  reservationDraftKey,
} from "@/lib/reservation-draft";

type BaggageTariff = {
  id_tarif: string;
  poids_min: string | number;
  poids_max: string | number;
  prix: string | number;
};

function formatPrice(price: string | number) {
  const amount = Number(price);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`
    : "Prix indisponible";
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00`));
}

export default function VoyageDetailClient({
  voyageId,
  passengerCount,
}: {
  voyageId: string;
  passengerCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const cachedTrip = getCachedVoyage(voyageId);
  const [trip, setTrip] = useState<Voyage | null>(() => cachedTrip);
  const [loading, setLoading] = useState(() => !cachedTrip);
  const [error, setError] = useState("");
  const initialPassengerCount =
    Number.isFinite(passengerCount) && passengerCount > 0 ? passengerCount : 1;
  const [passengers, setPassengers] = useState(initialPassengerCount);
  const [passengerNames, setPassengerNames] = useState<string[]>(() =>
    Array.from({ length: initialPassengerCount }, () => ""),
  );
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [baggageAnswer, setBaggageAnswer] = useState<boolean | null>(null);
  const [baggageTariffs, setBaggageTariffs] = useState<BaggageTariff[] | null>(
    null,
  );
  const [loadingBaggageTariffs, setLoadingBaggageTariffs] = useState(false);
  const [baggageTariffError, setBaggageTariffError] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const total = useMemo(
    () => (trip ? Number(trip.prix) * passengers : 0),
    [trip, passengers],
  );

  useEffect(() => {
    if (pathname !== `/voyages/${voyageId}`) return;
    const resetTimer = window.setTimeout(() => setSubmitting(false), 0);
    return () => window.clearTimeout(resetTimer);
  }, [pathname, voyageId]);

  useEffect(() => {
    let active = true;
    const cachedVoyage = getCachedVoyage(voyageId);
    const restoreDraftTimer = window.setTimeout(() => {
      try {
        const storedValue = window.sessionStorage.getItem(
          reservationDraftKey(voyageId),
        );
        if (!storedValue) return;
        const parsedDraft: unknown = JSON.parse(storedValue);
        if (!isReservationDraft(parsedDraft)) {
          throw new Error("Les informations de réservation sauvegardées sont invalides.");
        }
        if (!active) return;
        setPassengers(parsedDraft.passengers.length);
        setPassengerNames(parsedDraft.passengers);
        setBaggageAnswer(parsedDraft.hasBaggage);
      } catch (draftError: unknown) {
        if (active) {
          setBookingError(
            getUserFacingErrorMessage(
              draftError,
              "Les informations de réservation sauvegardées sont invalides.",
            ),
          );
        }
      }
    }, 0);

    async function loadTrip() {
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
        if (!isCachedVoyage(payload)) {
          throw new Error("Les informations reçues pour ce voyage sont invalides.");
        }
        cacheVoyages([payload]);
        if (active) setTrip(payload);
      } catch (loadError) {
        if (active && !cachedVoyage) {
          setError(
            getUserFacingErrorMessage(loadError, "Le voyage n’a pas pu être chargé."),
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    if (voyageId) void loadTrip();

    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) {
          throw new Error(`Le profil n’a pas pu être chargé (${response.status}).`);
        }
        const result: unknown = await response.json();
        if (!isUserProfile(result)) {
          throw new Error("Le profil reçu du serveur est invalide.");
        }
        return result;
      })
      .then((result) => {
        if (!active || !result) return;
        setProfile(result);
        const fullName = [result.prenoms, result.nom].filter(Boolean).join(" ");
        setPassengerNames((current) =>
          current.map((name, index) => (index === 0 && !name ? fullName : name)),
        );
      })
      .catch((profileLoadError: unknown) => {
        if (active) {
          setProfileError(
            getUserFacingErrorMessage(
              profileLoadError,
              "La session ne peut pas être vérifiée.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });

    return () => {
      active = false;
      window.clearTimeout(restoreDraftTimer);
    };
  }, [voyageId]);

  async function answerBaggageQuestion(answer: boolean) {
    setBaggageAnswer(answer);
    setBaggageTariffError("");
    if (!answer || baggageTariffs !== null || !trip) return;

    setLoadingBaggageTariffs(true);
    try {
      const response = await fetch(
        `/api/voyages/${encodeURIComponent(trip.id_voyage)}/tarifs-bagages`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(`Les tarifs de bagages n’ont pas pu être chargés (${response.status}).`);
      }
      const payload: unknown = await response.json();
      const items =
        typeof payload === "object" &&
        payload !== null &&
        "results" in payload
          ? payload.results
          : payload;
      if (
        !Array.isArray(items) ||
        !items.every(
          (item): item is BaggageTariff =>
            typeof item === "object" &&
            item !== null &&
            "id_tarif" in item &&
            typeof item.id_tarif === "string" &&
            "poids_min" in item &&
            (typeof item.poids_min === "string" ||
              typeof item.poids_min === "number") &&
            "poids_max" in item &&
            (typeof item.poids_max === "string" ||
              typeof item.poids_max === "number") &&
            "prix" in item &&
            (typeof item.prix === "string" || typeof item.prix === "number"),
        )
      ) {
        throw new Error("Les tarifs de bagages reçus sont invalides.");
      }
      setBaggageTariffs(items);
    } catch (loadError: unknown) {
      setBaggageTariffError(
        getUserFacingErrorMessage(
          loadError,
          "Impossible de charger les tarifs des bagages.",
        ),
      );
    } finally {
      setLoadingBaggageTariffs(false);
    }
  }

  function updatePassengerCount(nextCount: number) {
    const next = Math.min(Math.max(nextCount, 1), 100);
    setPassengers(next);
    setPassengerNames((current) =>
      Array.from({ length: next }, (_, index) => current[index] ?? ""),
    );
    setBookingError("");
  }

  function continueToReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip) return;
    if (profileError) {
      setBookingError(profileError);
      return;
    }
    if (trip.places_disponibles < passengers) {
      setBookingError(
        `Il ne reste que ${trip.places_disponibles} place${trip.places_disponibles > 1 ? "s" : ""} disponible${trip.places_disponibles > 1 ? "s" : ""}.`,
      );
      return;
    }
    if (passengerNames.length !== passengers || passengerNames.some((name) => !name.trim())) {
      setBookingError("Saisissez le nom complet de chaque passager.");
      return;
    }
    if (profile && profile.role !== "VOYAGEUR") {
      setBookingError("La réservation est réservée aux comptes voyageurs.");
      return;
    }

    const reservationPath =
      `/reservation/${encodeURIComponent(trip.id_voyage)}?passagers=${passengers}`;
    try {
      const draft = { passengers: passengerNames, hasBaggage: baggageAnswer };
      if (!isReservationDraft(draft)) {
        throw new Error("Les informations des passagers sont invalides.");
      }
      window.sessionStorage.setItem(
        reservationDraftKey(trip.id_voyage),
        JSON.stringify(draft),
      );
      setSubmitting(true);
      if (!profile) {
        router.push(`/connexion?next=${encodeURIComponent(reservationPath)}`);
        return;
      }
      router.push(reservationPath);
    } catch (saveError: unknown) {
      setBookingError(
        getUserFacingErrorMessage(
          saveError,
          "Les informations de réservation n’ont pas pu être conservées.",
        ),
      );
      setSubmitting(false);
    }
  }

  const enoughSeats = trip !== null && trip.places_disponibles >= passengers;

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
            <VoyageCoverImage
              image={trip.image}
              voyageId={trip.id_voyage}
              alt=""
              priority
              sizes="(max-width: 900px) 100vw, 1240px"
            />
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

            <form
              className="voyage-detail__booking"
              onSubmit={continueToReservation}
            >
              <p className="voyage-detail__section-label">RÉSERVATION</p>
              <span className="voyage-detail__price-caption">Prix par passager</span>
              <strong className="voyage-detail__price">{formatPrice(trip.prix)}</strong>
              <div className="voyage-detail__passenger-count">
                <span>Nombre de passagers</span>
                <div className="booking-passenger-stepper">
                  <button
                    type="button"
                    aria-label="Retirer un passager"
                    onClick={() => updatePassengerCount(passengers - 1)}
                    disabled={passengers <= 1}
                  >
                    <Minus aria-hidden="true" />
                  </button>
                  <strong aria-live="polite">{passengers}</strong>
                  <button
                    type="button"
                    aria-label="Ajouter un passager"
                    onClick={() => updatePassengerCount(passengers + 1)}
                    disabled={
                      passengers >= 100 ||
                      passengers >= trip.places_disponibles
                    }
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </div>
              </div>
              <small className="voyage-detail__seat-hint">
                {trip.places_disponibles} place
                {trip.places_disponibles > 1 ? "s" : ""} disponible
                {trip.places_disponibles > 1 ? "s" : ""}
              </small>
              <div className="voyage-detail__passenger-fields">
                {passengerNames.map((name, index) => (
                  <label key={index}>
                    <span>Nom complet du passager {index + 1}</span>
                    <input
                      autoComplete={index === 0 ? "name" : "off"}
                      maxLength={150}
                      placeholder="Ex. Kévin ADJAKLI"
                      required
                      value={name}
                      onChange={(event) =>
                        setPassengerNames((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? event.target.value
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <fieldset className="voyage-detail__baggage">
                <legend>Avez-vous des bagages ?</legend>
                <label>
                  <input
                    type="radio"
                    name="has-baggage"
                    checked={baggageAnswer === true}
                    onChange={() => void answerBaggageQuestion(true)}
                  />
                  Oui
                </label>
                <label>
                  <input
                    type="radio"
                    name="has-baggage"
                    checked={baggageAnswer === false}
                    onChange={() => void answerBaggageQuestion(false)}
                  />
                  Non
                </label>
                {baggageAnswer === true ? (
                  loadingBaggageTariffs ? (
                    <p role="status">Chargement des tarifs de bagages…</p>
                  ) : baggageTariffError ? (
                    <div className="booking-baggage-tariff-error" role="alert">
                      <span>{baggageTariffError}</span>
                      <button
                        type="button"
                        onClick={() => void answerBaggageQuestion(true)}
                      >
                        Réessayer
                      </button>
                    </div>
                  ) : baggageTariffs?.length ? (
                    <div className="booking-baggage-tariff-table-wrap">
                      <table className="booking-baggage-tariff-table">
                        <thead>
                          <tr>
                            <th scope="col">Poids</th>
                            <th scope="col">Frais de bagage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {baggageTariffs.map((tariff) => (
                            <tr key={tariff.id_tarif}>
                              <td>
                                De {tariff.poids_min} kg à moins de{" "}
                                {tariff.poids_max} kg
                              </td>
                              <td>{formatPrice(tariff.prix)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p>
                        Les frais de bagage sont réglés à la gare après pesée.
                      </p>
                    </div>
                  ) : (
                    <p>
                      Les frais de bagage seront confirmés à la gare.
                    </p>
                  )
                ) : null}
              </fieldset>
              <div className="voyage-detail__total">
                <span>Total du voyage</span>
                <strong>{formatPrice(total)}</strong>
              </div>
              {profileError || bookingError ? (
                <p className="detail-seats-warning" role="alert">
                  {bookingError || profileError}
                </p>
              ) : null}
              {!enoughSeats ? (
                <p className="detail-seats-warning" role="alert">
                  Il ne reste que {trip.places_disponibles} place
                  {trip.places_disponibles > 1 ? "s" : ""} disponible
                  {trip.places_disponibles > 1 ? "s" : ""}.
                </p>
              ) : null}
              <button
                className="catalog-submit"
                type="submit"
                disabled={
                  submitting ||
                  loadingProfile ||
                  !enoughSeats ||
                  Boolean(profileError)
                }
              >
                {submitting
                  ? "Préparation de votre réservation…"
                  : "Réserver ma place"}
                <span aria-hidden="true">→</span>
              </button>
              <p className="voyage-detail__secure">
                <span aria-hidden="true">✓</span>
                Paiement sécurisé · Places bloquées pendant 10 minutes
              </p>
            </form>
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
