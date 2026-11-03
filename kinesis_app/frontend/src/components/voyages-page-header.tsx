"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import ProfileAvatar from "@/components/profile-avatar";
import { isUserProfile, type UserProfile } from "@/lib/user-profile";

function getProfileHref(role: string) {
  switch (role) {
    case "COMPAGNIE":
      return "/espace-compagnie";
    case "AGENT_COMPAGNIE":
      return "/espace-agent";
    case "ADMINISTRATEUR":
      return "/espace-administration";
    default:
      return "/espace-voyageur";
  }
}

export default function VoyagesPageHeader({
  currentPage,
}: {
  currentPage: "catalogue" | "detail";
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) {
          throw new Error(`Le profil n’a pas pu être chargé (${response.status}).`);
        }
        const result: unknown = await response.json();
        if (!isUserProfile(result)) {
          throw new Error("Le profil reçu du serveur est invalide.");
        }
        return result;
      })
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((error: unknown) => {
        if (active) console.error("Could not load voyages header profile", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const profileName = [profile?.prenoms, profile?.nom].filter(Boolean).join(" ");

  return (
    <header className="voyages-header">
      <div className="voyages-header__inner">
        <Link className="voyages-brand" href="/" aria-label="Kinesis, accueil">
          <Image
            src="/kinesis-mark.png"
            width={42}
            height={42}
            alt=""
          />
          <span>KINESIS</span>
        </Link>
        <nav className="voyages-header__nav" aria-label="Navigation principale">
          <Link href="/">Accueil</Link>
          <Link
            href="/voyages"
            aria-current={
              currentPage === "catalogue" || currentPage === "detail"
                ? "page"
                : undefined
            }
          >
            Voyages
          </Link>
        </nav>
        <Link
          className={`voyages-header__action${profile ? " voyages-header__action--profile" : ""}`}
          href={profile ? getProfileHref(profile.role) : "/connexion"}
          aria-label={profile ? `Ouvrir le profil de ${profileName}` : undefined}
        >
          {profile ? (
            <>
              <ProfileAvatar
                className="account-avatar"
                fallbackClassName="account-avatar--fallback"
                src={profile.photo_profil}
                name={profileName}
                size={32}
              />
              <span>Profil</span>
            </>
          ) : (
            "Se connecter"
          )}
        </Link>
      </div>
    </header>
  );
}
