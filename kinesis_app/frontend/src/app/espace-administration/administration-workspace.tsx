"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import ConfirmationDialog from "@/components/confirmation-dialog";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

const STATUSES = [
  "EN_ATTENTE_VALIDATION",
  "EN_ATTENTE_ACTIVATION",
  "ACTIVE",
  "DESACTIVE",
  "REFUSEE",
] as const;
const PAGE_SIZE = 20;

type CompanyStatus = (typeof STATUSES)[number];
type StatusFilter = CompanyStatus | "TOUTES";
type Action = "approve" | "refuse" | "deactivate";
type CompanyApplication = {
  id: string;
  email: string;
  telephone: string;
  is_active: boolean;
  raison_sociale: string | null;
  nom_commercial: string | null;
  telephone_secondaire: string;
  nif: string | null;
  rccm: string | null;
  logo: string | null;
  carte_cfe: string | null;
  piece_identite_gerant: string | null;
  description: string;
  adresse: string;
  statut: CompanyStatus;
};
type CompanyPage = {
  count: number;
  next: string | null;
  previous: string | null;
  results: CompanyApplication[];
};
const USER_ROLES = [
  "VOYAGEUR",
  "COMPAGNIE",
  "AGENT_COMPAGNIE",
  "ADMINISTRATEUR",
] as const;
type UserRole = (typeof USER_ROLES)[number];
type UserFilter = UserRole | "TOUS";
type ManagedUser = {
  id: string;
  email: string;
  nom: string;
  prenoms: string;
  telephone: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  compagnie: {
    raison_sociale: string | null;
    nom_commercial: string | null;
    nif: string | null;
    rccm: string | null;
    telephone_principal: string;
    telephone_secondaire: string;
    statut: CompanyStatus;
  } | null;
  agent: { compagnie_id: string; compagnie_nom: string | null } | null;
};
type UserPage = {
  count: number;
  next: string | null;
  previous: string | null;
  results: ManagedUser[];
};
type Feedback = { kind: "success" | "error"; message: string };
type Section = "companies" | "accounts";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "EN_ATTENTE_VALIDATION", label: "À examiner" },
  { id: "EN_ATTENTE_ACTIVATION", label: "Activation envoyée" },
  { id: "ACTIVE", label: "Actives" },
  { id: "DESACTIVE", label: "Désactivées" },
  { id: "REFUSEE", label: "Refusées" },
  { id: "TOUTES", label: "Toutes" },
];
const USER_FILTERS: { id: UserFilter; label: string }[] = [
  { id: "TOUS", label: "Tous les rôles" },
  { id: "COMPAGNIE", label: "Compagnies" },
  { id: "AGENT_COMPAGNIE", label: "Agents" },
  { id: "VOYAGEUR", label: "Voyageurs" },
  { id: "ADMINISTRATEUR", label: "Administrateurs" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCompanyApplication(value: unknown): value is CompanyApplication {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.telephone === "string" &&
    typeof value.is_active === "boolean" &&
    (typeof value.raison_sociale === "string" || value.raison_sociale === null) &&
    (typeof value.nom_commercial === "string" || value.nom_commercial === null) &&
    typeof value.telephone_secondaire === "string" &&
    (typeof value.nif === "string" || value.nif === null) &&
    (typeof value.rccm === "string" || value.rccm === null) &&
    (typeof value.logo === "string" || value.logo === null) &&
    (typeof value.carte_cfe === "string" || value.carte_cfe === null) &&
    (typeof value.piece_identite_gerant === "string" ||
      value.piece_identite_gerant === null) &&
    typeof value.description === "string" &&
    typeof value.adresse === "string" &&
    typeof value.statut === "string" &&
    STATUSES.includes(value.statut as CompanyStatus)
  );
}

function parseCompanyPage(value: unknown): CompanyPage {
  if (
    !isRecord(value) ||
    typeof value.count !== "number" ||
    !(typeof value.next === "string" || value.next === null) ||
    !(typeof value.previous === "string" || value.previous === null) ||
    !Array.isArray(value.results) ||
    !value.results.every(isCompanyApplication)
  ) {
    throw new Error("La liste des dossiers reçue du serveur est invalide.");
  }
  return {
    count: value.count,
    next: value.next,
    previous: value.previous,
    results: value.results,
  };
}

function isManagedUser(value: unknown): value is ManagedUser {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.email !== "string" ||
    typeof value.nom !== "string" ||
    typeof value.prenoms !== "string" ||
    typeof value.telephone !== "string" ||
    typeof value.role !== "string" ||
    !USER_ROLES.includes(value.role as UserRole) ||
    typeof value.is_active !== "boolean" ||
    typeof value.must_change_password !== "boolean"
  ) {
    return false;
  }
  const company = value.compagnie;
  const agent = value.agent;
  return (
    (company === null ||
      (isRecord(company) &&
        (typeof company.raison_sociale === "string" ||
          company.raison_sociale === null) &&
        (typeof company.nom_commercial === "string" ||
          company.nom_commercial === null) &&
        (typeof company.nif === "string" || company.nif === null) &&
        (typeof company.rccm === "string" || company.rccm === null) &&
        typeof company.telephone_principal === "string" &&
        typeof company.telephone_secondaire === "string" &&
        typeof company.statut === "string" &&
        STATUSES.includes(company.statut as CompanyStatus))) &&
    (agent === null ||
      (isRecord(agent) &&
        typeof agent.compagnie_id === "string" &&
        (typeof agent.compagnie_nom === "string" ||
          agent.compagnie_nom === null)))
  );
}

