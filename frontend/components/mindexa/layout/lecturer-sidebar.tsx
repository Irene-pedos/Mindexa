// components/mindexa/layout/lecturer-sidebar.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Users,
  ClipboardList,
  AlertTriangle,
  Bot,
  Eye,
  Briefcase,
  BarChart3,
  Unlock,
  ChevronRight,
  ShieldCheck,
  Lock,
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { SparklesIcon } from "@/components/ui/sparkles-icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavUser } from "@/components/nav-user";
import { SidebarAiWidget } from "@/components/mindexa/layout/sidebar-ai-widget";
import { useAuth } from "@/hooks/use-auth";
import { notificationApi } from "@/lib/api/notification";
import { gradingApi } from "@/lib/api/grading";
import { NotificationType } from "@/lib/api/notification/notificationTypes";
import { User } from "@/lib/types/user";
import { hasDuty, isDutyOnlyStaff } from "@/lib/duty-workspace";

const mainNav = [
  { title: "Dashboard", url: "/lecturer/dashboard", icon: LayoutDashboard, tourId: "lecturer-dashboard" },
  {
    title: "My Assignments",
    url: "/lecturer/assignments",
    icon: Briefcase,
    badge: true,
  },
  { title: "My Workspaces", url: "/lecturer/courses", icon: BookOpen },
  { title: "Assessments", url: "/lecturer/assessments", icon: FileText, tourId: "lecturer-create-assessment" },
  {
    title: "Question Bank",
    url: "/lecturer/question-bank",
    icon: ClipboardList,
  },
];

const gradingNav = [
  { title: "Review Queue", url: "/lecturer/grading", icon: Users },
  {
    title: "Batch Review",
    url: "/lecturer/grading/batch",
    icon: ClipboardList,
  },
  {
    title: "Assessment Analytics",
    url: "/lecturer/grading/analytics",
    icon: BarChart3,
  },
];

const managementNav = [
  { title: "Live Supervision", url: "/lecturer/supervision", icon: Eye },
  { title: "AI Assistant", url: "/lecturer/ai-assistant", icon: Bot },
  {
    title: "Integrity Alerts",
    url: "/lecturer/integrity",
    icon: AlertTriangle,
  },
];

