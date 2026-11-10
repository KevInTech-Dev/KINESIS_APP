"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Luggage, UsersRound } from "lucide-react";
import { toast } from "sonner";
import KinesisLoader from "@/components/kinesis-loader";
import { getUserFacingErrorMessage } from "@/lib/user-facing-errors";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";
import {
  getCachedVoyage,
  isCachedVoyage,
} from "@/lib/voyage-cache";
import {
  isReservationDraft,
  reservationDraftKey,
  type ReservationDraft,
} from "@/lib/reservation-draft";
import ProfileAvatar from "@/components/profile-avatar";
import type { Voyage } from "@/lib/types";

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

function formatTripDate(date: string, time: string) {
  const formattedDate = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  return `${formattedDate} · ${time.slice(0, 5)}`;
}

export default function BookingPage({
  voyageId,
  passengerCount,
}: {
  voyageId: string;
  passengerCount: number;
}) {
  const router = useRouter();
  const [trip, setTrip] = useState<Voyage | null>(() =>
    getCachedVoyage(voyageId),
  );
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<ReservationDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdReservation, setCreatedReservation] = useState<string | null>(
    null,
  );
  const count = draft?.passengers.length ?? passengerCount;
  const total = useMemo(
    () => (trip ? Number(trip.prix) * count : 0),
    [trip, count],
  );

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      try {
        const [tripResponse, profileResponse] = await Promise.all([
          fetch(`/api/voyages/${encodeURIComponent(voyageId)}`, {
            cache: "no-store",
          }),
          fetch("/api/auth/session", { cache: "no-store" }),
        ]);
        if (!tripResponse.ok) {
          throw new Error(await responseMessage(tripResponse));
        }
        const tripData: unknown = await tripResponse.json();
        if (!isCachedVoyage(tripData)) {
          throw new Error("Les informations reçues pour ce voyage sont invalides.");
        }

        let currentProfile: UserProfile | null = null;
        if (profileResponse.ok) {
          const profileData: unknown = await profileResponse.json();
          if (!isUserProfile(profileData)) {
            throw new Error("Le profil reçu du serveur est invalide.");
          }
          currentProfile = profileData;
        } else if (profileResponse.status !== 401) {
          throw new Error(await responseMessage(profileResponse));
        }

        let storedDraft: ReservationDraft | null = null;
        const storedValue = window.sessionStorage.getItem(
          reservationDraftKey(voyageId),
        );
        if (storedValue) {
          let parsedDraft: unknown;
          try {
            parsedDraft = JSON.parse(storedValue);
          } catch {
            throw new Error("Les informations de réservation sauvegardées sont invalides.");
          }
          if (!isReservationDraft(parsedDraft)) {
            throw new Error("Les informations de réservation sauvegardées sont incomplètes.");
          }
          storedDraft = parsedDraft;
        }

        if (!active) return;
        setTrip(tripData);
        setProfile(currentProfile);
        setDraft(storedDraft);
      } catch (loadError: unknown) {
        if (active) {
          setError(
            getUserFacingErrorMessage(
              loadError,
              "Le récapitulatif du voyage n’a pas pu être chargé.",
            ),
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSummary();
    return () => {
      active = false;
    };
  }, [voyageId]);

  async function pay() {
    if (!trip || !draft) return;
    if (!profile) {
      const returnPath =
        `/reservation/${encodeURIComponent(voyageId)}?passagers=${draft.passengers.length}`;
      router.push(`/connexion?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    if (profile.role !== "VOYAGEUR") {
      setError("La réservation est réservée aux comptes voyageurs.");
      return;
    }
    if (trip.places_disponibles < draft.passengers.length) {
      setError(
        `Il ne reste que ${trip.places_disponibles} place${trip.places_disponibles > 1 ? "s" : ""} disponible${trip.places_disponibles > 1 ? "s" : ""}.`,
      );
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const reservationResponse = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voyage_id: trip.id_voyage,
          passagers: draft.passengers.map((name) => name.trim()),
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
      window.sessionStorage.removeItem(reservationDraftKey(voyageId));
      window.location.assign(paymentUrl.toString());
    } catch (submitError: unknown) {
      console.error("Traveler reservation payment failed", submitError);
      const message = getUserFacingErrorMessage(
        submitError,
        "Le paiement n’a pas pu être préparé.",
      );
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <KinesisLoader message="Préparation du récapitulatif…" />;
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
        {profile ? (
          <Link
            className="booking-header__profile"
            href="/espace-voyageur"
            aria-label={`Ouvrir le profil de ${[profile.prenoms, profile.nom].filter(Boolean).join(" ")}`}
          >
            <ProfileAvatar
              className="booking-header__avatar"
              fallbackClassName="booking-header__avatar--fallback"
              src={profile.photo_profil}
              name={[profile.prenoms, profile.nom].filter(Boolean).join(" ")}
              size={38}
            />
            <span>Profil</span>
          </Link>
        ) : null}
      </header>

      <section className="booking-content booking-summary-content">
        <p className="traveler-eyebrow">DERNIÈRE ÉTAPE</p>
        <h1>Récapitulatif de votre voyage</h1>
        {error ? (
          <div className="traveler-state traveler-state--error" role="alert">
            {error}
            <Link href={`/voyages/${encodeURIComponent(voyageId)}`}>
              Retourner au voyage
            </Link>
          </div>
        ) : !trip ? (
          <div className="traveler-state traveler-state--error" role="alert">
            Le voyage n’est pas disponible.
          </div>
        ) : !draft ? (
          <section className="booking-card booking-summary-card">
            <h2>Les informations des passagers sont manquantes.</h2>
            <p>Revenez aux détails du voyage pour compléter votre réservation.</p>
            <Link
              className="booking-submit"
              href={`/voyages/${encodeURIComponent(voyageId)}`}
            >
              Retourner au voyage
            </Link>
          </section>
        ) : (
          <>
            <section className="booking-card booking-summary-card">
              <p className="traveler-eyebrow">{trip.compagnie_nom}</p>
              <h2 className="booking-summary-route">
                {trip.ville_depart_nom}
                <span aria-hidden="true"> → </span>
                {trip.ville_arrivee_nom}
              </h2>
              <p className="booking-summary-date">
                {formatTripDate(trip.date_depart, trip.heure_depart)}
              </p>
              <div className="booking-summary-facts">
                <div>
                  <UsersRound aria-hidden="true" />
                  <span>
                    {draft.passengers.length} passager
                    {draft.passengers.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div>
                  <Luggage aria-hidden="true" />
                  <span>
                    Bagages :{" "}
                    {draft.hasBaggage === null
                      ? "Non précisé"
                      : draft.hasBaggage
                        ? "Oui"
                        : "Non"}
                  </span>
                </div>
              </div>
              <ul className="booking-summary-passengers">
                {draft.passengers.map((name, index) => (
                  <li key={`${index}-${name}`}>
                    <span>Passager {index + 1}</span>
                    <strong>{name}</strong>
                  </li>
                ))}
              </ul>
              {draft.hasBaggage ? (
                <p className="booking-summary-baggage-note">
                  Les frais de bagage seront confirmés et réglés à la gare.
                </p>
              ) : null}
            </section>

            <section className="booking-card booking-summary-payment">
              <div className="booking-total">
                <span>Total à régler</span>
                <strong>{formatPrice(total)}</strong>
              </div>
              {error ? (
                <p className="traveler-form-error" role="alert">
                  {error}
                </p>
              ) : null}
              {profile && profile.role !== "VOYAGEUR" ? (
                <p className="traveler-form-error" role="alert">
                  La réservation est réservée aux comptes voyageurs.
                </p>
              ) : null}
              <button
                className="booking-submit"
                type="button"
                onClick={() => void pay()}
                disabled={submitting || (Boolean(profile) && profile?.role !== "VOYAGEUR")}
              >
                {submitting ? "Préparation du paiement…" : "Payer"}
              </button>
              <p className="booking-note">
                Vos places seront bloquées pendant 10 minutes. Le paiement est
                traité de manière sécurisée par FedaPay.
              </p>
              {createdReservation ? (
                <Link
                  className="booking-profile-link"
                  href="/espace-voyageur"
                >
                  Retrouver la réservation dans mon profil
                </Link>
              ) : null}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
