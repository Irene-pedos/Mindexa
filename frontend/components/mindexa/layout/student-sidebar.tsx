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
import { Badge } from "@/components/ui/badge";
import { NavUser } from "@/components/nav-user";
import { useAuth } from "@/hooks/use-auth";
import { studentApi } from "@/lib/api/student";
import { assessmentApi } from "@/lib/api/assessment";

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
  const [pendingAssessmentsCount, setPendingAssessmentsCount] =
    React.useState<number>(0);
  const [hasVisitedAssessments, setHasVisitedAssessments] =
    React.useState<boolean>(false);

  React.useEffect(() => {
    if (pathname.startsWith("/student/assessments")) {
      setHasVisitedAssessments(true);
      try {
        sessionStorage.setItem("student_assessments_visited", "true");
      } catch {}
    } else {
      try {
        const visited =
          sessionStorage.getItem("student_assessments_visited") === "true";
        setHasVisitedAssessments(visited);
      } catch {}
    }
  }, [pathname]);

  React.useEffect(() => {
    async function checkPendingAssessments() {
      if (!user) return;
      try {
        const dash = await studentApi.getDashboard().catch(() => null);
        if (dash?.summary?.active_assessments_count?.value !== undefined) {
          setPendingAssessmentsCount(
            dash.summary.active_assessments_count.value,
          );
        } else {
          const res = await assessmentApi.getAssessments({ page_size: 50 });
          const validItems = (res.items || []).filter(
            (a: any) => a.status === "PUBLISHED" || a.status === "IN_PROGRESS",
          );
          setPendingAssessmentsCount(validItems.length);
        }
      } catch (e) {
        console.error("Failed to check pending assessments", e);
      }
    }
    checkPendingAssessments();
    const interval = setInterval(checkPendingAssessments, 120000);
    return () => clearInterval(interval);
  }, [user]);

  const displayName =
    (user?.profile as any)?.display_name ||
    ((user?.profile as any)?.first_name
      ? `${(user?.profile as any).first_name} ${(user?.profile as any).last_name}`
      : "Student");

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
              const isAssessmentsTab = item.title === "Assessments";
              const showBadge =
                isAssessmentsTab &&
                pendingAssessmentsCount > 0 &&
                !hasVisitedAssessments &&
                !pathname.startsWith("/student/assessments");

              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive}
                  >
                    <Link
                      href={item.url}
                      className="relative flex items-center w-full"
                    >
                      <item.icon className="size-5" />
                      <span>{item.title}</span>
                      {showBadge && (
                        <Badge className="ml-auto mr-1 h-5 px-1.5 flex items-center justify-center text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border-none group-data-[collapsible=icon]:hidden">
                          {pendingAssessmentsCount}
                        </Badge>
                      )}
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
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
