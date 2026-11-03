"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import ConfirmationDialog from "@/components/confirmation-dialog";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

type Reservation = {
  id_reservation: string;
  reference: string;
  date_reservation: string;
  date_expiration: string | null;
  montant_total: string | number;
  statut: string;
  voyage: {
    compagnie_nom: string;
    ville_depart_nom: string;
    ville_arrivee_nom: string;
    date_depart: string;
    heure_depart: string;
    image: string | null;
  };
  places: Array<{
    numero_siege: string;
    nom_passager: string;
  }>;
};

type Ticket = {
  id_billet: string;
  code_billet: string;
  code_qr: string;
  reservation_reference: string;
  nom_passager: string;
  numero_siege: string;
  statut: string;
  voyage: {
    ville_depart_nom: string;
    ville_arrivee_nom: string;
    date_depart: string;
    heure_depart: string;
  };
};

type DashboardData = {
  profile: UserProfile | null;
  reservations: Reservation[];
  tickets: Ticket[];
};

const statusLabels: Record<string, string> = {
  EN_ATTENTE_PAIEMENT: "En attente de paiement",
  PAYEE: "Payée",
  EXPIREE: "Expirée",
  ANNULEE: "Annulée",
};

function isTicketList(value: unknown): value is { results: Ticket[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "results" in value &&
    Array.isArray(value.results) &&
    value.results.every(
      (ticket) =>
        typeof ticket === "object" &&
        ticket !== null &&
        "id_billet" in ticket &&
        typeof ticket.id_billet === "string" &&
        "code_billet" in ticket &&
        typeof ticket.code_billet === "string" &&
        "code_qr" in ticket &&
        typeof ticket.code_qr === "string" &&
        "reservation_reference" in ticket &&
        typeof ticket.reservation_reference === "string" &&
        "nom_passager" in ticket &&
        typeof ticket.nom_passager === "string" &&
        "numero_siege" in ticket &&
        typeof ticket.numero_siege === "string" &&
        "statut" in ticket &&
        typeof ticket.statut === "string" &&
        "voyage" in ticket &&
        typeof ticket.voyage === "object" &&
        ticket.voyage !== null &&
        "ville_depart_nom" in ticket.voyage &&
        typeof ticket.voyage.ville_depart_nom === "string" &&
        "ville_arrivee_nom" in ticket.voyage &&
        typeof ticket.voyage.ville_arrivee_nom === "string" &&
        "date_depart" in ticket.voyage &&
        typeof ticket.voyage.date_depart === "string" &&
        "heure_depart" in ticket.voyage &&
        typeof ticket.voyage.heure_depart === "string",
    )
  );
}

function isReservationList(
  value: unknown,
): value is { results: Reservation[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "results" in value &&
    Array.isArray(value.results) &&
    value.results.every(
      (reservation) =>
        typeof reservation === "object" &&
        reservation !== null &&
        "id_reservation" in reservation &&
        typeof reservation.id_reservation === "string" &&
        "reference" in reservation &&
        typeof reservation.reference === "string" &&
        "date_reservation" in reservation &&
        typeof reservation.date_reservation === "string" &&
        "montant_total" in reservation &&
        (typeof reservation.montant_total === "string" ||
          typeof reservation.montant_total === "number") &&
        "statut" in reservation &&
        typeof reservation.statut === "string" &&
        "voyage" in reservation &&
        typeof reservation.voyage === "object" &&
        reservation.voyage !== null &&
        "compagnie_nom" in reservation.voyage &&
        typeof reservation.voyage.compagnie_nom === "string" &&
        "ville_depart_nom" in reservation.voyage &&
        typeof reservation.voyage.ville_depart_nom === "string" &&
        "ville_arrivee_nom" in reservation.voyage &&
        typeof reservation.voyage.ville_arrivee_nom === "string" &&
        "date_depart" in reservation.voyage &&
        typeof reservation.voyage.date_depart === "string" &&
        "heure_depart" in reservation.voyage &&
        typeof reservation.voyage.heure_depart === "string" &&
        "places" in reservation &&
        Array.isArray(reservation.places),
    )
  );
}

