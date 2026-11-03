"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

type Company = {
  email: string;
  raison_sociale: string;
  nom_commercial: string;
  telephone: string;
  telephone_secondaire: string;
  nif: string;
  rccm: string;
  logo: string | null;
  description: string;
  adresse: string;
  statut: string;
};
type City = { id_ville: string; nom: string };
type Trip = {
  id_voyage: string;
  compagnie: string;
  ville_depart: string;
  ville_depart_nom: string;
  ville_arrivee: string;
  ville_arrivee_nom: string;
  date_depart: string;
  heure_depart: string;
  place_totale: number;
  places_disponibles: number;
  prix: string | number;
  image: string | null;
  statut: string;
};
type Agent = {
  id: string;
  email: string;
  nom: string;
  prenoms: string;
  telephone: string;
  is_active: boolean;
  permissions: string[];
};
type Payment = {
  id_paiement: string;
  reference_interne: string;
  montant: string | number;
  statut: string;
  date_creation: string;
  date_confirmation: string | null;
  reservation_reference: string;
  id_voyage: string;
  ville_depart_nom: string;
  ville_arrivee_nom: string;
  date_depart: string;
};
type Tab = "overview" | "trips" | "agents" | "payments" | "profile";

const PERMISSIONS = [
  ["ENREGISTRER_BAGAGE", "Enregistrer un bagage"],
  ["SCANNER_BILLET", "Scanner un billet"],
  ["VALIDER_EMBARQUEMENT", "Valider un embarquement"],
  ["CONSULTER_BAGAGES", "Consulter les bagages"],
  ["RESTITUER_BAGAGE", "Restituer un bagage"],
] as const;

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Vue d’ensemble" },
  { id: "trips", label: "Mes trajets" },
  { id: "agents", label: "Équipe" },
  { id: "payments", label: "Paiements" },
  { id: "profile", label: "Ma compagnie" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCompany(value: unknown): value is Company {
  return (
    isRecord(value) &&
    typeof value.email === "string" &&
    typeof value.raison_sociale === "string" &&
    typeof value.nom_commercial === "string" &&
    typeof value.telephone === "string" &&
    typeof value.telephone_secondaire === "string" &&
    typeof value.nif === "string" &&
    typeof value.rccm === "string" &&
    (typeof value.logo === "string" || value.logo === null) &&
    typeof value.description === "string" &&
    typeof value.adresse === "string" &&
    typeof value.statut === "string"
  );
}

function isCity(value: unknown): value is City {
  return (
    isRecord(value) &&
    typeof value.id_ville === "string" &&
    typeof value.nom === "string"
  );
}

function isTrip(value: unknown): value is Trip {
  return (
    isRecord(value) &&
    typeof value.id_voyage === "string" &&
    typeof value.compagnie === "string" &&
    typeof value.ville_depart === "string" &&
    typeof value.ville_depart_nom === "string" &&
    typeof value.ville_arrivee === "string" &&
    typeof value.ville_arrivee_nom === "string" &&
    typeof value.date_depart === "string" &&
    typeof value.heure_depart === "string" &&
    typeof value.place_totale === "number" &&
    typeof value.places_disponibles === "number" &&
    (typeof value.prix === "number" || typeof value.prix === "string") &&
    (typeof value.image === "string" || value.image === null) &&
    typeof value.statut === "string"
  );
}

function isAgent(value: unknown): value is Agent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.nom === "string" &&
    typeof value.prenoms === "string" &&
    typeof value.telephone === "string" &&
    typeof value.is_active === "boolean" &&
    Array.isArray(value.permissions) &&
    value.permissions.every((permission) => typeof permission === "string")
  );
}

function isPayment(value: unknown): value is Payment {
  return (
    isRecord(value) &&
    typeof value.id_paiement === "string" &&
    typeof value.reference_interne === "string" &&
    (typeof value.montant === "number" || typeof value.montant === "string") &&
    typeof value.statut === "string" &&
    typeof value.date_creation === "string" &&
    (typeof value.date_confirmation === "string" || value.date_confirmation === null) &&
    typeof value.reservation_reference === "string" &&
    typeof value.id_voyage === "string" &&
    typeof value.ville_depart_nom === "string" &&
    typeof value.ville_arrivee_nom === "string" &&
    typeof value.date_depart === "string"
  );
}

