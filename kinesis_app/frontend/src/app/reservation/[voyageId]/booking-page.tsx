"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

type Trip = {
  id_voyage: string;
  compagnie_nom: string;
  ville_depart_nom: string;
  ville_arrivee_nom: string;
  date_depart: string;
  heure_depart: string;
  places_disponibles: number;
  prix: number | string;
  statut: string;
};

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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdReservation, setCreatedReservation] = useState<string | null>(
    null,
  );
  const count = Math.min(Math.max(passengerCount, 1), 100);
  const total = useMemo(
    () => (trip ? Number(trip.prix) * count : 0),
    [trip, count],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`/api/voyages/${encodeURIComponent(voyageId)}`, {
        cache: "no-store",
      }),
      fetch("/api/auth/session", { cache: "no-store" }),
    ])
      .then(async ([tripResponse, profileResponse]) => {
        if (!tripResponse.ok) throw new Error(await responseMessage(tripResponse));
        const tripData: unknown = await tripResponse.json();
        if (!isTrip(tripData)) throw new Error("Les détails du voyage sont invalides.");
        if (!active) return;
        setTrip(tripData);
        let loadedProfile: UserProfile | null = null;
        if (profileResponse.ok) {
          const currentProfile: unknown = await profileResponse.json();
          if (isUserProfile(currentProfile)) {
            loadedProfile = currentProfile;
            setProfile(currentProfile);
          }
        } else if (profileResponse.status !== 401) {
          throw new Error(await responseMessage(profileResponse));
        }
        setNames(
          Array.from({ length: count }, (_, index) =>
            index === 0 && loadedProfile?.nom
              ? [loadedProfile.prenoms, loadedProfile.nom]
                  .filter(Boolean)
                  .join(" ")
              : "",
          ),
        );
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
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [voyageId, count]);

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip) return;
    if (!profile) {
      const returnPath = `/reservation/${encodeURIComponent(voyageId)}?passagers=${count}`;
      router.push(`/connexion?next=${encodeURIComponent(returnPath)}`);
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
        <Link className="booking-back" href="/#destinations">
          Retour aux trajets
        </Link>
      </header>

      <section className="booking-content">
        <p className="traveler-eyebrow">RÉSERVER VOTRE VOYAGE</p>
        <h1>Votre trajet, en quelques étapes.</h1>
        {loading ? (
          <div className="booking-card" role="status">
            Chargement du voyage…
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
              </div>
              <strong>{formatPrice(trip.prix)} / place</strong>
            </section>

            {profile?.role === "VOYAGEUR" ? (
              <form className="booking-card booking-passengers" onSubmit={submitBooking}>
                <div className="booking-card-heading">
                  <h2>Informations des passagers</h2>
                  <span>{count} {count > 1 ? "places" : "place"}</span>
                </div>
                {names.map((name, index) => (
                  <label key={index}>
                    <span>Passager {index + 1}</span>
                    <input
                      autoComplete="name"
                      maxLength={150}
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
                <div className="booking-total">
                  <span>Total à régler</span>
                  <strong>{formatPrice(total)}</strong>
                </div>
                {error ? (
                  <p className="traveler-form-error" role="alert">{error}</p>
                ) : null}
                <button className="booking-submit" type="submit" disabled={submitting}>
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
