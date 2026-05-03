// components/mindexa/layout/student-sidebar.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Calendar,
  Trophy,
  Brain,
  Upload,
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
import { useAuth } from "@/hooks/use-auth";

const mainNav = [
  { title: "Dashboard", url: "/student/dashboard", icon: LayoutDashboard },
  { title: "My Courses", url: "/student/courses", icon: BookOpen },
  { title: "Assessments", url: "/student/assessments", icon: FileText },
  { title: "Schedule", url: "/student/schedule", icon: Calendar },
];

const toolsNav = [
  { title: "Results & Feedback", url: "/student/results", icon: Trophy },
  { title: "Study Support", url: "/student/study", icon: Brain },
  { title: "Upload Resources", url: "/student/resources", icon: Upload },
];

export function StudentSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user } = useAuth();

  const displayName =
    (user?.profile as any)?.display_name ||
    ((user?.profile as any)?.first_name
      ? `${(user?.profile as any).first_name} ${(user?.profile as any).last_name}`
      : "Student");

  const userData = {
    name: displayName,
    email: (user as any)?.email || "",
    avatar:
      (user?.profile as any)?.profile_picture_url || "/avatars/user avatar.png",
  };

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
        {/* Main Academic Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Core
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
                  >
                    <Link href={item.url}>
                      <item.icon className="size-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Tools & Support */}
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Tools
          </SidebarGroupLabel>
          <SidebarMenu>
            {toolsNav.map((item) => {
              const isActive =
                pathname === item.url || pathname.startsWith(item.url + "/");
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive}
                  >
                    <Link href={item.url}>
                      <item.icon className="size-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
