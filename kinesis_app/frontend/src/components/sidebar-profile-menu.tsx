"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  LogOut,
  UserRound,
  UserRoundPen,
} from "lucide-react";
import ProfileAvatar from "@/components/profile-avatar";
import ProfileEditDialog from "@/components/profile-edit-dialog";
import ProfileViewDialog from "@/components/profile-view-dialog";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { UserProfile } from "@/lib/user-profile";

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
  const { isMobile, setOpenMobile } = useSidebar();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(false);
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
          ) : null}
          {!companyAction || isMobile ? (
            <>
              <button
                type="button"
                className="sidebar-profile-menu__item"
                onClick={() => {
                  setMenuOpen(false);
                  if (isMobile) {
                    setOpenMobile(false);
                    window.setTimeout(
                      () =>
                        window.dispatchEvent(
                          new Event(
                            companyAction
                              ? "kinesis:company-profile-view-request"
                              : "kinesis:role-profile-view-request",
                          ),
                        ),
                      220,
                    );
                    return;
                  }
                  setViewingProfile(true);
                }}
              >
                <UserRound aria-hidden="true" />
                Voir mon profil
              </button>
              <button
                type="button"
                className="sidebar-profile-menu__item"
                onClick={() => {
                  setMenuOpen(false);
                  if (isMobile) {
                    setOpenMobile(false);
                    window.setTimeout(
                      () =>
                        window.dispatchEvent(
                          new Event(
                            companyAction
                              ? "kinesis:company-profile-edit-request"
                              : "kinesis:role-profile-edit-request",
                          ),
                        ),
                      220,
                    );
                    return;
                  }
                  setEditing(true);
                }}
              >
                <UserRoundPen aria-hidden="true" />
                Modifier mon profil
              </button>
            </>
          ) : null}
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

      {viewingProfile ? (
        <ProfileViewDialog
          profile={profile}
          name={name}
          avatarClassName={avatarClassName}
          onClose={() => {
            setViewingProfile(false);
            triggerRef.current?.focus();
          }}
        />
      ) : null}

      {editing ? (
        <ProfileEditDialog
          profile={profile}
          onProfileUpdated={onProfileUpdated}
          onClose={() => {
            setEditing(false);
            triggerRef.current?.focus();
          }}
        />
      ) : null}
    </SidebarMenuItem>
  );
}
