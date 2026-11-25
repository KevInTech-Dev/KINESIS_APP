"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { BusFront, Luggage, UsersRound } from "lucide-react";
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

type SeatAvailability = {
  voyage_id: string;
  capacity: number;
  occupied_seats: string[];
};

function formatSeatNumber(index: number) {
  return `S${String(index).padStart(3, "0")}`;
}

function isSeatAvailability(value: unknown): value is SeatAvailability {
  if (
    typeof value !== "object" ||
    value === null ||
    !("voyage_id" in value) ||
    typeof value.voyage_id !== "string" ||
    !("capacity" in value) ||
    typeof value.capacity !== "number" ||
    !Number.isSafeInteger(value.capacity) ||
    value.capacity < 1 ||
    !("occupied_seats" in value) ||
    !Array.isArray(value.occupied_seats) ||
    !value.occupied_seats.every((seat) => typeof seat === "string")
  ) {
    return false;
  }
  const capacity = value.capacity;
  const occupiedSeats = value.occupied_seats as string[];
  return (
    new Set(occupiedSeats).size === occupiedSeats.length &&
    occupiedSeats.every((seat) => {
      const index = Number(seat.slice(1));
      return (
        seat.startsWith("S") &&
        Number.isSafeInteger(index) &&
        index > 0 &&
        index <= capacity &&
        seat === formatSeatNumber(index)
      );
    })
  );
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
  const [seatAvailability, setSeatAvailability] =
    useState<SeatAvailability | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<ReservationDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [createdReservation, setCreatedReservation] = useState<string | null>(
    null,
  );
  const count = draft?.passengers.length ?? passengerCount;
  const occupiedSeats = useMemo(
    () => new Set(seatAvailability?.occupied_seats ?? []),
    [seatAvailability],
  );
  const availableSeatCount = seatAvailability
    ? Math.max(0, seatAvailability.capacity - seatAvailability.occupied_seats.length)
    : 0;
  const seatRows = useMemo(
    () =>
      seatAvailability
        ? Array.from(
            { length: Math.ceil(seatAvailability.capacity / 4) },
            (_, rowIndex) => ({
              number: rowIndex + 1,
              seats: Array.from({ length: 4 }, (_, seatIndex) => {
                const number = rowIndex * 4 + seatIndex + 1;
                return number <= seatAvailability.capacity
                  ? formatSeatNumber(number)
                  : null;
              }),
            }),
          )
        : [],
    [seatAvailability],
  );
  const total = useMemo(
    () => (trip ? Number(trip.prix) * count : 0),
    [trip, count],
  );

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      try {
        const [tripResponse, profileResponse, seatsResponse] = await Promise.all([
          fetch(`/api/voyages/${encodeURIComponent(voyageId)}`, {
            cache: "no-store",
          }),
          fetch("/api/auth/session", { cache: "no-store" }),
          fetch(`/api/voyages/${encodeURIComponent(voyageId)}/sieges`, {
            cache: "no-store",
          }),
        ]);
        if (!tripResponse.ok) {
          throw new Error(await responseMessage(tripResponse));
        }
        const tripData: unknown = await tripResponse.json();
        if (!isCachedVoyage(tripData)) {
          throw new Error("Les informations reçues pour ce voyage sont invalides.");
        }
        if (!seatsResponse.ok) {
          throw new Error(await responseMessage(seatsResponse));
        }
        const seatsData: unknown = await seatsResponse.json();
        if (
          !isSeatAvailability(seatsData) ||
          seatsData.voyage_id !== tripData.id_voyage ||
          seatsData.capacity !== tripData.place_totale
        ) {
          throw new Error("Le plan des sièges reçu pour ce voyage est invalide.");
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

        const passengersToSeat = storedDraft?.passengers.length ?? passengerCount;
        const occupied = new Set(seatsData.occupied_seats);
        const initialSeats = (storedDraft?.selectedSeats ?? [])
          .filter((seat) => {
            const seatIndex = Number(seat.slice(1));
            return (
              seat.startsWith("S") &&
              Number.isSafeInteger(seatIndex) &&
              seatIndex > 0 &&
              seatIndex <= seatsData.capacity &&
              seat === formatSeatNumber(seatIndex) &&
              !occupied.has(seat)
            );
          })
          .slice(0, passengersToSeat);
        for (
          let seatIndex = 1;
          seatIndex <= seatsData.capacity && initialSeats.length < passengersToSeat;
          seatIndex += 1
        ) {
          const seat = formatSeatNumber(seatIndex);
          if (!occupied.has(seat) && !initialSeats.includes(seat)) {
            initialSeats.push(seat);
          }
        }

        if (!active) return;
        setTrip(tripData);
        setSeatAvailability(seatsData);
        setSelectedSeats(initialSeats);
        setProfile(currentProfile);
        setDraft(storedDraft);
      } catch (loadError: unknown) {
        if (active) {
          setLoadError(
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
  }, [passengerCount, voyageId]);

  function saveSeatSelection(seats: string[]) {
    setSelectedSeats(seats);
    if (!draft) return;
    const updatedDraft: ReservationDraft = { ...draft, selectedSeats: seats };
    setDraft(updatedDraft);
    try {
      window.sessionStorage.setItem(
        reservationDraftKey(voyageId),
        JSON.stringify(updatedDraft),
      );
    } catch (storageError) {
      console.error("Could not save the selected seats", storageError);
      toast.error("Votre choix de sièges ne pourra pas être conservé.");
    }
  }

  async function refreshSeatAvailability() {
    if (!trip) return;
    const response = await fetch(
      `/api/voyages/${encodeURIComponent(voyageId)}/sieges`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(await responseMessage(response));
    }
    const payload: unknown = await response.json();
    if (
      !isSeatAvailability(payload) ||
      payload.voyage_id !== trip.id_voyage ||
      payload.capacity !== trip.place_totale
    ) {
      throw new Error("Le plan des sièges reçu du serveur est invalide.");
    }
    setSeatAvailability(payload);
    const occupied = new Set(payload.occupied_seats);
    const stillAvailableSeats = selectedSeats.filter(
      (seat) => !occupied.has(seat),
    );
    if (stillAvailableSeats.length !== selectedSeats.length) {
      saveSeatSelection(stillAvailableSeats);
    }
  }

  function toggleSeat(seat: string) {
    if (!seatAvailability || occupiedSeats.has(seat) || submitting) return;
    const selectedIndex = selectedSeats.indexOf(seat);
    if (selectedIndex >= 0) {
      saveSeatSelection(selectedSeats.filter((selected) => selected !== seat));
      setError("");
      return;
    }
    if (selectedSeats.length >= count) {
      setError(`Vous avez déjà choisi ${count} siège${count > 1 ? "s" : ""}.`);
      return;
    }
    saveSeatSelection([...selectedSeats, seat]);
    setError("");
  }

  async function pay() {
    if (!trip || !draft) return;
    if (!profile) {
      saveSeatSelection(selectedSeats);
      const returnPath =
        `/reservation/${encodeURIComponent(voyageId)}?passagers=${draft.passengers.length}`;
      router.push(`/connexion?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    if (profile.role !== "VOYAGEUR") {
      setError("La réservation est réservée aux comptes voyageurs.");
      return;
    }
    if (availableSeatCount < draft.passengers.length) {
      setError(
        `Il ne reste que ${availableSeatCount} place${availableSeatCount > 1 ? "s" : ""} disponible${availableSeatCount > 1 ? "s" : ""}.`,
      );
      return;
    }
    if (selectedSeats.length !== draft.passengers.length) {
      setError("Choisissez un siège pour chaque passager avant de continuer.");
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
          sieges: selectedSeats,
        }),
      });
      if (!reservationResponse.ok) {
        const reservationError = await responseMessage(reservationResponse);
        let availabilityError = "";
        if (reservationResponse.status === 400) {
          try {
            await refreshSeatAvailability();
          } catch (refreshError) {
            console.error("Could not refresh the seat map after reservation failure", refreshError);
            availabilityError = " Le plan n’a pas pu être actualisé; rechargez la page.";
          }
        }
        throw new Error(`${reservationError}${availabilityError}`);
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
        {loadError ? (
          <div className="traveler-state traveler-state--error" role="alert">
            {loadError}
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

            <section
              className="booking-card booking-seat-card"
              aria-labelledby="booking-seat-heading"
            >
              <div className="booking-seat-heading">
                <span className="booking-seat-heading__icon">
                  <BusFront aria-hidden="true" />
                </span>
                <div>
                  <p className="traveler-eyebrow">CHOIX DU SIÈGE</p>
                  <h2 id="booking-seat-heading">Choisissez vos places</h2>
                  <p>
                    Deux sièges de chaque côté de l’allée centrale.
                  </p>
                </div>
                <span className="booking-seat-count" aria-live="polite">
                  {selectedSeats.length} / {draft.passengers.length} choisi
                  {draft.passengers.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="booking-seat-meta">
                <strong>
                  {availableSeatCount} place{availableSeatCount > 1 ? "s" : ""} disponible
                  {availableSeatCount > 1 ? "s" : ""}
                </strong>
                <div
                  className="booking-seat-legend"
                  role="group"
                  aria-label="Légende des sièges"
                >
                  <span><i className="is-available" />Disponible</span>
                  <span><i className="is-selected" />Votre choix</span>
                  <span><i className="is-occupied" />Occupé</span>
                </div>
              </div>

              <div className="booking-bus-frame">
                <div className="booking-bus-front">
                  <span className="booking-bus-front__driver">
                    <BusFront aria-hidden="true" />
                    Conducteur
                  </span>
                  <span className="booking-bus-front__exit">
                    Sortie <span aria-hidden="true">→</span>
                  </span>
                </div>
                <div
                  className="booking-seat-grid"
                  role="group"
                  aria-label="Plan interactif du bus"
                >
                  {seatRows.map((row) => (
                    <div className="booking-seat-row" key={row.number}>
                      <span className="booking-seat-row__number">
                        {String(row.number).padStart(2, "0")}
                      </span>
                      {row.seats.map((seat, index) => (
                        <Fragment
                          key={seat ?? `empty-${row.number}-${index}`}
                        >
                          {index === 2 ? (
                            <span
                              className="booking-seat-row__aisle"
                              aria-hidden="true"
                            />
                          ) : null}
                          {seat ? (
                            <button
                              type="button"
                              className={`booking-seat${selectedSeats.includes(seat) ? " is-selected" : ""}${occupiedSeats.has(seat) ? " is-occupied" : ""}`}
                              disabled={occupiedSeats.has(seat) || submitting}
                              aria-pressed={selectedSeats.includes(seat)}
                              aria-label={`Siège ${seat.slice(1)}, ${
                                occupiedSeats.has(seat)
                                  ? "occupé"
                                  : selectedSeats.includes(seat)
                                    ? "sélectionné"
                                    : "disponible"
                              }`}
                              onClick={() => toggleSeat(seat)}
                            >
                              {occupiedSeats.has(seat)
                                ? "×"
                                : seat.slice(1)}
                            </button>
                          ) : (
                            <span
                              className="booking-seat booking-seat--empty"
                              aria-hidden="true"
                            />
                          )}
                        </Fragment>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <ul className="booking-seat-passengers">
                {draft.passengers.map((name, index) => (
                  <li key={`${index}-${name}`}>
                    <span>Passager {index + 1} · {name}</span>
                    <strong>
                      {selectedSeats[index]
                        ? `Siège ${selectedSeats[index].slice(1)}`
                        : "À choisir"}
                    </strong>
                  </li>
                ))}
              </ul>
              {availableSeatCount < draft.passengers.length ? (
                <p className="traveler-form-error" role="alert">
                  Il n’y a pas assez de sièges disponibles pour tous les passagers.
                </p>
              ) : null}
              <p className="booking-seat-help">
                Les sièges sont attribués aux passagers dans l’ordre de la liste.
                Touchez un siège déjà choisi pour le libérer.
              </p>
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
                disabled={
                  submitting ||
                  !seatAvailability ||
                  selectedSeats.length !== draft.passengers.length ||
                  availableSeatCount < draft.passengers.length ||
                  (Boolean(profile) && profile?.role !== "VOYAGEUR")
                }
              >
                {submitting ? "Préparation du paiement…" : "Payer"}
              </button>
              <p className="booking-note">
                Vos sièges seront bloqués pendant 10 minutes. Le paiement est
                traité de manière sécurisée par CinetPay.
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
