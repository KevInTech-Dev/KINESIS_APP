"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ChartNoAxesCombined,
  Building2,
  ExternalLink,
  UsersRound,
} from "lucide-react";
import ConfirmationDialog from "@/components/confirmation-dialog";
import KinesisLoader from "@/components/kinesis-loader";
import {
  ListPagination,
  type ListPageSize,
} from "@/components/list-pagination";
import ProfileAvatar from "@/components/profile-avatar";
import RoleWorkspaceShell, {
  type RoleWorkspaceItem,
} from "@/components/role-workspace-shell";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

const STATUSES = [
  "EN_ATTENTE_VALIDATION",
  "EN_ATTENTE_ACTIVATION",
  "ACTIVE",
  "DESACTIVE",
  "REFUSEE",
] as const;
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
  photo_profil: string | null;
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
type UserRange = "7" | "30" | "90";
type UserSummary = {
  total: number;
  roles: Record<UserRole, number>;
  registrations: { date: string; count: number }[];
};
type Section = "companies" | "accounts";

const USER_RANGES: { id: UserRange; label: string; days: number }[] = [
  { id: "7", label: "7 jours", days: 7 },
  { id: "30", label: "30 jours", days: 30 },
  { id: "90", label: "3 mois", days: 90 },
];

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
const USER_ROLE_COLORS: Record<UserRole, string> = {
  VOYAGEUR: "#0b6b4b",
  COMPAGNIE: "#4b8f67",
  AGENT_COMPAGNIE: "#8caf76",
  ADMINISTRATEUR: "#c5a75d",
};

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
    (typeof value.photo_profil !== "string" && value.photo_profil !== null) ||
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

function parseUserSummary(value: unknown): UserSummary {
  if (!isRecord(value) || typeof value.total !== "number") {
    throw new Error("La répartition des comptes reçue du serveur est invalide.");
  }
  const roleData = value.roles;
  if (!isRecord(roleData)) {
    throw new Error("La répartition des comptes reçue du serveur est invalide.");
  }
  const countFor = (role: UserRole) => {
    const count = roleData[role];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new Error("La répartition des comptes reçue du serveur est invalide.");
    }
    return count;
  };
  const roles: Record<UserRole, number> = {
    VOYAGEUR: countFor("VOYAGEUR"),
    COMPAGNIE: countFor("COMPAGNIE"),
    AGENT_COMPAGNIE: countFor("AGENT_COMPAGNIE"),
    ADMINISTRATEUR: countFor("ADMINISTRATEUR"),
  };
  if (!Number.isInteger(value.total) || value.total < 0) {
    throw new Error("La répartition des comptes reçue du serveur est invalide.");
  }
  if (USER_ROLES.reduce((total, role) => total + roles[role], 0) !== value.total) {
    throw new Error("La répartition des comptes reçue du serveur est invalide.");
  }
  if (
    !Array.isArray(value.registrations) ||
    !value.registrations.every(
      (row) =>
        isRecord(row) &&
        typeof row.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
        typeof row.count === "number" &&
        Number.isInteger(row.count) &&
        row.count >= 0,
    )
  ) {
    throw new Error("La série des inscriptions reçue du serveur est invalide.");
  }
  return {
    total: value.total,
    roles,
    registrations: value.registrations,
  };
}

