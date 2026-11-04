"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  LogOut,
  UserRound,
  UserRoundPen,
  X,
} from "lucide-react";
import ProfileAvatar from "@/components/profile-avatar";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

type SidebarProfileMenuProps = {
  profile: UserProfile;
  onProfileUpdated: (profile: UserProfile) => void;
  onLogout: () => void;
  buttonClassName: string;
  avatarClassName: string;
  copyClassName: string;
  displayName?: string;
  avatarSrc?: string | null;
  companyAction?: {
    label: string;
    onClick: () => void;
  };
};

function profileName(profile: UserProfile) {
  return [profile.prenoms, profile.nom].filter(Boolean).join(" ");
}

export default function SidebarProfileMenu({
  profile,
  onProfileUpdated,
  onLogout,
  buttonClassName,
  avatarClassName,
  copyClassName,
  displayName,
  avatarSrc,
  companyAction,
}: SidebarProfileMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLLIElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = displayName ?? profileName(profile);
  const image = avatarSrc === undefined ? profile.photo_profil : avatarSrc;

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!editing && !viewingProfile) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setEditing(false);
        setViewingProfile(false);
        setError(null);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [editing, viewingProfile]);

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
        const detail =
          typeof result === "object" &&
          result !== null &&
          "detail" in result &&
          typeof result.detail === "string"
            ? result.detail
            : `La mise à jour a échoué (${response.status}).`;
        throw new Error(detail);
      }
      if (!isUserProfile(result)) {
        throw new Error("Le profil reçu après modification est invalide.");
      }
      onProfileUpdated(result);
      setEditing(false);
      triggerRef.current?.focus();
    } catch (saveError) {
      console.error("Profile update failed", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible de mettre à jour votre profil.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidebarMenuItem ref={menuRef} className="sidebar-profile-menu">
      <SidebarMenuButton
        ref={triggerRef}
        size="lg"
        tooltip={name || profile.email}
        className={buttonClassName}
        aria-expanded={menuOpen}
        aria-controls="sidebar-profile-options"
        onClick={() => setMenuOpen((current) => !current)}
      >
        <ProfileAvatar
          className={avatarClassName}
          src={image}
          name={name}
          size={36}
        />
        <span className={copyClassName}>
          <strong>{name || "Mon profil"}</strong>
          <small>{companyAction ? "Compte compagnie" : profile.email}</small>
        </span>
      </SidebarMenuButton>

      {menuOpen ? (
        <div
          id="sidebar-profile-options"
          className="sidebar-profile-menu__popover"
        >
          <div className="sidebar-profile-menu__identity">
            <ProfileAvatar
              className={avatarClassName}
              src={image}
              name={name}
              size={36}
            />
            <span>
              <strong>{name || "Mon profil"}</strong>
              <small>{companyAction ? "Compte compagnie" : profile.email}</small>
            </span>
          </div>
          {companyAction ? (
            <button
              type="button"
              className="sidebar-profile-menu__item"
              onClick={() => {
                setMenuOpen(false);
                companyAction.onClick();
              }}
            >
              <Building2 aria-hidden="true" />
              {companyAction.label}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="sidebar-profile-menu__item"
                onClick={() => {
                  setMenuOpen(false);
                  setViewingProfile(true);
                }}
              >
                <UserRound aria-hidden="true" />
                Profil
              </button>
              <button
                type="button"
                className="sidebar-profile-menu__item"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                  setError(null);
                }}
              >
                <UserRoundPen aria-hidden="true" />
                Mettre à jour mon profil
              </button>
            </>
          )}
          <div className="sidebar-profile-menu__separator" />
          <button
            type="button"
            className="sidebar-profile-menu__item sidebar-profile-menu__item--logout"
            onClick={() => {
              setMenuOpen(false);
              onLogout();
            }}
          >
            <LogOut aria-hidden="true" />
            Se déconnecter
          </button>
        </div>
      ) : null}

      {!companyAction && viewingProfile && typeof document !== "undefined"
        ? createPortal(
            <div className="profile-edit-overlay">
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
                    onClick={() => {
                      setViewingProfile(false);
                      triggerRef.current?.focus();
                    }}
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
                        {{
                          VOYAGEUR: "Voyageur",
                          COMPAGNIE: "Compagnie",
                          AGENT_COMPAGNIE: "Agent de compagnie",
                          ADMINISTRATEUR: "Administrateur",
                        }[profile.role] ?? profile.role}
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
              </section>
            </div>,
            document.body,
          )
        : null}

      {!companyAction && editing && typeof document !== "undefined"
        ? createPortal(
            <div className="profile-edit-overlay">
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
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                      triggerRef.current?.focus();
                    }}
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
                    <input
                      name="prenoms"
                      defaultValue={profile.prenoms}
                      maxLength={150}
                    />
                  </label>
                  <label>
                    <span>Nom</span>
                    <input
                      name="nom"
                      defaultValue={profile.nom}
                      maxLength={100}
                      required
                    />
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
                    <input
                      value={
                        {
                          VOYAGEUR: "Voyageur",
                          COMPAGNIE: "Compagnie",
                          AGENT_COMPAGNIE: "Agent de compagnie",
                          ADMINISTRATEUR: "Administrateur",
                        }[profile.role] ?? profile.role
                      }
                      disabled
                    />
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
                      onClick={() => {
                        setEditing(false);
                        setError(null);
                        triggerRef.current?.focus();
                      }}
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
          )
        : null}
    </SidebarMenuItem>
  );
}
