"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import KinesisLoader from "@/components/kinesis-loader";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

type Station = { nom: string; adresse: string; maps_url: string | null };
type Trip = {
  id_voyage: string;
  compagnie_nom: string;
  ville_depart_nom: string;
  ville_arrivee_nom: string;
  gare_depart: Station | null;
  gare_arrivee: Station | null;
  date_depart: string;
  heure_depart: string;
  places_disponibles: number;
  prix: number | string;
  statut: string;
};

type BaggageTariff = {
  id_tarif: string;
  poids_min: string | number;
  poids_max: string | number;
  prix: string | number;
};

function isStation(value: unknown): value is Station {
  return (
    typeof value === "object" &&
    value !== null &&
    "nom" in value &&
    typeof value.nom === "string" &&
    "adresse" in value &&
    typeof value.adresse === "string" &&
    "maps_url" in value &&
    (typeof value.maps_url === "string" || value.maps_url === null)
  );
}

function isTrip(value: unknown): value is Trip {
  return (
    typeof value === "object" &&
    value !== null &&
    "id_voyage" in value &&
    typeof value.id_voyage === "string" &&
    "compagnie_nom" in value &&
    typeof value.compagnie_nom === "string" &&
    "ville_depart_nom" in value &&
    typeof value.ville_depart_nom === "string" &&
    "ville_arrivee_nom" in value &&
    typeof value.ville_arrivee_nom === "string" &&
    "gare_depart" in value &&
    (value.gare_depart === null || isStation(value.gare_depart)) &&
    "gare_arrivee" in value &&
    (value.gare_arrivee === null || isStation(value.gare_arrivee)) &&
    "date_depart" in value &&
    typeof value.date_depart === "string" &&
    "heure_depart" in value &&
    typeof value.heure_depart === "string" &&
    "places_disponibles" in value &&
    typeof value.places_disponibles === "number" &&
    "prix" in value &&
    (typeof value.prix === "string" || typeof value.prix === "number") &&
    "statut" in value &&
    typeof value.statut === "string"
  );
}

async function responseMessage(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "detail" in body) {
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.join(" ");
  }
  if (typeof body === "object" && body !== null) {
    for (const value of Object.values(body)) {
      if (typeof value === "string") return value;
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        return value.join(" ");
      }
    }
  }
  return `La demande a échoué (${response.status}).`;
}