function listFrom<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): T[] {
  let rows: unknown[] | null = null;
  if (Array.isArray(value)) {
    rows = value;
  } else if (isRecord(value) && Array.isArray(value.results)) {
    rows = value.results;
  }
  if (!rows || !rows.every(guard)) {
    throw new Error("Le format des données reçu de l’API est invalide.");
  }
  return rows;
}

function messageFrom(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = messageFrom(item);
      if (message) return message;
    }
  }
  if (isRecord(value)) {
    if ("detail" in value) {
      const detail = messageFrom(value.detail);
      if (detail) return detail;
    }
    for (const child of Object.values(value)) {
      const message = messageFrom(child);
      if (message) return message;
    }
  }
  return null;
}

async function requestApi(
  resource: string,
  method = "GET",
  payload?: FormData | Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`/api/compagnie/${resource}`, {
    method,
    ...(payload instanceof FormData
      ? { body: payload }
      : payload
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        : {}),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      messageFrom(data) ?? `La requête a échoué (${response.status}).`,
    );
  }
  return data;
}

function formatPrice(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`
    : `${value} FCFA`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function statusLabel(status: string) {
  return (
    {
      PUBLIE: "Publié",
      ANNULEE: "Annulé",
      ARCHIVE: "Archivé",
      EXPIREE: "Terminé",
      CONFIRME: "Confirmé",
      EN_ATTENTE: "En attente",
      REJETE: "Rejeté",
      ECHEC: "Échec",
      REMBOURSE: "Remboursé",
      A_RECONCILIER: "À vérifier",
    }[status] ?? status
  );
}

function isFuture(value: Trip) {
  return new Date(`${value.date_depart}T${value.heure_depart}`).getTime() >= Date.now();
}

export default function CompanyWorkspace() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [company, setCompany] = useState<Company | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [agentPermissions, setAgentPermissions] = useState<Record<string, string[]>>({});

  const loadWorkspace = useCallback(async () => {
    try {
      const [sessionResponse, companyData, tripsData, agentsData, paymentsData, citiesResponse] =
        await Promise.all([
          fetch("/api/auth/session", { cache: "no-store" }),
          requestApi("me"),
          requestApi("voyages?page_size=100"),
          requestApi("agents?page_size=100"),
          requestApi("paiements?page_size=100"),
          fetch("/api/villes", { cache: "no-store" }),
        ]);
      const sessionBody: unknown = await sessionResponse.json().catch(() => null);
      if (!sessionResponse.ok || !isUserProfile(sessionBody)) {
        setRedirecting(true);
        router.replace("/connexion?next=%2Fespace-compagnie");
        return;
      }
      if (sessionBody.role !== "COMPAGNIE") {
        setRedirecting(true);
        router.replace("/espace-voyageur");
        return;
      }
      const cityBody: unknown = await citiesResponse.json().catch(() => null);
      if (!citiesResponse.ok) {
        throw new Error(messageFrom(cityBody) ?? "Impossible de charger les villes.");
      }
      if (!isCompany(companyData)) {
        throw new Error("Le profil de la compagnie reçu est invalide.");
      }
      const loadedTrips = listFrom(tripsData, isTrip).filter(
        (trip) => trip.compagnie === sessionBody.id,
      );
      const loadedAgents = listFrom(agentsData, isAgent);
      setError(null);
      setCompany(companyData);
      setProfile(sessionBody);
      setTrips(loadedTrips);
      setAgents(loadedAgents);
      setPayments(listFrom(paymentsData, isPayment));
      setCities(listFrom(cityBody, isCity));
      setAgentPermissions(
        Object.fromEntries(loadedAgents.map((agent) => [agent.id, agent.permissions])),
      );
    } catch (loadError) {
      console.error("Company workspace loading failed", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger votre espace compagnie.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void Promise.resolve().then(loadWorkspace);
  }, [loadWorkspace]);

  const activeTrips = useMemo(
    () => trips.filter((trip) => trip.statut === "PUBLIE" && isFuture(trip)),
    [trips],
  );

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/deconnexion", { method: "POST" });
      if (!response.ok) throw new Error("La déconnexion n’a pas abouti.");
      router.push("/");
      router.refresh();
    } catch (logoutError) {
      console.error("Company logout failed", logoutError);
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Impossible de fermer la session.",
      );
    }
  }

  async function submitTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      ville_depart: String(formData.get("ville_depart") ?? ""),
      ville_arrivee: String(formData.get("ville_arrivee") ?? ""),
      date_depart: String(formData.get("date_depart") ?? ""),
      heure_depart: String(formData.get("heure_depart") ?? ""),
      place_totale: Number(formData.get("place_totale")),
      prix: Number(formData.get("prix")),
      statut: String(formData.get("statut") ?? "PUBLIE"),
    };
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi(
        editingTrip ? `voyages/${editingTrip.id_voyage}` : "voyages",
        editingTrip ? "PATCH" : "POST",
        payload,
      );
      setEditingTrip(null);
      form.reset();
      await loadWorkspace();
      setNotice(editingTrip ? "Le trajet a été mis à jour." : "Le trajet a été publié.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Impossible d’enregistrer le trajet.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateTripStatus(trip: Trip, status: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi(`voyages/${trip.id_voyage}`, "PATCH", { statut: status });
      await loadWorkspace();
      setNotice(`Le trajet est maintenant « ${statusLabel(status)} ».`);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Impossible de modifier le statut.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      email: String(formData.get("email") ?? ""),
      nom: String(formData.get("nom") ?? ""),
      prenoms: String(formData.get("prenoms") ?? ""),
      telephone: String(formData.get("telephone") ?? ""),
      temporary_password: String(formData.get("temporary_password") ?? ""),
      permissions: PERMISSIONS.map(([code]) => code).filter((code) =>
        formData.has(`permission-${code}`),
      ),
    };
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi("agents", "POST", payload);
      form.reset();
      await loadWorkspace();
      setNotice("Le compte agent a été créé. Communiquez-lui son mot de passe temporaire.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Impossible de créer l’agent.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveAgent(agent: Agent, changes: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await requestApi(`agents/${agent.id}`, "PATCH", changes);
      await loadWorkspace();
      setNotice(`Le compte de ${agent.prenoms} ${agent.nom} a été mis à jour.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Impossible de mettre à jour l’agent.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitCompanyProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.delete("logo");
    const logoField = form.elements.namedItem("logo");
    const logo =
      logoField instanceof HTMLInputElement ? logoField.files?.[0] : undefined;
    if (logo) formData.append("logo", logo);
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await requestApi("me", "PATCH", formData);
      if (!isCompany(updated)) throw new Error("Le profil reçu après modification est invalide.");
      setCompany(updated);
      setNotice("Les informations de votre compagnie ont été enregistrées.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Impossible d’enregistrer le profil.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading || redirecting) {
    return (
      <main className="company-loading">
        <span className="company-loading-mark" aria-hidden="true" />
        <p>Chargement de votre espace compagnie…</p>
      </main>
    );
  }

  if (!company || !profile) {
    return (
      <main className="company-loading">
        <section className="company-error-card">
          <h1>Votre espace n’est pas disponible</h1>
          <p>{error ?? "Vérifiez votre connexion puis réessayez."}</p>
          <button type="button" className="company-button" onClick={() => void loadWorkspace()}>
            Réessayer
          </button>
          <Link href="/connexion">Retour à la connexion</Link>
        </section>
      </main>
    );
  }

  const confirmedRevenue = payments
    .filter((payment) => payment.statut === "CONFIRME")
    .reduce((total, payment) => total + Number(payment.montant), 0);

  return (
    <main className="company-app">
      <aside className="company-sidebar">
        <Link className="company-brand" href="/" aria-label="Kinesis, accueil">
          <Image src="/kinesis-mark.png" width={42} height={42} alt="" priority />
          <span>KINESIS</span>
        </Link>
        <div className="company-sidebar-company">
          <span className="company-avatar">
            {company.nom_commercial.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{company.nom_commercial}</strong>
            <span>Compte compagnie</span>
          </div>
        </div>
        <nav className="company-navigation" aria-label="Navigation compagnie">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "is-active" : ""}
              onClick={() => {
                setTab(item.id);
                setError(null);
                setNotice(null);
              }}
            >
              <span className={`company-nav-icon company-nav-icon--${item.id}`} aria-hidden="true" />
              {item.label}
              {item.id === "trips" ? <span className="company-nav-count">{trips.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="company-sidebar-bottom">
          <Link href="/">Voir le site</Link>
          <button type="button" onClick={() => void handleLogout()}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <section className="company-main">
        <header className="company-topbar">
          <div>
            <p className="company-eyebrow">ESPACE PARTENAIRE</p>
            <h1>{TABS.find((item) => item.id === tab)?.label}</h1>
          </div>
          <div className="company-user-summary">
            <span>{company.email}</span>
            <button type="button" aria-label="Se déconnecter" onClick={() => void handleLogout()}>
              ↗
            </button>
          </div>
        </header>

        {error ? <p className="company-alert company-alert--error" role="alert">{error}</p> : null}
        {notice ? <p className="company-alert company-alert--success" role="status">{notice}</p> : null}

        {tab === "overview" ? (
          <div className="company-content">
            <section className="company-welcome-card">
              <div>
                <p className="company-eyebrow">BONJOUR, {company.nom_commercial.toUpperCase()}</p>
                <h2>Pilotez vos départs en toute simplicité.</h2>
                <p>Retrouvez ici l’activité de votre compagnie sur KINESIS.</p>
                <button type="button" className="company-button" onClick={() => setTab("trips")}>
                  Gérer mes trajets <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="company-welcome-art" aria-hidden="true">
                <span>✦</span><span>↗</span><span>●</span>
              </div>
            </section>
            <div className="company-stat-grid">
              <article className="company-stat-card">
                <span>Départs à venir</span>
                <strong>{activeTrips.length}</strong>
                <small>Trajets publiés et futurs</small>
              </article>
              <article className="company-stat-card">
                <span>Trajets au total</span>
                <strong>{trips.length}</strong>
                <small>Votre activité sur la plateforme</small>
              </article>
              <article className="company-stat-card">
                <span>Agents</span>
                <strong>{agents.length}</strong>
                <small>Comptes rattachés à la compagnie</small>
              </article>
              <article className="company-stat-card company-stat-card--dark">
                <span>Paiements confirmés</span>
                <strong>{formatPrice(confirmedRevenue)}</strong>
                <small>{payments.filter((payment) => payment.statut === "CONFIRME").length} transaction(s)</small>
              </article>
            </div>
            <section className="company-panel">
              <div className="company-panel-heading">
                <div><h2>Prochains départs</h2><p>Vos voyages publiés les plus proches</p></div>
                <button type="button" className="company-text-button" onClick={() => setTab("trips")}>Tous les trajets →</button>
              </div>
              {activeTrips.length ? (
                <div className="company-trip-list">
                  {activeTrips.slice(0, 4).map((trip) => <TripRow key={trip.id_voyage} trip={trip} />)}
                </div>
              ) : <p className="company-empty">Aucun départ publié à venir. Créez votre premier trajet.</p>}
            </section>
          </div>
        ) : null}

        {tab === "trips" ? (
          <div className="company-content company-content--split">
            <section className="company-panel">
              <div className="company-panel-heading">
                <div><h2>{editingTrip ? "Modifier le trajet" : "Publier un trajet"}</h2><p>Les places disponibles sont calculées par l’API.</p></div>
              </div>
              <form className="company-form" onSubmit={submitTrip} key={editingTrip?.id_voyage ?? "new-trip"}>
                <label><span>Ville de départ</span><select name="ville_depart" required defaultValue={editingTrip?.ville_depart ?? ""}><option value="" disabled>Choisir une ville</option>{cities.map((city) => <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>)}</select></label>
                <label><span>Ville d’arrivée</span><select name="ville_arrivee" required defaultValue={editingTrip?.ville_arrivee ?? ""}><option value="" disabled>Choisir une ville</option>{cities.map((city) => <option key={city.id_ville} value={city.id_ville}>{city.nom}</option>)}</select></label>
                <div className="company-form-grid">
                  <label><span>Date de départ</span><input name="date_depart" type="date" required min={new Date().toISOString().slice(0, 10)} defaultValue={editingTrip?.date_depart ?? ""} /></label>
                  <label><span>Heure de départ</span><input name="heure_depart" type="time" required defaultValue={editingTrip?.heure_depart ?? ""} /></label>
                  <label><span>Nombre de places</span><input name="place_totale" type="number" min="1" required defaultValue={editingTrip?.place_totale ?? "30"} /></label>
                  <label><span>Prix par place (FCFA)</span><input name="prix" type="number" min="0" step="1" required defaultValue={editingTrip?.prix ?? ""} /></label>
                </div>
                {editingTrip ? <label><span>Statut</span><select name="statut" defaultValue={editingTrip.statut}><option value="PUBLIE">Publié</option><option value="ANNULEE">Annulé</option><option value="ARCHIVE">Archivé</option></select></label> : null}
                <div className="company-form-actions">
                  <button type="submit" className="company-button" disabled={saving}>{saving ? "Enregistrement…" : editingTrip ? "Enregistrer" : "Publier le trajet"}</button>
                  {editingTrip ? <button type="button" className="company-cancel-button" onClick={() => setEditingTrip(null)}>Annuler</button> : null}
                </div>
              </form>
            </section>
            <section className="company-panel company-panel--list">
              <div className="company-panel-heading"><div><h2>Vos trajets</h2><p>{trips.length} trajet(s)</p></div></div>
              {trips.length ? (
                <div className="company-trip-list">{trips.map((trip) => (
                  <article className="company-trip-row" key={trip.id_voyage}>
                    <TripRow trip={trip} />
                    <div className="company-row-actions">
                      <button type="button" onClick={() => setEditingTrip(trip)}>Modifier</button>
                      {trip.statut === "PUBLIE" && isFuture(trip) ? <button type="button" className="is-danger" disabled={saving} onClick={() => void updateTripStatus(trip, "ANNULEE")}>Annuler</button> : null}
                    </div>
                  </article>
                ))}</div>
              ) : <p className="company-empty">Aucun trajet publié pour le moment.</p>}
            </section>
          </div>
        ) : null}

        {tab === "agents" ? (
          <div className="company-content company-content--split">
            <section className="company-panel">
              <div className="company-panel-heading"><div><h2>Ajouter un agent</h2><p>Son mot de passe devra être changé à la première connexion.</p></div></div>
              <form className="company-form" onSubmit={submitAgent}>
                <label><span>Adresse e-mail</span><input name="email" type="email" required /></label>
                <div className="company-form-grid">
                  <label><span>Nom</span><input name="nom" required maxLength={100} /></label>
                  <label><span>Prénoms</span><input name="prenoms" maxLength={150} /></label>
                </div>
                <label><span>Téléphone</span><input name="telephone" type="tel" maxLength={30} /></label>
                <label><span>Mot de passe temporaire</span><input name="temporary_password" type="password" required minLength={8} autoComplete="new-password" /></label>
                <fieldset className="company-permissions"><legend>Autorisations</legend>{PERMISSIONS.map(([code, label]) => <label key={code}><input type="checkbox" name={`permission-${code}`} value={code} /><span>{label}</span></label>)}</fieldset>
                <button type="submit" className="company-button" disabled={saving}>{saving ? "Création…" : "Créer le compte agent"}</button>
              </form>
            </section>
            <section className="company-panel company-panel--list">
              <div className="company-panel-heading"><div><h2>Votre équipe</h2><p>{agents.length} agent(s) rattaché(s)</p></div></div>
              {agents.length ? <div className="company-agent-list">{agents.map((agent) => (
                <article className="company-agent-card" key={agent.id}>
                  <div className="company-agent-heading"><span className="company-agent-avatar">{agent.nom.slice(0, 1).toUpperCase()}</span><div><strong>{agent.prenoms} {agent.nom}</strong><span>{agent.email}</span></div><span className={`company-status ${agent.is_active ? "company-status--active" : "company-status--disabled"}`}>{agent.is_active ? "Actif" : "Désactivé"}</span></div>
                  {agent.telephone ? <p className="company-agent-phone">{agent.telephone}</p> : null}
                  <fieldset className="company-permissions company-permissions--compact"><legend>Permissions</legend>{PERMISSIONS.map(([code, label]) => <label key={code}><input type="checkbox" checked={(agentPermissions[agent.id] ?? []).includes(code)} onChange={(event) => setAgentPermissions((current) => ({...current, [agent.id]: event.target.checked ? [...(current[agent.id] ?? []), code] : (current[agent.id] ?? []).filter((item) => item !== code)}))} /><span>{label}</span></label>)}</fieldset>
                  <div className="company-row-actions">
                    <button type="button" disabled={saving} onClick={() => void saveAgent(agent, { permissions: agentPermissions[agent.id] ?? [] })}>Enregistrer les permissions</button>
                    <button type="button" className={agent.is_active ? "is-danger" : ""} disabled={saving} onClick={() => void saveAgent(agent, { is_active: !agent.is_active })}>{agent.is_active ? "Désactiver" : "Réactiver"}</button>
                  </div>
                </article>
              ))}</div> : <p className="company-empty">Aucun agent pour le moment.</p>}
            </section>
          </div>
        ) : null}

        {tab === "payments" ? (
          <div className="company-content">
            <section className="company-panel">
              <div className="company-panel-heading"><div><h2>Suivi des paiements</h2><p>Transactions liées aux réservations de vos trajets.</p></div><strong className="company-payment-total">{formatPrice(confirmedRevenue)} confirmés</strong></div>
              {payments.length ? (
                <div className="company-table-wrap"><table className="company-table"><thead><tr><th>Référence</th><th>Trajet</th><th>Départ</th><th>Montant</th><th>Statut</th><th>Créé le</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id_paiement}><td>{payment.reference_interne}</td><td>{payment.ville_depart_nom} → {payment.ville_arrivee_nom}</td><td>{formatDate(payment.date_depart)}</td><td>{formatPrice(payment.montant)}</td><td><span className={`company-status company-status--${payment.statut.toLowerCase()}`}>{statusLabel(payment.statut)}</span></td><td>{formatDate(payment.date_creation.slice(0, 10))}</td></tr>)}</tbody></table></div>
              ) : <p className="company-empty">Aucun paiement n’est encore associé à vos trajets.</p>}
            </section>
          </div>
        ) : null}

        {tab === "profile" ? (
          <div className="company-content">
            <section className="company-panel company-profile-panel">
              <div className="company-panel-heading"><div><h2>Informations de la compagnie</h2><p>Les informations légales sont verrouillées après validation.</p></div><span className="company-status company-status--active">{statusLabel(company.statut)}</span></div>
              <form className="company-form" onSubmit={submitCompanyProfile}>
                <div className="company-form-grid">
                  <label><span>Nom commercial</span><input value={company.nom_commercial} disabled /></label>
                  <label><span>Raison sociale</span><input value={company.raison_sociale} disabled /></label>
                  <label><span>E-mail</span><input value={company.email} disabled /></label>
                  <label><span>Téléphone</span><input value={company.telephone} disabled /></label>
                  <label><span>NIF</span><input value={company.nif} disabled /></label>
                  <label><span>RCCM</span><input value={company.rccm} disabled /></label>
                </div>
                <label><span>Adresse</span><input name="adresse" maxLength={255} defaultValue={company.adresse} /></label>
                <label><span>Description</span><textarea name="description" rows={4} defaultValue={company.description} /></label>
                <label><span>Logo <small>(image, facultatif)</small></span><input name="logo" type="file" accept="image/*" /></label>
                <button type="submit" className="company-button" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer les changements"}</button>
              </form>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function TripRow({ trip }: { trip: Trip }) {
  return (
    <div className="company-trip-summary">
      <div className="company-trip-route">
        <strong>{trip.ville_depart_nom} <span aria-hidden="true">→</span> {trip.ville_arrivee_nom}</strong>
        <span>{formatDate(trip.date_depart)} · {trip.heure_depart.slice(0, 5)}</span>
      </div>
      <div className="company-trip-details">
        <strong>{formatPrice(trip.prix)}</strong>
        <span>{trip.places_disponibles}/{trip.place_totale} places · {statusLabel(trip.statut)}</span>
      </div>
    </div>
  );
}
