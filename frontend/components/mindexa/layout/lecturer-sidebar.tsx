// components/mindexa/layout/lecturer-sidebar.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
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
  ChevronRight
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
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NavUser } from "@/components/nav-user";
import { useAuth } from "@/hooks/use-auth";
import { notificationApi } from "@/lib/api/notification";
import { NotificationType } from "@/lib/api/notification/notificationTypes";
import { User } from "@/lib/types/user";

const mainNav = [
  { title: "Dashboard", url: "/lecturer/dashboard", icon: LayoutDashboard },
  { title: "My Assignments", url: "/lecturer/assignments", icon: Briefcase, badge: true },
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
  { title: "Batch Review", url: "/lecturer/grading/batch", icon: ClipboardList },
  { title: "Quality Assurance", url: "/lecturer/grading/moderation", icon: AlertTriangle },
  { title: "Result Release Center", url: "/lecturer/grading/release", icon: Unlock },
  { title: "Assessment Analytics", url: "/lecturer/grading/analytics", icon: BarChart3 },
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

  React.useEffect(() => {
    async function checkNotifications() {
      if (!user) return;
      try {
        const res = await notificationApi.getNotifications(true);
        const hasAssignmentNotif = res.items.some(
          n => n.notification_type === NotificationType.TEACHING_ASSIGNMENT_CREATED
        );
        setHasNewAssignments(hasAssignmentNotif);
      } catch (err) {
        console.error("Failed to check notifications", err);
        toast.error("Failed to check notifications");
      }
    }

    checkNotifications();
    // Refresh every 2 minutes
    const interval = setInterval(checkNotifications, 120000);
    
    // Pause polling when tab is inactive
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const displayName =
    user?.profile?.display_name ||
    (user?.profile?.first_name
      ? `${user.profile.first_name} ${user.profile.last_name}`
      : "Lecturer");

  const userData = {
    name: displayName,
    email: user?.email || "",
    avatar: user?.profile?.avatar_url || "/avatars/user avatar.png",
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
                  <SidebarMenuButton tooltip="Grading Center">
                     <Users className="size-5" aria-hidden="true" />
                     <span>Grading Center</span>
                     <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {gradingNav.map((subItem) => {
const isActive = pathname === subItem.url || pathname.startsWith(subItem.url + "/");
                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton asChild isActive={isActive}>
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

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
