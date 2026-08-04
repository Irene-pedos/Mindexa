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
import { BorderTrail } from "@/components/ui/border-trail";
import { NavUser } from "@/components/nav-user";
import { useAuth } from "@/hooks/use-auth";
import { notificationApi } from "@/lib/api/notification";
import { gradingApi } from "@/lib/api/grading";
import { NotificationType } from "@/lib/api/notification/notificationTypes";
import { User } from "@/lib/types/user";

const mainNav = [
  { title: "Dashboard", url: "/lecturer/dashboard", icon: LayoutDashboard },
  {
    title: "My Assignments",
    url: "/lecturer/assignments",
    icon: Briefcase,
    badge: true,
  },
  { title: "My Workspaces", url: "/lecturer/courses", icon: BookOpen },
  { title: "Assessments", url: "/lecturer/assessments", icon: FileText },
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
        {/* Main Teaching Navigation */}
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
                      "transition-all duration-200",
                      isActive &&
                        "!bg-primary !text-primary-foreground font-semibold shadow-xs [&>svg]:!text-primary-foreground",
                    )}
                  >
                    <Link href={item.url} className="relative">
                      <item.icon className="size-5" aria-hidden="true" />
                      <span>{item.title}</span>
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
                      "transition-all duration-200",
                      pathname.startsWith("/lecturer/grading") &&
                        "!bg-primary !text-primary-foreground font-semibold shadow-xs [&>svg]:!text-primary-foreground",
                    )}
                  >
                    <Users className="size-5" aria-hidden="true" />
                    <span>Grading Center</span>
                    {pendingGradingCount > 0 &&
                      !hasVisitedGradingCenter &&
                      !pathname.startsWith("/lecturer/grading") && (
                        <Badge className="ml-auto mr-1 h-5 px-1.5 flex items-center justify-center text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border-none group-data-[collapsible=icon]:hidden">
                          {pendingGradingCount}
                        </Badge>
                      )}
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {gradingNav.map((subItem) => {
                      const isActive =
                        pathname === subItem.url ||
                        pathname.startsWith(subItem.url + "/");
                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive}
                            className={cn(
                              "transition-all duration-200",
                              isActive &&
                                "!bg-primary !text-primary-foreground font-semibold shadow-xs",
                            )}
                          >
                            <Link href={subItem.url}>
                              <span>{subItem.title}</span>
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

        {/* Management & Oversight */}
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
                      "transition-all duration-200",
                      isActive &&
                        "!bg-primary !text-primary-foreground font-semibold shadow-xs [&>svg]:!text-primary-foreground",
                    )}
                  >
                    <Link href={item.url}>
                      <item.icon className="size-5" aria-hidden="true" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2">
        <div className="group-data-[collapsible=icon]:hidden px-1">
          <div className="relative rounded-xl border border-primary/40 bg-card p-3 shadow-xs space-y-2 text-left transition-all duration-300 hover:border-primary/70 overflow-hidden">
            <div className="absolute -inset-px rounded-xl border border-primary/30 animate-pulse pointer-events-none" />
            <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
              <SparklesIcon size={16} className="text-primary" /> Lecturer AI Assistant
            </div>
            <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
              Create assessments, generate questions, review AI grading, and improve feedback.
            </p>
            <Button
              asChild
              size="sm"
              className="w-full h-7.5 text-xs font-semibold rounded-lg shadow-xs"
            >
              <Link href="/lecturer/ai-assistant">Open AI Assistant</Link>
            </Button>
          </div>
        </div>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
