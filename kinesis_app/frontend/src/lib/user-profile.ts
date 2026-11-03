export type UserProfile = {
  id: string;
  email: string;
  nom: string;
  prenoms: string;
  telephone: string | null;
  photo_profil: string | null;
  role: string;
  must_change_password: boolean;
  agent_permissions?: string[];
  compagnie_nom?: string | null;
};

export function isUserProfile(value: unknown): value is UserProfile {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "email" in value &&
    typeof value.email === "string" &&
    "nom" in value &&
    typeof value.nom === "string" &&
    "role" in value &&
    typeof value.role === "string" &&
    "photo_profil" in value &&
    (typeof value.photo_profil === "string" || value.photo_profil === null) &&
    "must_change_password" in value &&
    typeof value.must_change_password === "boolean" &&
    (!("agent_permissions" in value) ||
      (Array.isArray(value.agent_permissions) &&
        value.agent_permissions.every((permission) => typeof permission === "string"))) &&
    (!("compagnie_nom" in value) ||
      typeof value.compagnie_nom === "string" ||
      value.compagnie_nom === null)
  );
}