function formatPrice(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("fr-FR").format(amount)} F CFA`
    : "Prix indisponible";
}

export default function BookingPage({
  voyageId,
  passengerCount,
}: {
  voyageId: string;
  passengerCount: number;
}) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [baggageAnswer, setBaggageAnswer] = useState<"yes" | "no" | null>(
    null,
  );
  const [baggageTariffs, setBaggageTariffs] = useState<BaggageTariff[] | null>(
    null,
  );
  const [loadingBaggageTariffs, setLoadingBaggageTariffs] = useState(false);
  const [baggageTariffError, setBaggageTariffError] = useState<string | null>(
    null,
  );
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [createdReservation, setCreatedReservation] = useState<string | null>(
    null,
  );
  const initialCount = Math.min(Math.max(passengerCount, 1), 100);
  const [count, setCount] = useState(initialCount);
  const enoughSeats = trip !== null && trip.places_disponibles >= count;
  const total = useMemo(
    () => (trip ? Number(trip.prix) * count : 0),
    [trip, count],
  );

  async function answerBaggageQuestion(answer: "yes" | "no") {
    setBaggageAnswer(answer);
    setBaggageTariffError(null);
    if (answer !== "yes" || baggageTariffs !== null || !trip) return;

    setLoadingBaggageTariffs(true);
    try {
      const response = await fetch(
        `/api/voyages/${encodeURIComponent(trip.id_voyage)}/tarifs-bagages`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload: unknown = await response.json();
      const items =
        typeof payload === "object" &&
        payload !== null &&
        "results" in payload &&
        Array.isArray(payload.results)
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
    } catch (loadError) {
      setBaggageTariffError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les tarifs des bagages.",
      );
    } finally {
      setLoadingBaggageTariffs(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetch(`/api/voyages/${encodeURIComponent(voyageId)}`, {
      cache: "no-store",
    })
      .then(async (tripResponse) => {
        if (!tripResponse.ok) throw new Error(await responseMessage(tripResponse));
        const tripData: unknown = await tripResponse.json();
        if (!isTrip(tripData)) throw new Error("Les détails du voyage sont invalides.");
        if (!active) return;
        setTrip(tripData);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Le voyage ne peut pas être chargé.",
        );
      })
      .finally(() => {
        if (active) setLoadingTrip(false);
      });

    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (profileResponse) => {
        if (profileResponse.ok) {
          const currentProfile: unknown = await profileResponse.json();
          if (isUserProfile(currentProfile)) {
            if (!active) return;
            setProfile(currentProfile);
            setNames(
              Array.from({ length: initialCount }, (_, index) =>
                index === 0 && currentProfile.nom
                  ? [currentProfile.prenoms, currentProfile.nom]
                      .filter(Boolean)
                      .join(" ")
                  : "",
              ),
            );
          }
        } else if (profileResponse.status !== 401) {
          throw new Error(await responseMessage(profileResponse));
        }
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setProfileError(
          loadError instanceof Error
            ? loadError.message
            : "La session ne peut pas être vérifiée.",
        );
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });
    return () => {
      active = false;
    };
  }, [voyageId, initialCount]);

  function updatePassengerCount(nextCount: number) {
    const next = Math.min(Math.max(nextCount, 1), 100);
    setCount(next);
    setNames((current) =>
      Array.from({ length: next }, (_, index) => current[index] ?? ""),
    );
    setError(null);
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip) return;
    if (!profile) {
      const returnPath = `/reservation/${encodeURIComponent(voyageId)}?passagers=${count}`;
      router.push(`/connexion?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    if (!enoughSeats) {
      setError("Le nombre de passagers dépasse les places encore disponibles.");
      return;
    }
    if (names.length !== count || names.some((name) => !name.trim())) {
      setError("Saisissez le nom complet de chaque passager.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const reservationResponse = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voyage_id: trip.id_voyage,
          passagers: names.map((name) => name.trim()),
        }),
      });
      if (!reservationResponse.ok) {
        throw new Error(await responseMessage(reservationResponse));
      }
      const reservationData: unknown = await reservationResponse.json();
      if (
        typeof reservationData !== "object" ||
        reservationData === null ||
        !("id_reservation" in reservationData) ||
        typeof reservationData.id_reservation !== "string"
      ) {
        throw new Error("La réservation a été créée mais sa référence est invalide.");
      }
      const reservationId = reservationData.id_reservation;
      setCreatedReservation(reservationId);

      const paymentResponse = await fetch(
        `/api/paiements/reservations/${encodeURIComponent(reservationId)}/initier`,
        { method: "POST" },
      );
      if (!paymentResponse.ok) {
        throw new Error(
          `Réservation créée. ${await responseMessage(paymentResponse)} Vous pourrez réessayer depuis votre profil.`,
        );
      }
      const paymentData: unknown = await paymentResponse.json();
      if (
        typeof paymentData !== "object" ||
        paymentData === null ||
        !("payment_url" in paymentData) ||
        typeof paymentData.payment_url !== "string"
      ) {
        throw new Error(
          "Réservation créée, mais le lien de paiement n’est pas disponible. Réessayez depuis votre profil.",
        );
      }
      const paymentUrl = new URL(paymentData.payment_url);
      if (paymentUrl.protocol !== "https:") {
        throw new Error("Le lien de paiement sécurisé reçu est invalide.");
      }
      window.location.assign(paymentUrl.toString());
    } catch (submitError) {
      console.error("Traveler reservation flow failed", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "La réservation n’a pas pu être terminée.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="booking-page">
      <header className="booking-header">
        <Link className="traveler-brand" href="/" aria-label="Kinesis, accueil">
          <Image
            src="/kinesis-mark.png"
            width={42}
            height={42}
            alt=""
            priority
          />
          <span>KINESIS</span>
        </Link>
        <Link className="booking-back" href="/voyages">
          Retour aux voyages
        </Link>
      </header>

      <section className="booking-content">
        <p className="traveler-eyebrow">RÉSERVER VOTRE VOYAGE</p>
        <h1>Votre trajet, en quelques étapes.</h1>
        {loadingTrip ? (
          <div className="booking-card">
            <KinesisLoader message="Chargement du voyage…" variant="inline" />
          </div>
        ) : error && !trip ? (
          <div className="traveler-state traveler-state--error" role="alert">
            {error}
          </div>
        ) : trip ? (
          <>
            <section className="booking-trip-card">
              <div>
                <p className="traveler-eyebrow">{trip.compagnie_nom}</p>
                <h2>
                  {trip.ville_depart_nom}
                  <span aria-hidden="true"> → </span>
                  {trip.ville_arrivee_nom}
                </h2>
                <p>
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }).format(new Date(`${trip.date_depart}T12:00:00Z`))}
                  {" · "}
                  {trip.heure_depart.slice(0, 5)}
                </p>
                {trip.gare_depart ? (
                  <p>
                    Départ : {trip.gare_depart.nom} — {trip.gare_depart.adresse}
                    {trip.gare_depart.maps_url ? (
                      <> · <a href={trip.gare_depart.maps_url} target="_blank" rel="noreferrer">Google Maps</a></>
                    ) : null}
                  </p>
                ) : null}
                {trip.gare_arrivee ? (
                  <p>
                    Arrivée : {trip.gare_arrivee.nom} — {trip.gare_arrivee.adresse}
                    {trip.gare_arrivee.maps_url ? (
                      <> · <a href={trip.gare_arrivee.maps_url} target="_blank" rel="noreferrer">Google Maps</a></>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <strong>{formatPrice(trip.prix)} / place</strong>
            </section>

            {loadingProfile ? (
              <div className="booking-card">
                <KinesisLoader
                  message="Vérification de votre compte…"
                  variant="inline"
                />
              </div>
            ) : profileError ? (
              <div className="traveler-state traveler-state--error" role="alert">
                {profileError}
              </div>
            ) : profile?.role === "VOYAGEUR" ? (
              <form className="booking-card booking-passengers" onSubmit={submitBooking}>
                <div className="booking-card-heading">
                  <h2>Informations des passagers</h2>
                  <span>{count} {count > 1 ? "places" : "place"}</span>
                </div>
                <div className="booking-passenger-controls">
                  <span>Combien de passagers voyagent ?</span>
                  <div className="booking-passenger-stepper">
                    <button
                      type="button"
                      aria-label="Retirer un passager"
                      onClick={() => updatePassengerCount(count - 1)}
                      disabled={count <= 1}
                    >
                      −
                    </button>
                    <strong aria-live="polite">{count}</strong>
                    <button
                      type="button"
                      aria-label="Ajouter un passager"
                      onClick={() => updatePassengerCount(count + 1)}
                      disabled={
                        count >= 100 ||
                        count >= trip.places_disponibles
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className="booking-seats-available">
                  {trip.places_disponibles} place{trip.places_disponibles > 1 ? "s" : ""} disponible{trip.places_disponibles > 1 ? "s" : ""}
                </p>
                {names.map((name, index) => (
                  <label key={index}>
                    <span>Nom complet du passager {index + 1}</span>
                    <input
                      autoComplete={index === 0 ? "name" : "off"}
                      maxLength={150}
                      placeholder="Ex. Kévin ADJAKLI"
                      required
                      value={name}
                      onChange={(event) =>
                        setNames((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? event.target.value : item,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <fieldset className="booking-baggage-tariffs">
                  <legend>Avez-vous des bagages ?</legend>
                  <div className="booking-baggage-answer">
                    <label>
                      <input
                        type="radio"
                        name="has-baggage"
                        checked={baggageAnswer === "yes"}
                        onChange={() => void answerBaggageQuestion("yes")}
                      />
                      Oui
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="has-baggage"
                        checked={baggageAnswer === "no"}
                        onChange={() => void answerBaggageQuestion("no")}
                      />
                      Non
                    </label>
                  </div>
                  {baggageAnswer === "yes" ? (
                    loadingBaggageTariffs ? (
                      <p role="status">Chargement des tarifs de bagages…</p>
                    ) : baggageTariffError ? (
                      <div className="booking-baggage-tariff-error" role="alert">
                        <span>{baggageTariffError}</span>
                        <button
                          type="button"
                          onClick={() => void answerBaggageQuestion("yes")}
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
                          Ces tarifs sont à titre indicatif. Le bagage sera
                          pesé et enregistré à la gare ; ses frais seront réglés
                          sur place.
                        </p>
                      </div>
                    ) : (
                      <p>
                        La compagnie n’a pas encore publié de tarif pour les
                        bagages. Vous pourrez vous renseigner à la gare.
                      </p>
                    )
                  ) : null}
                </fieldset>
                <div className="booking-total">
                  <span>Total à régler</span>
                  <strong>{formatPrice(total)}</strong>
                </div>
                {!enoughSeats ? (
                  <p className="traveler-form-error" role="alert">
                    Il ne reste que {trip.places_disponibles} place{trip.places_disponibles > 1 ? "s" : ""} pour {count} passager{count > 1 ? "s" : ""}. Réduisez le nombre de passagers pour continuer.
                  </p>
                ) : null}
                {error ? (
                  <p className="traveler-form-error" role="alert">{error}</p>
                ) : null}
                <button
                  className="booking-submit"
                  type="submit"
                  disabled={submitting || !enoughSeats}
                >
                  {submitting ? "Préparation du paiement…" : "Réserver et payer"}
                </button>
                <p className="booking-note">
                  Vos places sont bloquées pendant 10 minutes. Le paiement est
                  traité de manière sécurisée par FedaPay.
                </p>
                {createdReservation ? (
                  <Link className="booking-profile-link" href="/espace-voyageur#reservations">
                    Retrouver la réservation dans mon profil
                  </Link>
                ) : null}
              </form>
            ) : profile ? (
              <div className="booking-card booking-signin">
                <h2>Réservation indisponible pour ce compte</h2>
                <p>
                  La réservation est réservée aux comptes voyageurs. Connectez-vous
                  avec un compte voyageur pour continuer.
                </p>
              </div>
            ) : (
              <div className="booking-card booking-signin">
                <h2>Connectez-vous pour continuer</h2>
                <p>Votre réservation sera associée à votre espace voyageur.</p>
                <Link
                  className="booking-submit"
                  href={`/connexion?next=${encodeURIComponent(`/reservation/${voyageId}?passagers=${count}`)}`}
                >
                  Se connecter ou créer un compte
                </Link>
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
