"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Bell, LogOut, type LucideIcon } from "lucide-react";
import SidebarProfileMenu from "@/components/sidebar-profile-menu";
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
  const groups: { id: "operations" | "account"; label: string }[] = [
    { id: "operations", label: "Navigation" },
    { id: "account", label: "Compte" },
  ];
  const groupedItems = items.filter((item) => item.id !== "profile");

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
        <Sidebar className="role-sidebar" variant="inset" collapsible="icon">
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
    </TooltipProvider>
  );
}
