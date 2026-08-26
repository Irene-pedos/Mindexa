// components/mindexa/layout/student-sidebar.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Calendar,
  Trophy,
  Brain,
  Upload,
  Lightbulb,
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
import { SparklesIcon } from "@/components/ui/sparkles-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavUser } from "@/components/nav-user";
import { SidebarAiWidget } from "@/components/mindexa/layout/sidebar-ai-widget";
import { useAuth } from "@/hooks/use-auth";
import { studentApi } from "@/lib/api/student";
import { assessmentApi } from "@/lib/api/assessment";
import { getAssessmentCategory } from "@/lib/grading-architecture";

const mainNav = [
  { title: "Dashboard", url: "/student/dashboard", icon: LayoutDashboard, tourId: "student-dashboard" },
  { title: "My Courses", url: "/student/courses", icon: BookOpen },
  { title: "Assessments", url: "/student/assessments", icon: FileText, tourId: "student-assessments" },
  { title: "Schedule", url: "/student/schedule", icon: Calendar },
];

const toolsNav = [
  { title: "Results & Feedback", url: "/student/results", icon: Trophy, tourId: "student-results" },
  { title: "Study Support", url: "/student/study", icon: Brain, tourId: "student-study" },
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
        const res = await assessmentApi.getAssessments({ page_size: 100 });
        const items = res.items || [];
        let upcoming = 0;
        let active = 0;
        for (const a of items) {
          const cat = getAssessmentCategory(a);
          if (cat === "UPCOMING") {
            upcoming++;
          } else if (cat === "ACTIVE" || cat === "IN_PROGRESS") {
            active++;
          }
        }
        // Show upcoming count first; if 0, show active count
        const count = upcoming > 0 ? upcoming : active;
        setPendingAssessmentsCount(count);
      } catch (e) {
        console.error("Failed to check pending assessments", e);
      }
    }
    checkPendingAssessments();
    const interval = setInterval(checkPendingAssessments, 60000);
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
                    className={cn(
                      "relative h-9 rounded-xl text-xs font-medium transition-all duration-200",
                      isActive
                        ? "!bg-primary !text-primary-foreground font-semibold shadow-sm shadow-primary/25 [&_svg]:!text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Link
                      href={item.url}
                      data-tour={item.tourId}
                      className="relative flex items-center w-full"
                    >
                      <item.icon className="size-4.5 shrink-0" />
                      <span className="truncate">{item.title}</span>
                      {showBadge && (
                        <Badge
                          className={cn(
                            "ml-auto mr-1 h-5 px-1.5 flex items-center justify-center text-xs font-semibold border-none group-data-[collapsible=icon]:hidden",
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                          )}
                        >
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
      </SidebarContent>

      <SidebarFooter className="gap-2">
        <SidebarAiWidget
          storageKey="mindexa_student_sidebar_ai_widget"
          title="Study with AI"
          description="Get explanations from your course materials, ask questions, and practice before assessments."
          buttonText="Open Study AI"
          buttonHref="/student/study"
        />
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
