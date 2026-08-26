// components/mindexa/layout/admin-sidebar.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Shield,
  BarChart3,
  Settings,
  GraduationCap,
  Building2,
  Calendar,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/nav-user";
import { SidebarAiWidget } from "@/components/mindexa/layout/sidebar-ai-widget";
import { useAuth } from "@/hooks/use-auth";

const mainNav = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard, tourId: "admin-dashboard" },
  { title: "Users & Roles", url: "/admin/users", icon: Users, tourId: "admin-users" },
  { title: "Institutions", url: "/admin/institutions", icon: Building2 },
  { title: "Academic Structure", url: "/admin/academic/structure", icon: GraduationCap },
  { title: "Academic Periods", url: "/admin/academic/periods", icon: Calendar },
  { title: "Academic Assignments", url: "/admin/academic/assignments", icon: Users },
  { title: "Courses & Classes", url: "/admin/courses", icon: BookOpen, tourId: "admin-courses" },
];

const oversightNav = [
  { title: "Integrity & Security", url: "/admin/integrity", icon: Shield },
  { title: "Platform Analytics", url: "/admin/analytics", icon: BarChart3 },
  { title: "System Settings", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user } = useAuth();

  const displayName = (user?.profile as any)?.display_name ||
    ((user?.profile as any)?.first_name ? `${(user?.profile as any).first_name} ${(user?.profile as any).last_name}` : "Administrator")

  const userData = {
    name: displayName,
    email: (user as any)?.email || "",
    avatar: (user?.profile as any)?.avatar_url || "/avatars/user avatar.png"
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="relative flex h-14 w-full items-center overflow-hidden px-2 py-2">
          {/* Expanded: Full horizontal logo */}
          <div className="absolute left-2 flex origin-left items-center gap-3 transition-all duration-300 ease-in-out group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:scale-90 group-data-[collapsible=icon]:opacity-0">
            <div className="relative h-9 w-30 flex-shrink-0">
              <Image
                src="/icons/logo/mindexa-logo.svg"
                alt="Mindexa"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Collapsed: Icon only (smaller and centered) */}
          <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 scale-50 items-center justify-center opacity-0 transition-all duration-300 ease-in-out group-data-[collapsible=icon]:scale-100 group-data-[collapsible=icon]:opacity-100">
            <div className="relative h-4 w-4 flex-shrink-0">
              <Image
                src="/icons/logo/mindexa-icon.svg"
                alt="Mindexa"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Oversight
          </SidebarGroupLabel>
          <SidebarMenu>
            {mainNav.map((item) => {
              const isActive =
                pathname === item.url || pathname.startsWith(item.url + "/");
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive}
                    className={cn(
                      "relative h-9 rounded-xl text-xs font-medium transition-all duration-200",
                      isActive
                        ? "!bg-primary !text-primary-foreground font-semibold shadow-sm shadow-primary/25 [&_svg]:!text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Link href={item.url} data-tour={item.tourId} className="relative flex items-center w-full">
                      <item.icon className="size-4.5 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Management
          </SidebarGroupLabel>
          <SidebarMenu>
            {oversightNav.map((item) => {
              const isActive =
                pathname === item.url || pathname.startsWith(item.url + "/");
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive}
                    className={cn(
                      "relative h-9 rounded-xl text-xs font-medium transition-all duration-200",
                      isActive
                        ? "!bg-primary !text-primary-foreground font-semibold shadow-sm shadow-primary/25 [&_svg]:!text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Link href={item.url} className="relative flex items-center w-full">
                      <item.icon className="size-4.5 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2">
        <SidebarAiWidget
          storageKey="mindexa_admin_sidebar_ai_widget"
          title="AI Integrity & Audits"
          description="Monitor assessment integrity, track anomalies, and supervise institutional governance."
          buttonText="Integrity Dashboard"
          buttonHref="/admin/integrity"
        />
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