function getUserRegistrationBuckets(
  registrations: UserSummary["registrations"],
  range: UserRange,
) {
  const days = USER_RANGES.find((item) => item.id === range)?.days ?? 7;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  const bucketDuration = (end.getTime() - start.getTime() + 1) / 7;
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const bucketStart = new Date(start.getTime() + bucketDuration * index);
    return {
      label: new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
      }).format(bucketStart),
      count: 0,
    };
  });
  registrations.forEach((registration) => {
    const registeredAt = new Date(`${registration.date}T12:00:00`);
    if (Number.isNaN(registeredAt.getTime()) || registeredAt < start || registeredAt > end) {
      return;
    }
    const index = Math.min(
      Math.floor((registeredAt.getTime() - start.getTime()) / bucketDuration),
      buckets.length - 1,
    );
    buckets[index].count += registration.count;
  });
  return buckets;
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
  const [section, setSection] = useState<Section>("accounts");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("EN_ATTENTE_VALIDATION");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(10);
  const [data, setData] = useState<CompanyPage | null>(null);
  const [userFilter, setUserFilter] = useState<UserFilter>("TOUS");
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState<ListPageSize>(10);
  const [users, setUsers] = useState<UserPage | null>(null);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [userSummaryLoading, setUserSummaryLoading] = useState(false);
  const [userSummaryError, setUserSummaryError] = useState<string | null>(null);
  const [userRange, setUserRange] = useState<UserRange>("7");
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [busyCompany, setBusyCompany] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmation, setConfirmation] = useState<{
    company: CompanyApplication;
    action: Action;
  } | null>(null);

  const loadCompanies = useCallback(
    async (filter: StatusFilter, pageNumber: number, itemsPerPage: number) => {
      setListLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(pageNumber),
          page_size: String(itemsPerPage),
        });
        if (filter !== "TOUTES") query.set("status", filter);
        const result = await requestAdministrationApi(
          `compagnies?${query.toString()}`,
        );
        const companyPage = parseCompanyPage(result);
        setData(companyPage);
        if (companyPage.results.length === 0 && pageNumber > 1) {
          setPage(pageNumber - 1);
        }
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
    async (
      filter: UserFilter,
      search: string,
      pageNumber: number,
      itemsPerPage: number,
    ) => {
      setUsersLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(pageNumber),
          page_size: String(itemsPerPage),
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
  const loadUserSummary = useCallback(async (range: UserRange) => {
    setUserSummaryLoading(true);
    setUserSummaryError(null);
    try {
      const result = await requestAdministrationApi(
        `comptes/summary?days=${range}`,
      );
      setUserSummary(parseUserSummary(result));
    } catch (loadError) {
      console.error("Administration user summary loading failed", loadError);
      setUserSummaryError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger la répartition des comptes.",
      );
    } finally {
      setUserSummaryLoading(false);
    }
  }, []);
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
      if (active) return loadCompanies(statusFilter, page, pageSize);
    });
    return () => {
      active = false;
    };
  },   [loadCompanies, page, pageSize, profile, reloadKey, section, statusFilter]);

  useEffect(() => {
    if (!profile || profile.role !== "ADMINISTRATEUR" || section !== "accounts") {
      return;
    }
    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        void loadUsers(userFilter, userSearch, userPage, userPageSize);
        void loadUserSummary(userRange);
      }
    });
    return () => {
      active = false;
    };
  }, [
    loadUsers,
    loadUserSummary,
    profile,
    reloadKey,
    section,
    userFilter,
    userPage,
    userPageSize,
    userRange,
    userSearch,
  ]);

  async function actOnCompany(
    company: CompanyApplication,
    action: Action,
  ) {
    setBusyCompany(company.id);
    setError(null);
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
      toast.success(messages[action]);
      setReloadKey((current) => current + 1);
    } catch (actionError) {
      console.error("Administration company action failed", actionError);
      toast.error(
        actionError instanceof Error
          ? actionError.message
          : "L’action n’a pas pu être effectuée.",
      );
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
      toast.error(
        signOutError instanceof Error
          ? signOutError.message
          : "Impossible de fermer la session.",
      );
    }
  }

  if (loading || redirecting) {
    return <KinesisLoader message="Chargement de l’administration…" />;
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

  const userRegistrationBuckets = userSummary
    ? getUserRegistrationBuckets(userSummary.registrations, userRange)
    : [];
  const userRegistrationTotal = userRegistrationBuckets.reduce(
    (total, bucket) => total + bucket.count,
    0,
  );
  const userChartMaximum = Math.max(
    1,
    ...userRegistrationBuckets.map((bucket) => bucket.count),
  );
  const userChartPoints = userRegistrationBuckets.map((bucket, index) => {
    const x = 70 + (index * 710) / Math.max(userRegistrationBuckets.length - 1, 1);
    const y = 198 - (bucket.count / userChartMaximum) * 166;
    return { ...bucket, x, y };
  });
  const userChartLinePath = userChartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const userChartAreaPath = userChartPoints.length
    ? `${userChartLinePath} L ${userChartPoints[userChartPoints.length - 1].x} 198 L ${userChartPoints[0].x} 198 Z`
    : "";

  const workspaceItems: RoleWorkspaceItem[] = [
    { id: "accounts", label: "Utilisateurs", icon: UsersRound, group: "operations" },
    { id: "companies", label: "Dossiers compagnies", icon: Building2, group: "operations" },
    { id: "website", label: "Voir le site", icon: ExternalLink, href: "/", group: "account" },
  ];
  function selectSection(nextSection: string) {
    if (nextSection !== "companies" && nextSection !== "accounts") return;
    setSection(nextSection);
    setError(null);
  }
  return (
    <RoleWorkspaceShell
      eyebrow="ESPACE ADMINISTRATION"
      title={
        section === "companies" ? "Dossiers compagnies" : "Utilisateurs"
      }
      profile={profile}
      activeId={section}
      items={workspaceItems}
      onSelect={selectSection}
      onProfileUpdated={setProfile}
      onLogout={() => void signOut()}
    >

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
                    Les dossiers sont triés du plus récent au plus ancien, puis par statut et nom commercial.
                  </p>
                </>
              ) : (
                <>
                  <p className="admin-eyebrow">UTILISATEURS</p>
                  <h2>Suivez les inscriptions sur la plateforme.</h2>
                  <p>
                    Recherchez les voyageurs, compagnies et agents. Les accès et
                    les rôles restent contrôlés par les règles KINESIS. La liste est triée
                    du plus récent au plus ancien, puis par nom et prénoms.
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

            {data ? (
              <ListPagination
                totalItems={data.count}
                page={page}
                pageSize={pageSize}
                loading={listLoading}
                onPageChange={setPage}
                onPageSizeChange={(nextSize) => {
                  setPageSize(nextSize);
                  setPage(1);
                }}
              />
            ) : null}
          </section> : (
          <section className="admin-panel" aria-label="Comptes utilisateurs">
              <div className="admin-panel-heading">
                <div>
                  <h2>Comptes enregistrés</h2>
                  <p>
                    {users
                      ? `${users.count} utilisateur(s) correspondent aux filtres.`
                      : "Filtrez par rôle ou recherchez un utilisateur."}
                  </p>
                </div>
                <button
                  className="admin-refresh"
                  type="button"
                  onClick={() => setReloadKey((current) => current + 1)}
                  disabled={usersLoading || userSummaryLoading}
                >
                  {usersLoading || userSummaryLoading ? "Actualisation…" : "Actualiser"}
                </button>
              </div>

              <section className="admin-user-chart" aria-labelledby="admin-user-chart-title">
                <div className="admin-user-chart-heading">
                  <div>
                    <h3 id="admin-user-chart-title">
                      <ChartNoAxesCombined aria-hidden="true" />
                      Évolution des utilisateurs
                    </h3>
                    <p>
                      {userSummary
                        ? `${userRegistrationTotal} nouvelle(s) inscription(s) sur ${USER_RANGES.find((range) => range.id === userRange)?.label}`
                        : "Inscriptions enregistrées sur la plateforme"}
                    </p>
                  </div>
                  <div className="company-payment-range-switch" aria-label="Période du graphique">
                    {USER_RANGES.map((range) => (
                      <button
                        type="button"
                        key={range.id}
                        aria-pressed={userRange === range.id}
                        onClick={() => setUserRange(range.id)}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                </div>
                {userSummaryLoading && !userSummary ? (
                  <p className="admin-user-chart-message">Chargement du graphique…</p>
                ) : userSummaryError ? (
                  <p className="admin-user-chart-message is-error" role="alert">
                    {userSummaryError}
                  </p>
                ) : userSummary ? (
                  <>
                    {userRegistrationTotal > 0 ? (
                      <svg
                        className="admin-user-chart-svg"
                        viewBox="0 0 820 250"
                        role="img"
                        aria-label={`Nouvelles inscriptions sur ${USER_RANGES.find((range) => range.id === userRange)?.label}`}
                      >
                        <defs>
                          <linearGradient id="admin-user-chart-area" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#27835f" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#27835f" stopOpacity="0.01" />
                          </linearGradient>
                        </defs>
                        {[32, 115, 198].map((y, index) => (
                          <g key={y}>
                            <line className="admin-user-chart__grid" x1="70" x2="790" y1={y} y2={y} />
                            <text className="admin-user-chart__axis-label" x="58" y={y + 4} textAnchor="end">
                              {Math.round((userChartMaximum * (2 - index)) / 2).toLocaleString("fr-FR")}
                            </text>
                          </g>
                        ))}
                        {userChartAreaPath ? <path className="admin-user-chart__area" d={userChartAreaPath} /> : null}
                        {userChartLinePath ? <path className="admin-user-chart__line" d={userChartLinePath} /> : null}
                        {userChartPoints.map((point) => (
                          <g key={point.label}>
                            <circle className="admin-user-chart__point-halo" cx={point.x} cy={point.y} r="7" />
                            <circle className="admin-user-chart__point" cx={point.x} cy={point.y} r="3.5">
                              <title>{`${point.label} : ${point.count} inscription(s)`}</title>
                            </circle>
                            <text className="admin-user-chart__date" x={point.x} y="229" textAnchor="middle">
                              {point.label}
                            </text>
                          </g>
                        ))}
                      </svg>
                    ) : (
                      <p className="admin-user-chart-message">
                        Aucune nouvelle inscription sur cette période.
                      </p>
                    )}
                    <div className="admin-user-role-summary" aria-label="Total des utilisateurs par rôle">
                      {USER_ROLES.map((role) => (
                        <span key={role}>
                          <i style={{ backgroundColor: USER_ROLE_COLORS[role] }} aria-hidden="true" />
                          {roleLabel(role)}
                          <strong>{userSummary.roles[role].toLocaleString("fr-FR")}</strong>
                        </span>
                      ))}
                      <span className="admin-user-role-summary__total">
                        Total
                        <strong>{userSummary.total.toLocaleString("fr-FR")}</strong>
                      </span>
                    </div>
                  </>
                ) : null}
              </section>

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

              {users ? (
                <ListPagination
                  totalItems={users.count}
                  page={userPage}
                  pageSize={userPageSize}
                  loading={usersLoading}
                  onPageChange={setUserPage}
                  onPageSizeChange={(nextSize) => {
                    setUserPageSize(nextSize);
                    setUserPage(1);
                  }}
                />
              ) : null}
            </section>
          )}
        </div>
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
    </RoleWorkspaceShell>
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
        <ProfileAvatar
          className="admin-user-avatar"
          src={user.photo_profil}
          name={displayName || user.email}
          size={42}
        />
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