export function LecturerSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { user } = useAuth() as { user: User | null };
  const [hasNewAssignments, setHasNewAssignments] = React.useState(false);
  const [pendingGradingCount, setPendingGradingCount] =
    React.useState<number>(0);
  const [hasVisitedGradingCenter, setHasVisitedGradingCenter] =
    React.useState<boolean>(false);

  React.useEffect(() => {
    if (pathname.startsWith("/lecturer/grading")) {
      setHasVisitedGradingCenter(true);
      try {
        sessionStorage.setItem("lecturer_grading_visited", "true");
      } catch {}
    } else {
      try {
        const visited =
          sessionStorage.getItem("lecturer_grading_visited") === "true";
        setHasVisitedGradingCenter(visited);
      } catch {}
    }
  }, [pathname]);

  React.useEffect(() => {
    async function checkNotificationsAndQueue() {
      if (!user) return;
      try {
        const [res, queueRes] = await Promise.all([
          notificationApi.getNotifications(true).catch(() => ({ items: [] })),
          gradingApi
            .getGradingQueue({ status: "PENDING", page_size: 1 })
            .catch(() => ({ total: 0, items: [] })),
        ]);

        const hasAssignmentNotif = (res.items || []).some(
          (n) =>
            n.notification_type ===
            NotificationType.TEACHING_ASSIGNMENT_CREATED,
        );
        setHasNewAssignments(hasAssignmentNotif);
        setPendingGradingCount(
          (queueRes as any)?.total ?? (queueRes as any)?.items?.length ?? 0,
        );
      } catch (err) {
        console.error("Failed to check notifications or grading count", err);
      }
    }

    checkNotificationsAndQueue();
    // Refresh every 2 minutes
    const interval = setInterval(checkNotificationsAndQueue, 120000);

    // Pause polling when tab is inactive
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkNotificationsAndQueue();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user]);

  // Visibility follows active duty assignments only; the backend still enforces access.
  const isModerator = hasDuty(user, "MODERATOR");
  const isExamOfficer = hasDuty(user, "EXAM_OFFICER");
  const dutyOnly = isDutyOnlyStaff(user);

  const displayName =
    user?.profile?.display_name ||
    (user?.profile?.first_name
      ? `${user.profile.first_name} ${user.profile.last_name}`
      : "Lecturer");

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="relative flex h-14 w-full items-center overflow-hidden px-2 py-2">
          {/* Expanded: Full logo */}
          <div className="absolute left-2 flex origin-left items-center gap-3 transition-all duration-300 ease-in-out group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:scale-90 group-data-[collapsible=icon]:opacity-0">
            <div className="relative h-9 w-30 flex-shrink-0">
              <Image
                src="/icons/logo/mindexa-logo.svg"
                alt="Mindexa"
                fill
                priority
                className="object-contain"
              />
            </div>
          </div>

          {/* Collapsed: Icon only */}
          <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 scale-50 items-center justify-center opacity-0 transition-all duration-300 ease-in-out group-data-[collapsible=icon]:scale-100 group-data-[collapsible=icon]:opacity-100">
            <div className="relative h-4 w-4 flex-shrink-0">
              <Image
                src="/icons/logo/mindexa-icon.svg"
                alt="Mindexa"
                fill
                priority
                className="object-contain"
              />
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Teaching & grading navigation — hidden for office-based duty staff */}
        {!dutyOnly && (
        <>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Teaching
          </SidebarGroupLabel>
          <SidebarMenu>
            {mainNav.map((item) => {
              const isActive =
                pathname === item.url || pathname.startsWith(item.url + "/");
              const showBadge = item.badge === true && hasNewAssignments;

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
                      <item.icon className="size-4.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.title}</span>
                      {showBadge && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-reduce:hidden"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Grading Center Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Grading Center
          </SidebarGroupLabel>
          <SidebarMenu>
            <Collapsible
              asChild
              defaultOpen={pathname.startsWith("/lecturer/grading")}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip="Grading Center"
                    className={cn(
                      "relative h-9 rounded-xl text-xs font-medium transition-all duration-200",
                      pathname.startsWith("/lecturer/grading")
                        ? "bg-muted/60 text-foreground font-semibold [&_svg:first-child]:text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Users className="size-4.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">Grading Center</span>
                    {pendingGradingCount > 0 &&
                      !hasVisitedGradingCenter &&
                      !pathname.startsWith("/lecturer/grading") && (
                        <Badge className="ml-auto mr-1 h-5 px-1.5 flex items-center justify-center text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border-none group-data-[collapsible=icon]:hidden">
                          {pendingGradingCount}
                        </Badge>
                      )}
                    <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub className="ml-4 mr-2 flex flex-col gap-1 border-l border-border/50 pl-2.5 pr-1 py-1 my-1">
                    {gradingNav.map((subItem) => {
                      const isBatch = pathname.startsWith("/lecturer/grading/batch");
                      const isAnalytics = pathname.startsWith("/lecturer/grading/analytics");
                      let isActive = false;
                      if (subItem.url === "/lecturer/grading/batch") {
                        isActive = isBatch;
                      } else if (subItem.url === "/lecturer/grading/analytics") {
                        isActive = isAnalytics;
                      } else if (subItem.url === "/lecturer/grading") {
                        isActive = pathname.startsWith("/lecturer/grading") && !isBatch && !isAnalytics;
                      }

                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive}
                            className={cn(
                              "group/sub h-7.5 px-2.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-2",
                              isActive
                                ? "!bg-primary/10 !text-primary font-semibold hover:!bg-primary/15"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            <Link href={subItem.url} className="flex items-center gap-2 w-full">
                              <subItem.icon
                                className={cn(
                                  "size-3.5 shrink-0 transition-colors",
                                  isActive
                                    ? "!text-primary"
                                    : "text-muted-foreground/70 group-hover/sub:text-foreground"
                                )}
                                aria-hidden="true"
                              />
                              <span className="truncate flex-1">{subItem.title}</span>
                              {isActive && (
                                <span className="size-1.5 rounded-full bg-primary shrink-0" />
                              )}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroup>
        </>
        )}

        {/* Academic Duties (Moderator & Exam Officer) */}
        {(isModerator || isExamOfficer) && (
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              {dutyOnly ? "My Duties" : "Academic Duties"}
            </SidebarGroupLabel>
            <SidebarMenu>
              {isModerator && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Moderation Queue"
                    isActive={pathname === "/lecturer/moderation" || pathname.startsWith("/lecturer/moderation/")}
                    className={cn(
                      "relative h-9 rounded-xl text-xs font-medium transition-all duration-200",
                      pathname.startsWith("/lecturer/moderation")
                        ? "!bg-primary !text-primary-foreground font-semibold shadow-sm shadow-primary/25 [&_svg]:!text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Link href="/lecturer/moderation" className="relative flex items-center w-full">
                      <ShieldCheck className="size-4.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">Moderation Queue</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isExamOfficer && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Exam Office & Seals"
                    isActive={pathname === "/lecturer/exam-office" || pathname.startsWith("/lecturer/exam-office/")}
                    className={cn(
                      "relative h-9 rounded-xl text-xs font-medium transition-all duration-200",
                      pathname.startsWith("/lecturer/exam-office")
                        ? "!bg-primary !text-primary-foreground font-semibold shadow-sm shadow-primary/25 [&_svg]:!text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <Link href="/lecturer/exam-office" className="relative flex items-center w-full">
                      <Lock className="size-4.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">Exam Office & Seals</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* Management & Oversight */}
        {!dutyOnly && (
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            Management
          </SidebarGroupLabel>
          <SidebarMenu>
            {managementNav.map((item) => {
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
                      <item.icon className="size-4.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="gap-2">
        {!dutyOnly && (
          <SidebarAiWidget
            storageKey="mindexa_lecturer_sidebar_ai_widget"
            title="Academic AI Copilot"
            description="Create assessments, generate questions, review submissions, and improve feedback."
            buttonText="Open AI Assistant"
            buttonHref="/lecturer/ai-assistant"
          />
        )}
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