function parseUserPage(value: unknown): UserPage {
  if (
    !isRecord(value) ||
    typeof value.count !== "number" ||
    !(typeof value.next === "string" || value.next === null) ||
    !(typeof value.previous === "string" || value.previous === null) ||
    !Array.isArray(value.results) ||
    !value.results.every(isManagedUser)
  ) {
    throw new Error("La liste des comptes reçue du serveur est invalide.");
  }
  return {
    count: value.count,
    next: value.next,
    previous: value.previous,
    results: value.results,
  };
}

function apiMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = apiMessage(item);
      if (message) return message;
    }
  }
  if (isRecord(value)) {
    if ("detail" in value) {
      const detail = apiMessage(value.detail);
      if (detail) return detail;
    }
    for (const child of Object.values(value)) {
      const message = apiMessage(child);
      if (message) return message;
    }
  }
  return null;
}

async function requestAdministrationApi(
  resource: string,
  method = "GET",
): Promise<unknown> {
  const response = await fetch(`/api/administration/${resource}`, {
    method,
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      apiMessage(data) ?? `La requête a échoué (${response.status}).`,
    );
  }
  return data;
}

function statusLabel(status: CompanyStatus) {
  return (
    {
      EN_ATTENTE_VALIDATION: "À examiner",
      EN_ATTENTE_ACTIVATION: "Activation envoyée",
      ACTIVE: "Active",
      DESACTIVE: "Désactivée",
      REFUSEE: "Refusée",
    }[status] ?? status
  );
}

function roleLabel(role: UserRole) {
  return (
    {
      VOYAGEUR: "Voyageur",
      COMPAGNIE: "Compagnie",
      AGENT_COMPAGNIE: "Agent",
      ADMINISTRATEUR: "Administrateur",
    }[role] ?? role
  );
}

function safeDocumentUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function AdministrationWorkspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [section, setSection] = useState<Section>("companies");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("EN_ATTENTE_VALIDATION");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CompanyPage | null>(null);
  const [userFilter, setUserFilter] = useState<UserFilter>("TOUS");
  const [userPage, setUserPage] = useState(1);
  const [users, setUsers] = useState<UserPage | null>(null);
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [busyCompany, setBusyCompany] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmation, setConfirmation] = useState<{
    company: CompanyApplication;
    action: Action;
  } | null>(null);

  const loadCompanies = useCallback(
    async (filter: StatusFilter, pageNumber: number) => {
      setListLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(pageNumber),
          page_size: String(PAGE_SIZE),
        });
        if (filter !== "TOUTES") query.set("status", filter);
        const result = await requestAdministrationApi(
          `compagnies?${query.toString()}`,
        );
        setData(parseCompanyPage(result));
      } catch (loadError) {
        console.error("Administration company list loading failed", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger les dossiers compagnie.",
        );
      } finally {
        setListLoading(false);
      }
    },
    [],
  );
  const loadUsers = useCallback(
    async (filter: UserFilter, search: string, pageNumber: number) => {
      setUsersLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(pageNumber),
          page_size: String(PAGE_SIZE),
        });
        if (filter !== "TOUS") query.set("role", filter);
        if (search) query.set("search", search);
        const result = await requestAdministrationApi(
          `comptes?${query.toString()}`,
        );
        setUsers(parseUserPage(result));
      } catch (loadError) {
        console.error("Administration user list loading failed", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger les comptes.",
        );
      } finally {
        setUsersLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const session: unknown = await response.json().catch(() => null);
        if (!response.ok || !isUserProfile(session)) {
          if (active) {
            setRedirecting(true);
            router.replace("/connexion?next=%2Fespace-administration");
          }
          return;
        }
        if (session.role !== "ADMINISTRATEUR") {
          if (active) {
            setRedirecting(true);
            router.replace(
              session.role === "COMPAGNIE"
                ? "/espace-compagnie"
                : session.role === "AGENT_COMPAGNIE"
                  ? "/espace-agent"
                  : "/espace-voyageur",
            );
          }
          return;
        }
        if (active) {
          setProfile(session);
          setLoading(false);
        }
      } catch (loadError) {
        console.error("Administration session loading failed", loadError);
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Impossible de vérifier votre session administrateur.",
          );
          setLoading(false);
        }
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!profile || profile.role !== "ADMINISTRATEUR" || section !== "companies") {
      return;
    }
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return loadCompanies(statusFilter, page);
    });
    return () => {
      active = false;
    };
  }, [loadCompanies, page, profile, reloadKey, section, statusFilter]);

  useEffect(() => {
    if (!profile || profile.role !== "ADMINISTRATEUR" || section !== "accounts") {
      return;
    }
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return loadUsers(userFilter, userSearch, userPage);
    });
    return () => {
      active = false;
    };
  }, [loadUsers, profile, reloadKey, section, userFilter, userPage, userSearch]);

  async function actOnCompany(
    company: CompanyApplication,
    action: Action,
  ) {
    setBusyCompany(company.id);
    setError(null);
    setFeedback(null);
    try {
      await requestAdministrationApi(
        `compagnies/${company.id}/${action}`,
        "POST",
      );
      const messages: Record<Action, string> = {
        approve: "Dossier validé : le lien d’activation a été envoyé.",
        refuse: "Dossier refusé et entreprise notifiée.",
        deactivate: "Compte compagnie désactivé.",
      };
      setFeedback({ kind: "success", message: messages[action] });
      setReloadKey((current) => current + 1);
    } catch (actionError) {
      console.error("Administration company action failed", actionError);
      setFeedback({
        kind: "error",
        message:
          actionError instanceof Error
            ? actionError.message
            : "L’action n’a pas pu être effectuée.",
      });
    } finally {
      setBusyCompany(null);
      setConfirmation(null);
    }
  }

  async function signOut() {
    try {
      const response = await fetch("/api/auth/deconnexion", { method: "POST" });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        throw new Error(apiMessage(result) ?? "La déconnexion n’a pas abouti.");
      }
      router.replace("/");
      router.refresh();
    } catch (signOutError) {
      console.error("Administration logout failed", signOutError);
      setFeedback({
        kind: "error",
        message:
          signOutError instanceof Error
            ? signOutError.message
            : "Impossible de fermer la session.",
      });
    }
  }

  if (loading || redirecting) {
    return (
      <main className="admin-loading">
        <span className="admin-loading-mark" aria-hidden="true" />
        <p>Chargement de l’administration…</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="admin-loading">
        <section className="admin-error-card">
          <h1>Administration indisponible</h1>
          <p>{error ?? "La session administrateur n’a pas pu être vérifiée."}</p>
          <Link className="admin-button" href="/connexion">
            Retour à la connexion
          </Link>
        </section>
      </main>
    );
  }

  const pageCount = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));
  const userPageCount = Math.max(
    1,
    Math.ceil((users?.count ?? 0) / PAGE_SIZE),
  );

  return (
    <main className="admin-app">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/" aria-label="Kinesis, accueil">
          <Image src="/kinesis-mark.png" width={42} height={42} alt="" priority />
          <span>KINESIS</span>
        </Link>
        <div className="admin-role-badge">
          <span aria-hidden="true">AD</span>
          <div>
            <strong>Administration</strong>
            <span>Gestion KINESIS</span>
          </div>
        </div>
        <nav className="admin-navigation" aria-label="Administration">
          <button
            type="button"
            className={section === "companies" ? "is-active" : ""}
            aria-current={section === "companies" ? "page" : undefined}
            onClick={() => {
              setSection("companies");
              setError(null);
              setFeedback(null);
            }}
          >
            <span className="admin-navigation-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M3.75 7.25h6l1.8 2h8.7v8.5a1.5 1.5 0 0 1-1.5 1.5h-13a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
                <path d="M3.75 9.25h16.5" />
              </svg>
            </span>
            <span className="admin-navigation-copy">
              <strong>Dossiers compagnies</strong>
              <span>Examiner les inscriptions</span>
            </span>
            <span className="admin-navigation-arrow" aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            className={section === "accounts" ? "is-active" : ""}
            aria-current={section === "accounts" ? "page" : undefined}
            onClick={() => {
              setSection("accounts");
              setError(null);
              setFeedback(null);
            }}
          >
            <span className="admin-navigation-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M15.5 19.25v-1.5a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v1.5" />
                <circle cx="9.5" cy="7.5" r="3.25" />
                <path d="M16 4.5a3.25 3.25 0 0 1 0 6.25M18.5 14.75a3 3 0 0 1 2 2.85v1.65" />
              </svg>
            </span>
            <span className="admin-navigation-copy">
              <strong>Comptes utilisateurs</strong>
              <span>Rechercher et filtrer les accès</span>
            </span>
            <span className="admin-navigation-arrow" aria-hidden="true">→</span>
          </button>
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href="/">Voir le site</Link>
          <button type="button" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="admin-eyebrow">ESPACE SÉCURISÉ</p>
            <h1>Administration KINESIS</h1>
          </div>
          <div className="admin-topbar-user">
            <span>{profile.email}</span>
            <button type="button" onClick={() => void signOut()} aria-label="Se déconnecter">
              ↗
            </button>
          </div>
        </header>

        <div className="admin-content">
          <section className="admin-welcome">
            <div>
              {section === "companies" ? (
                <>
                  <p className="admin-eyebrow">DOSSIERS COMPAGNIE</p>
                  <h2>Vérifiez les pièces avant d’activer un compte.</h2>
                  <p>
                    Les documents sont privés et réservés aux administrateurs
                    KINESIS. L’approbation envoie un lien d’activation à l’entreprise.
                  </p>
                </>
              ) : (
                <>
                  <p className="admin-eyebrow">COMPTES UTILISATEURS</p>
                  <h2>Retrouvez les comptes de la plateforme.</h2>
                  <p>
                    Recherchez les voyageurs, compagnies et agents. Les accès et
                    les rôles restent contrôlés par les règles KINESIS.
                  </p>
                </>
              )}
            </div>
          </section>

          {error ? (
            <div className="admin-feedback admin-feedback--error" role="alert">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setReloadKey((current) => current + 1)}
              >
                Réessayer
              </button>
            </div>
          ) : null}
          {feedback ? (
            <p
              className={`admin-feedback admin-feedback--${feedback.kind}`}
              role={feedback.kind === "error" ? "alert" : "status"}
            >
              {feedback.message}
            </p>
          ) : null}

          {section === "companies" ? <section className="admin-panel" aria-label="Dossiers compagnies">
            <div className="admin-panel-heading">
              <div>
                <h2>Demandes d’inscription</h2>
                <p>
                  {data
                    ? `${data.count} dossier(s) ${statusFilter === "TOUTES" ? "au total" : statusLabel(statusFilter).toLowerCase()}`
                    : "Consultez et traitez les demandes."}
                </p>
              </div>
              <button
                className="admin-refresh"
                type="button"
                onClick={() => setReloadKey((current) => current + 1)}
                disabled={listLoading}
              >
                {listLoading ? "Actualisation…" : "Actualiser"}
              </button>
            </div>

            <div className="admin-filters" aria-label="Filtrer les compagnies">
              {FILTERS.map((filter) => (
                <button
                  type="button"
                  key={filter.id}
                  className={statusFilter === filter.id ? "is-active" : ""}
                  onClick={() => {
                    setStatusFilter(filter.id);
                    setPage(1);
                    setFeedback(null);
                    setError(null);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {listLoading && !data ? (
              <p className="admin-empty">Chargement des dossiers…</p>
            ) : data?.results.length ? (
              <div className={`admin-company-list ${listLoading ? "is-loading" : ""}`}>
                {data.results.map((company) => (
                  <CompanyCard
                    key={company.id}
                    company={company}
                    busy={busyCompany === company.id}
                    onAction={(action) => setConfirmation({ company, action })}
                  />
                ))}
              </div>
            ) : !error ? (
              <div className="admin-empty">
                <strong>Aucun dossier dans cette catégorie</strong>
                <span>Les demandes correspondantes apparaîtront ici.</span>
              </div>
            ) : null}

            {data && pageCount > 1 ? (
              <div className="admin-pagination">
                <button
                  type="button"
                  disabled={!data.previous || listLoading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  ← Précédent
                </button>
                <span>
                  Page {page} sur {pageCount}
                </span>
                <button
                  type="button"
                  disabled={!data.next || listLoading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Suivant →
                </button>
              </div>
            ) : null}
          </section> : (
          <section className="admin-panel" aria-label="Comptes utilisateurs">
              <div className="admin-panel-heading">
                <div>
                  <h2>Comptes enregistrés</h2>
                  <p>
                    {users
                      ? `${users.count} compte(s) correspondent aux filtres.`
                      : "Filtrez par rôle ou recherchez un utilisateur."}
                  </p>
                </div>
                <button
                  className="admin-refresh"
                  type="button"
                  onClick={() => setReloadKey((current) => current + 1)}
                  disabled={usersLoading}
                >
                  {usersLoading ? "Actualisation…" : "Actualiser"}
                </button>
              </div>

              <form
                className="admin-user-search"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  setUserSearch(userSearchInput.trim());
                  setUserPage(1);
                  setError(null);
                }}
              >
                <label htmlFor="admin-user-search">Rechercher un compte</label>
                <div>
                  <input
                    id="admin-user-search"
                    type="search"
                    maxLength={100}
                    value={userSearchInput}
                    onChange={(event) => setUserSearchInput(event.target.value)}
                    placeholder="Nom, e-mail, téléphone ou compagnie"
                  />
                  <button className="admin-button" type="submit">
                    Rechercher
                  </button>
                  {userSearch ? (
                    <button
                      className="admin-search-clear"
                      type="button"
                      onClick={() => {
                        setUserSearchInput("");
                        setUserSearch("");
                        setUserPage(1);
                      }}
                    >
                      Effacer
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="admin-filters" aria-label="Filtrer les comptes">
                {USER_FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.id}
                    className={userFilter === filter.id ? "is-active" : ""}
                    onClick={() => {
                      setUserFilter(filter.id);
                      setUserPage(1);
                      setFeedback(null);
                      setError(null);
                    }}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {usersLoading && !users ? (
                <p className="admin-empty">Chargement des comptes…</p>
              ) : users?.results.length ? (
                <div className={`admin-user-list ${usersLoading ? "is-loading" : ""}`}>
                  {users.results.map((user) => (
                    <UserCard key={user.id} user={user} />
                  ))}
                </div>
              ) : !error ? (
                <div className="admin-empty">
                  <strong>Aucun compte trouvé</strong>
                  <span>Modifiez les filtres ou votre recherche.</span>
                </div>
              ) : null}

              {users && userPageCount > 1 ? (
                <div className="admin-pagination">
                  <button
                    type="button"
                    disabled={!users.previous || usersLoading}
                    onClick={() =>
                      setUserPage((current) => Math.max(1, current - 1))
                    }
                  >
                    ← Précédent
                  </button>
                  <span>
                    Page {userPage} sur {userPageCount}
                  </span>
                  <button
                    type="button"
                    disabled={!users.next || usersLoading}
                    onClick={() => setUserPage((current) => current + 1)}
                  >
                    Suivant →
                  </button>
                </div>
              ) : null}
            </section>
          )}
        </div>
      </section>
      {confirmation ? (
        <ConfirmationDialog
          open
          title={
            confirmation.action === "approve"
              ? "Valider ce dossier compagnie ?"
              : confirmation.action === "refuse"
                ? "Refuser cette inscription ?"
                : "Désactiver ce compte compagnie ?"
          }
          description={
            confirmation.action === "approve"
              ? `La demande de ${confirmation.company.nom_commercial || confirmation.company.raison_sociale} sera approuvée. Un lien d’activation sera envoyé à ${confirmation.company.email}.`
              : confirmation.action === "refuse"
                ? `L’inscription de ${confirmation.company.nom_commercial || confirmation.company.raison_sociale} sera refusée et l’entreprise en sera informée.`
                : `Le compte de ${confirmation.company.nom_commercial || confirmation.company.raison_sociale} ne pourra plus accéder à son espace compagnie.`
          }
          confirmLabel={
            confirmation.action === "approve"
              ? "Valider et envoyer"
              : confirmation.action === "refuse"
                ? "Refuser le dossier"
                : "Désactiver le compte"
          }
          tone={confirmation.action === "approve" ? "primary" : "danger"}
          pending={busyCompany === confirmation.company.id}
          onCancel={() => setConfirmation(null)}
          onConfirm={() =>
            actOnCompany(confirmation.company, confirmation.action)
          }
        />
      ) : null}
    </main>
  );
}

function CompanyCard({
  company,
  busy,
  onAction,
}: {
  company: CompanyApplication;
  busy: boolean;
  onAction: (action: Action) => void;
}) {
  const cfeUrl = safeDocumentUrl(company.carte_cfe);
  const identityUrl = safeDocumentUrl(company.piece_identite_gerant);
  const logoUrl = safeDocumentUrl(company.logo);
  const title = company.nom_commercial || company.raison_sociale || company.email;

  return (
    <article className="admin-company-card">
      <div className="admin-company-heading">
        <div className="admin-company-mark">
          {logoUrl ? (
            // External logos are company-submitted resources, not trusted as Next image hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" />
          ) : (
            <span>{title.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="admin-company-title">
          <strong>{title}</strong>
          {company.raison_sociale && company.nom_commercial ? (
            <span>{company.raison_sociale}</span>
          ) : null}
          <a href={`mailto:${company.email}`}>{company.email}</a>
        </div>
        <span className={`admin-status admin-status--${company.statut.toLowerCase()}`}>
          {statusLabel(company.statut)}
        </span>
      </div>

      <div className="admin-company-facts">
        <p>
          <span>NIF</span>
          <strong>{company.nif || "Non renseigné"}</strong>
        </p>
        <p>
          <span>RCCM</span>
          <strong>{company.rccm || "Non renseigné"}</strong>
        </p>
        <p>
          <span>Téléphone principal</span>
          <strong>{company.telephone || "Non renseigné"}</strong>
        </p>
        <p>
          <span>Téléphone secondaire</span>
          <strong>{company.telephone_secondaire || "Non renseigné"}</strong>
        </p>
        <p>
          <span>Adresse</span>
          <strong>{company.adresse || "Non renseignée"}</strong>
        </p>
      </div>

      {company.description ? (
        <p className="admin-company-description">{company.description}</p>
      ) : null}

      <div className="admin-documents">
        <span>Pièces justificatives</span>
        {cfeUrl ? (
          <a href={cfeUrl} target="_blank" rel="noreferrer">
            Carte CFE ↗
          </a>
        ) : (
          <span className="admin-document-missing">Carte CFE indisponible</span>
        )}
        {identityUrl ? (
          <a href={identityUrl} target="_blank" rel="noreferrer">
            Pièce d’identité du gérant ↗
          </a>
        ) : (
          <span className="admin-document-missing">Pièce d’identité indisponible</span>
        )}
      </div>

      {company.statut === "EN_ATTENTE_VALIDATION" ||
      company.statut === "EN_ATTENTE_ACTIVATION" ? (
        <div className="admin-company-actions">
          {company.statut === "EN_ATTENTE_VALIDATION" ? (
            <button
              type="button"
              className="admin-button"
              disabled={busy}
              onClick={() => onAction("approve")}
            >
              {busy ? "Traitement…" : "Valider et envoyer le lien"}
            </button>
          ) : null}
          <button
            type="button"
            className="admin-button admin-button--danger"
            disabled={busy}
            onClick={() => onAction("refuse")}
          >
            Refuser le dossier
          </button>
        </div>
      ) : company.statut === "ACTIVE" ? (
        <div className="admin-company-actions">
          <span className="admin-account-active">
            {company.is_active ? "Compte utilisateur actif" : "Utilisateur désactivé"}
          </span>
          <button
            type="button"
            className="admin-button admin-button--danger"
            disabled={busy}
            onClick={() => onAction("deactivate")}
          >
            Désactiver le compte
          </button>
        </div>
      ) : null}
    </article>
  );
}

function UserCard({ user }: { user: ManagedUser }) {
  const displayName = [user.prenoms, user.nom].filter(Boolean).join(" ");
  const companyName =
    user.compagnie?.nom_commercial ??
    user.agent?.compagnie_nom ??
    user.compagnie?.raison_sociale;

  return (
    <article className="admin-user-card">
      <div className="admin-user-identity">
        <span className="admin-user-avatar" aria-hidden="true">
          {(displayName || user.email).slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{displayName || "Nom non renseigné"}</strong>
          <a href={`mailto:${user.email}`}>{user.email}</a>
        </div>
        <span className={`admin-role-tag admin-role-tag--${user.role.toLowerCase()}`}>
          {roleLabel(user.role)}
        </span>
      </div>
      <div className="admin-user-meta">
        <span>
          Téléphone <strong>{user.telephone || "Non renseigné"}</strong>
        </span>
        {companyName ? (
          <span>
            Compagnie <strong>{companyName}</strong>
          </span>
        ) : null}
        {user.compagnie ? (
          <span>
            Statut compagnie{" "}
            <strong>{statusLabel(user.compagnie.statut)}</strong>
          </span>
        ) : null}
        {user.agent ? (
          <span>
            Statut compagnie liée{" "}
            <strong>
              {user.agent.compagnie_id
                ? "Compte agent rattaché"
                : "Aucune compagnie"}
            </strong>
          </span>
        ) : null}
        <span
          className={`admin-user-state ${user.is_active ? "is-active" : "is-disabled"}`}
        >
          {user.is_active ? "Compte actif" : "Compte désactivé"}
        </span>
        {user.must_change_password ? (
          <span className="admin-password-state">Mot de passe provisoire</span>
        ) : null}
      </div>
    </article>
  );
}
