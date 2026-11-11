"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Bell, LogOut, type LucideIcon } from "lucide-react";
import SidebarProfileMenu from "@/components/sidebar-profile-menu";
import ProfileEditDialog from "@/components/profile-edit-dialog";
import ProfileViewDialog from "@/components/profile-view-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { UserProfile } from "@/lib/user-profile";

export type RoleWorkspaceItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  group?: "operations" | "account";
  badge?: number;
  href?: string;
};

type RoleWorkspaceShellProps = {
  eyebrow: string;
  title: string;
  profile: UserProfile;
  activeId: string;
  items: RoleWorkspaceItem[];
  notificationCount?: number;
  workspaceClassName?: string;
  onSelect: (id: string) => void;
  onNotificationsClick?: () => void;
  onProfileUpdated: (profile: UserProfile) => void;
  onLogout: () => void;
  children: ReactNode;
};

export default function RoleWorkspaceShell({
  eyebrow,
  title,
  profile,
  activeId,
  items,
  notificationCount = 0,
  workspaceClassName,
  onSelect,
  onNotificationsClick,
  onProfileUpdated,
  onLogout,
  children,
}: RoleWorkspaceShellProps) {
  const [profileDialog, setProfileDialog] = useState<"view" | "edit" | null>(
    null,
  );
  const groups: { id: "operations" | "account"; label: string }[] = [
    { id: "operations", label: "Navigation" },
    { id: "account", label: "Compte" },
  ];
  const groupedItems = items.filter((item) => item.id !== "profile");

  useEffect(() => {
    const publishMobileState = () => {
      window.dispatchEvent(
        new CustomEvent("kinesis:role-mobile-state", {
          detail: {
            role: profile.role,
            activeTab: activeId,
            operations: items
              .filter(
                (item) =>
                  item.id !== "overview" &&
                  item.id !== "notifications" &&
                  item.id !== "profile" &&
                  !item.href &&
                  item.group !== "account",
              )
              .map(({ id, label }) => ({ id, label })),
            notificationsTabId: items.some(
              (item) => item.id === "notifications",
            )
              ? "notifications"
              : null,
            profileTabId: items.some((item) => item.id === "profile")
              ? "profile"
              : null,
            unreadCount: notificationCount,
          },
        }),
      );
    };
    publishMobileState();
    window.addEventListener(
      "kinesis:role-mobile-state-request",
      publishMobileState,
    );
    return () =>
      window.removeEventListener(
        "kinesis:role-mobile-state-request",
        publishMobileState,
      );
  }, [activeId, items, notificationCount, profile.role]);

  useEffect(() => {
    const openProfileView = () => setProfileDialog("view");
    const openProfileEdit = () => setProfileDialog("edit");
    window.addEventListener("kinesis:role-profile-view-request", openProfileView);
    window.addEventListener("kinesis:role-profile-edit-request", openProfileEdit);
    const url = new URL(window.location.href);
    let profileTimer: number | undefined;
    if (
      profile.role === "ADMINISTRATEUR" &&
      url.searchParams.get("mobileProfile") === "1"
    ) {
      url.searchParams.delete("mobileProfile");
      window.history.replaceState(window.history.state, "", url);
      profileTimer = window.setTimeout(() => setProfileDialog("view"), 0);
    }
    return () => {
      if (profileTimer !== undefined) window.clearTimeout(profileTimer);
      window.removeEventListener("kinesis:role-profile-view-request", openProfileView);
      window.removeEventListener("kinesis:role-profile-edit-request", openProfileEdit);
    };
  }, [profile.role]);

  useEffect(() => {
    function handleMobileTabRequest(event: Event) {
      const tabId = (event as CustomEvent<string>).detail;
      const item = items.find((candidate) => candidate.id === tabId);
      if (!item || item.href) return;
      if (item.id === "notifications" && onNotificationsClick) {
        onNotificationsClick();
      } else {
        onSelect(item.id);
      }
    }
    window.addEventListener("kinesis:role-mobile-tab-request", handleMobileTabRequest);
    return () => {
      window.removeEventListener("kinesis:role-mobile-tab-request", handleMobileTabRequest);
    };
  }, [items, onNotificationsClick, onSelect]);

  return (
    <TooltipProvider>
      <SidebarProvider
        className={`role-workspace${workspaceClassName ? ` ${workspaceClassName}` : ""}`}
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "3.5rem",
          } as CSSProperties
        }
      >
        <Sidebar
          className={
            profile.role === "ADMINISTRATEUR"
              ? "role-sidebar role-sidebar--mobile-nav-clearance"
              : "role-sidebar"
          }
          variant="inset"
          collapsible="icon"
        >
          <SidebarHeader className="role-sidebar__header">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="KINESIS — Accueil"
                  className="role-sidebar__brand"
                >
                  <Link href="/">
                    <span className="kinesis-logo-mark role-sidebar__brand-mark">
                      <Image
                        src="/kinesis-mark.png"
                        width={34}
                        height={34}
                        alt=""
                        priority
                      />
                    </span>
                    <span>KINESIS</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

          </SidebarHeader>

          <SidebarContent className="role-sidebar__content">
            {groups.map((group) => {
              const groupItems = groupedItems.filter(
                (item) => (item.group ?? "operations") === group.id,
              );
              if (!groupItems.length) return null;
              return (
                <SidebarGroup key={group.id}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {groupItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild={Boolean(item.href)}
                          type={item.href ? undefined : "button"}
                          isActive={activeId === item.id}
                          tooltip={item.label}
                          onClick={item.href ? undefined : () => onSelect(item.id)}
                        >
                          {item.href ? (
                            <Link href={item.href}>
                              <Icon />
                              <span>{item.label}</span>
                            </Link>
                          ) : (
                            <>
                              <Icon />
                              <span>{item.label}</span>
                              {item.badge && item.badge > 0 ? (
                                <SidebarMenuBadge>
                                  {item.badge > 99 ? "99+" : item.badge}
                                </SidebarMenuBadge>
                              ) : null}
                            </>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarContent>

          <SidebarFooter className="role-sidebar__footer">
            <SidebarMenu>
              <SidebarProfileMenu
                profile={profile}
                onProfileUpdated={onProfileUpdated}
                onLogout={onLogout}
                buttonClassName="role-sidebar__profile"
                avatarClassName="role-sidebar__avatar"
                copyClassName="role-sidebar__profile-copy"
              />
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="role-workspace__main">
          <header className="role-workspace__topbar">
            <div className="role-workspace__heading">
              <SidebarTrigger
                className="role-workspace__trigger"
                aria-label="Afficher ou réduire le menu"
              />
              <span className="role-workspace__divider" aria-hidden="true" />
              <div>
                <p>{eyebrow}</p>
                <h1>{title}</h1>
              </div>
            </div>
            <div className="role-workspace__actions">
              {onNotificationsClick ? (
                <button
                  type="button"
                  className="role-workspace__action"
                  aria-label={`Notifications, ${notificationCount} non lue(s)`}
                  title="Notifications"
                  onClick={onNotificationsClick}
                >
                  <Bell aria-hidden="true" />
                  {notificationCount > 0 ? (
                    <span className="role-workspace__badge" aria-hidden="true">
                      {notificationCount > 99 ? "99+" : notificationCount}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <button
                type="button"
                className="role-workspace__action"
                aria-label="Se déconnecter"
                title="Se déconnecter"
                onClick={onLogout}
              >
                <LogOut aria-hidden="true" />
              </button>
            </div>
          </header>
          <div className="role-workspace__content">{children}</div>
        </SidebarInset>
      </SidebarProvider>
      {profileDialog === "view" ? (
        <ProfileViewDialog
          profile={profile}
          name={[profile.prenoms, profile.nom].filter(Boolean).join(" ")}
          avatarClassName="role-sidebar__avatar"
          onClose={() => setProfileDialog(null)}
          onEdit={
            profile.role === "ADMINISTRATEUR"
              ? () => setProfileDialog("edit")
              : undefined
          }
        />
      ) : null}
      {profileDialog === "edit" ? (
        <ProfileEditDialog
          profile={profile}
          onProfileUpdated={onProfileUpdated}
          onClose={() => setProfileDialog(null)}
        />
      ) : null}
    </TooltipProvider>
  );
}