async function getErrorMessage(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  if (
    typeof data === "object" &&
    data !== null &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail;
  }
  return "Une erreur est survenue. Veuillez réessayer.";
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date non disponible"
    : new Intl.DateTimeFormat("fr-FR", options).format(date);
}

function formatPrice(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("fr-FR").format(amount)} F CFA`
    : "Montant non disponible";
}

export default function TravelerDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [busyReservation, setBusyReservation] = useState<string | null>(null);
  const [reservationToCancel, setReservationToCancel] =
    useState<Reservation | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [prenoms, setPrenoms] = useState("");
  const [telephone, setTelephone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profileResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      if (profileResponse.status === 401) {
        router.replace("/connexion");
        return;
      }
      if (!profileResponse.ok) {
        throw new Error(await getErrorMessage(profileResponse));
      }

      const profileData: unknown = await profileResponse.json();
      if (!isUserProfile(profileData)) {
        throw new Error("Le profil reçu du serveur est invalide.");
      }

      if (profileData.role !== "VOYAGEUR") {
        setData({ profile: profileData, reservations: [], tickets: [] });
        return;
      }

      const paymentId = new URLSearchParams(window.location.search).get(
        "payment_id",
      );
      if (
        paymentId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          paymentId,
        )
      ) {
        const paymentResponse = await fetch(
          `/api/paiements/${encodeURIComponent(paymentId)}`,
          { cache: "no-store" },
        );
        if (paymentResponse.ok) {
          const payment: unknown = await paymentResponse.json();
          const paymentStatus =
            typeof payment === "object" &&
            payment !== null &&
            "statut" in payment &&
            typeof payment.statut === "string"
              ? payment.statut
              : "";
          setPaymentMessage(
            paymentStatus === "CONFIRME"
              ? "Paiement confirmé. Vos billets sont disponibles ci-dessous."
              : paymentStatus === "EN_ATTENTE"
                ? "Paiement en cours de confirmation. Vos billets apparaîtront dès validation."
                : paymentStatus
                  ? `État du paiement : ${paymentStatus}.`
                  : "Le paiement a été vérifié.",
          );
        } else {
          setPaymentMessage(await getErrorMessage(paymentResponse));
        }
        window.history.replaceState(null, "", "/espace-voyageur");
      }

      const [reservationsResponse, ticketsResponse] = await Promise.all([
        fetch("/api/reservations", { cache: "no-store" }),
        fetch("/api/billets", { cache: "no-store" }),
      ]);
      if (reservationsResponse.status === 401 || ticketsResponse.status === 401) {
        router.replace("/connexion");
        return;
      }
      if (!reservationsResponse.ok) {
        throw new Error(await getErrorMessage(reservationsResponse));
      }
      if (!ticketsResponse.ok) {
        throw new Error(await getErrorMessage(ticketsResponse));
      }

      const reservationsData: unknown = await reservationsResponse.json();
      const ticketsData: unknown = await ticketsResponse.json();
      if (!isReservationList(reservationsData)) {
        throw new Error("La liste des réservations reçue est invalide.");
      }
      if (!isTicketList(ticketsData)) {
        throw new Error("La liste des billets reçue est invalide.");
      }
      setData({
        profile: profileData,
        reservations: reservationsData.results,
        tickets: ticketsData.results,
      });
      setNom(profileData.nom);
      setPrenoms(profileData.prenoms);
      setTelephone(profileData.telephone ?? "");
    } catch (loadError) {
      console.error("Traveler dashboard request failed", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger votre espace pour le moment.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        return loadDashboard();
      }
    });
    return () => {
      active = false;
    };
  }, [loadDashboard]);

  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/deconnexion", { method: "POST" });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }
      router.replace("/");
    } catch (signOutError) {
      console.error("Logout request failed", signOutError);
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "La déconnexion n’a pas pu être confirmée.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    setProfileError(null);
    const formData = new FormData();
    formData.set("nom", nom.trim());
    formData.set("prenoms", prenoms.trim());
    formData.set("telephone", telephone.trim());
    if (photo) formData.set("photo_profil", photo);

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        body: formData,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const updatedProfile: unknown = await response.json();
      if (!isUserProfile(updatedProfile)) {
        throw new Error("Le profil mis à jour reçu du serveur est invalide.");
      }
      setData((current) =>
        current ? { ...current, profile: updatedProfile } : current,
      );
      setNom(updatedProfile.nom);
      setPrenoms(updatedProfile.prenoms);
      setTelephone(updatedProfile.telephone ?? "");
      setPhoto(null);
      if (photoInput.current) photoInput.current.value = "";
      setEditingProfile(false);
      setProfileMessage("Votre profil a été mis à jour.");
    } catch (saveError) {
      console.error("Profile update failed", saveError);
      setProfileError(
        saveError instanceof Error
          ? saveError.message
          : "La mise à jour du profil a échoué.",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function payReservation(reservationId: string) {
    setBusyReservation(reservationId);
    setError(null);
    try {
      const response = await fetch(
        `/api/paiements/reservations/${encodeURIComponent(reservationId)}/initier`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      const payment: unknown = await response.json();
      if (
        typeof payment !== "object" ||
        payment === null ||
        !("payment_url" in payment) ||
        typeof payment.payment_url !== "string"
      ) {
        throw new Error("Le lien de paiement reçu est invalide.");
      }
      const paymentUrl = new URL(payment.payment_url);
      if (paymentUrl.protocol !== "https:") {
        throw new Error("Le lien de paiement sécurisé reçu est invalide.");
      }
      window.location.assign(paymentUrl.toString());
    } catch (payError) {
      console.error("Payment initialization failed", payError);
      setError(
        payError instanceof Error
          ? payError.message
          : "Le paiement n’a pas pu être démarré.",
      );
    } finally {
      setBusyReservation(null);
    }
  }

  async function cancelReservation(reservationId: string) {
    setBusyReservation(reservationId);
    setError(null);
    try {
      const response = await fetch(
        `/api/reservations/${encodeURIComponent(reservationId)}/cancel`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      await loadDashboard();
    } catch (cancelError) {
      console.error("Reservation cancellation failed", cancelError);
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "L’annulation n’a pas pu être effectuée.",
      );
    } finally {
      setBusyReservation(null);
    }
  }

  const profile = data?.profile;
  const displayName = [profile?.prenoms, profile?.nom]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="traveler-page">
      <header className="site-header traveler-site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Kinesis, accueil">
            <Image
              src="/kinesis-mark.png"
              width={48}
              height={48}
              alt=""
              priority
              className="brand__mark"
            />
            <span>KINESIS</span>
          </Link>
          <nav className="main-nav" aria-label="Navigation principale">
            <Link href="/#accueil">Accueil</Link>
            <Link href="/#destinations">Trajets</Link>
            <Link href="/#avantages">Pourquoi Kinesis ?</Link>
          </nav>
          <Link
            className="account-button account-button--profile account-button--active"
            href="/espace-voyageur"
            aria-current="page"
          >
            {profile?.photo_profil ? (
              <Image
                className="account-avatar"
                src={profile.photo_profil}
                width={32}
                height={32}
                alt=""
                unoptimized
              />
            ) : (
              <span className="account-avatar account-avatar--fallback">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 22a8 8 0 0 1 16 0" />
                </svg>
              </span>
            )}
            Profil
          </Link>
          <button
            className="menu-button"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? "×" : "☰"}
          </button>
        </div>
        {menuOpen ? (
          <nav className="mobile-nav" aria-label="Navigation mobile">
            <Link href="/#accueil" onClick={() => setMenuOpen(false)}>
              Accueil
            </Link>
            <Link href="/#destinations" onClick={() => setMenuOpen(false)}>
              Trajets
            </Link>
            <Link href="/#avantages" onClick={() => setMenuOpen(false)}>
              Pourquoi Kinesis ?
            </Link>
            <Link
              href="/espace-voyageur"
              aria-current="page"
              onClick={() => setMenuOpen(false)}
            >
              Profil
            </Link>
            <button type="button" onClick={() => void signOut()} disabled={signingOut}>
              {signingOut ? "Déconnexion…" : "Se déconnecter"}
            </button>
          </nav>
        ) : null}
      </header>

      <section className="traveler-content">
        <div className="traveler-welcome traveler-welcome--row">
          <div>
            <p className="traveler-eyebrow">ESPACE VOYAGEUR</p>
            <h1>
              Bienvenu(e){displayName ? `, ${displayName}` : ""}
              <span>.</span>
            </h1>
            <p>Retrouvez ici vos réservations et les détails de vos voyages.</p>
          </div>
          <button
            className="traveler-logout"
            type="button"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </div>

        {loading ? (
          <div className="traveler-state" role="status">
            Chargement de votre espace…
          </div>
        ) : error ? (
          <div className="traveler-state traveler-state--error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadDashboard()}>
              Réessayer
            </button>
          </div>
        ) : profile?.role !== "VOYAGEUR" ? (
          <div className="traveler-state">
            <h2>Votre espace arrive bientôt</h2>
            <p>
              La consultation des réservations est disponible pour les comptes
              voyageurs. Votre compte est bien connecté.
            </p>
          </div>
        ) : (
          <>
            <section className="traveler-profile-card" aria-labelledby="profile-title">
              <div className="traveler-profile-summary">
                {profile?.photo_profil ? (
                  <Image
                    className="traveler-profile-photo"
                    src={profile.photo_profil}
                    width={76}
                    height={76}
                    alt={`Photo de ${displayName}`}
                    unoptimized
                  />
                ) : (
                  <span className="traveler-profile-photo traveler-profile-photo--fallback">
                    {displayName.slice(0, 1).toUpperCase() || "P"}
                  </span>
                )}
                <div>
                  <p className="traveler-eyebrow">VOTRE COMPTE</p>
                  <h2 id="profile-title">{displayName || "Mon profil"}</h2>
                  <p>{profile?.email}</p>
                  {profile?.telephone ? <p>{profile.telephone}</p> : null}
                </div>
                <button
                  className="traveler-secondary-button"
                  type="button"
                  onClick={() => {
                    setProfileMessage(null);
                    setProfileError(null);
                    setEditingProfile((value) => !value);
                  }}
                  aria-expanded={editingProfile}
                >
                  {editingProfile ? "Fermer" : "Modifier mon profil"}
                </button>
              </div>
              {profileMessage ? (
                <p className="traveler-form-success" role="status">{profileMessage}</p>
              ) : null}
              {editingProfile ? (
                <form className="traveler-profile-form" onSubmit={saveProfile}>
                  <label>
                    <span>Prénoms</span>
                    <input
                      autoComplete="given-name"
                      maxLength={150}
                      value={prenoms}
                      onChange={(event) => setPrenoms(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Nom</span>
                    <input
                      autoComplete="family-name"
                      maxLength={100}
                      required
                      value={nom}
                      onChange={(event) => setNom(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Téléphone</span>
                    <input
                      autoComplete="tel"
                      maxLength={30}
                      value={telephone}
                      onChange={(event) => setTelephone(event.target.value)}
                    />
                  </label>
                  <label className="traveler-photo-field">
                    <span>Photo de profil</span>
                    <input
                      ref={photoInput}
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        setPhoto(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  {profileError ? (
                    <p className="traveler-form-error" role="alert">
                      {profileError}
                    </p>
                  ) : null}
                  <button
                    className="traveler-save-button"
                    type="submit"
                    disabled={profileSaving}
                  >
                    {profileSaving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </form>
              ) : null}
            </section>

          {paymentMessage ? (
            <p className="traveler-payment-message" role="status">
              {paymentMessage}
            </p>
          ) : null}

          <section className="traveler-reservations" id="reservations" aria-labelledby="bookings-title">
            <div className="traveler-section-heading">
              <div>
                <p className="traveler-eyebrow">VOTRE ACTIVITÉ</p>
                <h2 id="bookings-title">Mes réservations</h2>
              </div>
              <span className="traveler-count">
                {data?.reservations.length ?? 0} réservation
                {(data?.reservations.length ?? 0) > 1 ? "s" : ""}
              </span>
            </div>

            {data?.reservations.length ? (
              <div className="traveler-booking-list">
                {data.reservations.map((reservation) => (
                  <article
                    className="traveler-booking-card"
                    key={reservation.id_reservation}
                  >
                    <div className="traveler-booking-main">
                      <div className="traveler-route">
                        <span>{reservation.voyage.ville_depart_nom}</span>
                        <span className="traveler-route-arrow" aria-hidden="true">
                          →
                        </span>
                        <span>{reservation.voyage.ville_arrivee_nom}</span>
                      </div>
                      <p className="traveler-company">
                        {reservation.voyage.compagnie_nom}
                      </p>
                      <p className="traveler-departure">
                        Départ le{" "}
                        {formatDate(reservation.voyage.date_depart, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}{" "}
                        à {reservation.voyage.heure_depart}
                      </p>
                    </div>
                    <div className="traveler-booking-details">
                      <span
                        className={`traveler-status traveler-status--${reservation.statut.toLowerCase()}`}
                      >
                        {statusLabels[reservation.statut] ?? reservation.statut}
                      </span>
                      <p className="traveler-reference">
                        Réf. {reservation.reference}
                      </p>
                      <p className="traveler-price">
                        {formatPrice(reservation.montant_total)}
                      </p>
                      <p className="traveler-seats">
                        {reservation.places.length} place
                        {reservation.places.length > 1 ? "s" : ""}
                      </p>
                      {reservation.statut === "EN_ATTENTE_PAIEMENT" ? (
                        <div className="traveler-booking-actions">
                          <button
                            type="button"
                            onClick={() => void payReservation(reservation.id_reservation)}
                            disabled={busyReservation === reservation.id_reservation}
                          >
                            {busyReservation === reservation.id_reservation
                              ? "Chargement…"
                              : "Payer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReservationToCancel(reservation)}
                            disabled={busyReservation === reservation.id_reservation}
                          >
                            Annuler
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="traveler-empty">
                <span aria-hidden="true">⌁</span>
                <h3>Aucune réservation pour le moment</h3>
                <p>
                  Vos prochains voyages réservés apparaîtront dans cet espace.
                </p>
                <Link href="/#search-form">Trouver un voyage</Link>
              </div>
            )}
          </section>

          <section className="traveler-tickets" id="billets" aria-labelledby="tickets-title">
            <div className="traveler-section-heading">
              <div>
                <p className="traveler-eyebrow">APRÈS PAIEMENT</p>
                <h2 id="tickets-title">Mes billets</h2>
              </div>
              <span className="traveler-count">
                {data?.tickets.length ?? 0} billet
                {(data?.tickets.length ?? 0) > 1 ? "s" : ""}
              </span>
            </div>
            {data?.tickets.length ? (
              <div className="traveler-ticket-list">
                {data.tickets.map((ticket) => (
                  <article className="traveler-ticket-card" key={ticket.id_billet}>
                    <QRCodeSVG
                      className="traveler-ticket-qr"
                      value={ticket.code_qr}
                      size={112}
                      level="M"
                      includeMargin
                      title={`Billet de ${ticket.nom_passager}`}
                    />
                    <div>
                      <h3>
                        {ticket.voyage.ville_depart_nom}
                        <span aria-hidden="true"> → </span>
                        {ticket.voyage.ville_arrivee_nom}
                      </h3>
                      <p>
                        {ticket.nom_passager} · Siège {ticket.numero_siege}
                      </p>
                      <p className="traveler-reference">
                        Billet {ticket.code_billet} · Réservation {ticket.reservation_reference}
                      </p>
                    </div>
                    <span className="traveler-status traveler-status--payee">
                      {ticket.statut === "EMBARQUE" ? "Embarqué" : "Valide"}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="traveler-empty traveler-empty--compact">
                <h3>Vos billets apparaîtront ici</h3>
                <p>Ils sont générés dès que votre paiement est confirmé.</p>
              </div>
            )}
          </section>
            {reservationToCancel ? (
              <ConfirmationDialog
                open
                title="Annuler cette réservation ?"
                description={`La réservation ${reservationToCancel.reference} sera annulée. Cette action est définitive et les places associées seront libérées.`}
                confirmLabel="Annuler la réservation"
                tone="danger"
                pending={busyReservation === reservationToCancel.id_reservation}
                onCancel={() => setReservationToCancel(null)}
                onConfirm={async () => {
                  await cancelReservation(reservationToCancel.id_reservation);
                  setReservationToCancel(null);
                }}
              />
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
