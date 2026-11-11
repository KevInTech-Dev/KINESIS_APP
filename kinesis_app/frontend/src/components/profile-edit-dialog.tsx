"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  getUserFacingApiError,
  getUserFacingErrorMessage,
} from "@/lib/user-facing-errors";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

type ProfileEditDialogProps = {
  profile: UserProfile;
  onClose: () => void;
  onProfileUpdated: (profile: UserProfile) => void;
};

const roleLabels: Record<string, string> = {
  VOYAGEUR: "Voyageur",
  COMPAGNIE: "Compagnie",
  AGENT_COMPAGNIE: "Agent de compagnie",
  ADMINISTRATEUR: "Administrateur",
};

export default function ProfileEditDialog({
  profile,
  onClose,
  onProfileUpdated,
}: ProfileEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const photo = formData.get("photo_profil");
    if (!(photo instanceof File) || photo.size === 0) {
      formData.delete("photo_profil");
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        body: formData,
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          getUserFacingApiError(
            result,
            "La mise à jour de votre profil a échoué.",
            response.status,
          ),
        );
      }
      if (!isUserProfile(result)) {
        throw new Error("Le profil reçu après modification est invalide.");
      }
      onProfileUpdated(result);
      toast.success("Votre profil a été mis à jour.");
      onClose();
    } catch (saveError) {
      console.error("Profile update failed", saveError);
      setError(
        getUserFacingErrorMessage(
          saveError,
          "Impossible de mettre à jour votre profil.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="profile-edit-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="profile-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-edit-title"
      >
        <div className="profile-edit-dialog__heading">
          <div>
            <p>MON COMPTE</p>
            <h2 id="profile-edit-title">Mettre à jour mon profil</h2>
          </div>
          <button
            type="button"
            className="profile-edit-dialog__close"
            aria-label="Fermer"
            disabled={saving}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <form className="profile-edit-form" onSubmit={saveProfile}>
          <label>
            <span>Adresse e-mail</span>
            <input type="email" value={profile.email} disabled />
          </label>
          <label>
            <span>Prénom(s)</span>
            <input name="prenoms" defaultValue={profile.prenoms} maxLength={150} />
          </label>
          <label>
            <span>Nom</span>
            <input name="nom" defaultValue={profile.nom} maxLength={100} required />
          </label>
          <label>
            <span>Téléphone</span>
            <input
              name="telephone"
              type="tel"
              defaultValue={profile.telephone ?? ""}
              maxLength={30}
            />
          </label>
          <label>
            <span>Photo de profil</span>
            <input name="photo_profil" type="file" accept="image/*" />
          </label>
          <label>
            <span>Rôle du compte</span>
            <input value={roleLabels[profile.role] ?? profile.role} disabled />
          </label>
          {profile.compagnie_nom ? (
            <label>
              <span>Compagnie de rattachement</span>
              <input value={profile.compagnie_nom} disabled />
            </label>
          ) : null}
          {error ? (
            <p className="profile-edit-form__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="profile-edit-form__actions">
            <button
              type="button"
              className="profile-edit-form__cancel"
              disabled={saving}
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="profile-edit-form__save"
              disabled={saving}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
