"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import ProfileAvatar from "@/components/profile-avatar";
import type { UserProfile } from "@/lib/user-profile";

type ProfileViewDialogProps = {
  profile: UserProfile;
  name: string;
  avatarClassName: string;
  onClose: () => void;
  onEdit?: () => void;
};

const roleLabels: Record<string, string> = {
  VOYAGEUR: "Voyageur",
  COMPAGNIE: "Compagnie",
  AGENT_COMPAGNIE: "Agent de compagnie",
  ADMINISTRATEUR: "Administrateur",
};

export default function ProfileViewDialog({
  profile,
  name,
  avatarClassName,
  onClose,
  onEdit,
}: ProfileViewDialogProps) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="profile-edit-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="profile-edit-dialog profile-view-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-view-title"
      >
        <div className="profile-edit-dialog__heading">
          <div>
            <p>MON COMPTE</p>
            <h2 id="profile-view-title">Profil</h2>
          </div>
          <button
            type="button"
            className="profile-edit-dialog__close"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="profile-view">
          <div className="profile-view__identity">
            <ProfileAvatar
              className={`${avatarClassName} profile-view__avatar`}
              src={profile.photo_profil}
              name={name}
              size={72}
              alt={`Photo de profil de ${name || "l’utilisateur"}`}
            />
            <div>
              <strong>{name || "Nom non renseigné"}</strong>
              <span className="profile-view__role">
                {roleLabels[profile.role] ?? profile.role}
              </span>
            </div>
          </div>
          <dl className="profile-view__details">
            <div>
              <dt>Adresse e-mail</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>Prénom(s)</dt>
              <dd>{profile.prenoms || "Non renseigné"}</dd>
            </div>
            <div>
              <dt>Nom</dt>
              <dd>{profile.nom || "Non renseigné"}</dd>
            </div>
            <div>
              <dt>Téléphone</dt>
              <dd>{profile.telephone || "Non renseigné"}</dd>
            </div>
            {profile.compagnie_nom ? (
              <div>
                <dt>Compagnie de rattachement</dt>
                <dd>{profile.compagnie_nom}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        {onEdit ? (
          <div className="profile-edit-form__actions">
            <button
              type="button"
              className="profile-edit-form__save"
              onClick={onEdit}
            >
              <Pencil aria-hidden="true" />
              Modifier mon profil
            </button>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
