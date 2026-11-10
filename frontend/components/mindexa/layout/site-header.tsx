// components/mindexa/layout/site-header.tsx
"use client";

import {
  Bell,
  LogOut,
  AlertTriangle,
  Award,
  Calendar,
  FileText,
  Users,
  Server,
  Shield,
  UserPlus,
  AlertCircle,
  Loader2,
  Compass,
  CheckCheck,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { notificationApi, NotificationResponse } from "@/lib/api/notification";
import { formatDistanceToNow } from "date-fns";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationResponse[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Determine role from user or pathname
  const role =
    user?.role ||
    (pathname.startsWith("/admin")
      ? "Admin"
      : pathname.startsWith("/lecturer")
        ? "Lecturer"
        : pathname.startsWith("/student")
          ? "Student"
          : "Guest");

  useEffect(() => {
    async function loadNotifications() {
      if (!user) return;
      try {
        setLoading(true);
        // Fetch last 10 notifications (both read and unread for the dropdown)
        const data = await notificationApi.getNotifications(false, 1, 10);
        setNotifications(data.items);

        // Also fetch total unread count
        const unreadData = await notificationApi.getNotifications(true, 1, 1);
        setUnreadCount(unreadData.total);
      } catch (err) {
        console.error("Failed to load notifications", err);
      } finally {
        setLoading(false);
      }
    }

    loadNotifications();
    // Refresh every 2 minutes, and straight away when the user comes back to the tab
    const interval = setInterval(loadNotifications, 120000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  const getIcon = (type: string) => {
    switch (type) {
      // Student
      case "RESULT_RELEASED":
      case "GROUP_RESULT_RELEASED":
        return <Award className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
      case "DEADLINE_EXTENDED":
        return <Calendar className="size-3.5 text-amber-600 dark:text-amber-400" />;
      case "ASSESSMENT_PUBLISHED":
      case "ASSESSMENT_AVAILABLE":
      case "GROUP_WORK_ASSIGNED":
        return <Bell className="size-3.5 text-blue-600 dark:text-blue-400" />;
      case "APPEAL_DECISION":
      case "APPEAL_RESOLVED":
        return <AlertTriangle className="size-3.5 text-violet-600 dark:text-violet-400" />;

      // Lecturer
      case "NEW_SUBMISSION":
      case "SUBMISSION_RECEIVED":
        return <FileText className="size-3.5 text-blue-600 dark:text-blue-400" />;
      case "GRADING_REMINDER":
      case "GRADING_REQUIRED":
        return <Calendar className="size-3.5 text-amber-600 dark:text-amber-400" />;
      case "APPEAL_SUBMITTED":
      case "GROUP_APPEAL_REQUEST":
        return <AlertTriangle className="size-3.5 text-rose-600 dark:text-rose-400" />;

      // Admin
      case "SYSTEM_ALERT":
        return <Server className="size-3.5 text-rose-600 dark:text-rose-400" />;
      case "SECURITY_EVENT":
      case "POLICY_VIOLATION":
        return <Shield className="size-3.5 text-amber-600 dark:text-amber-400" />;
      case "NEW_USER_REQUEST":
        return <UserPlus className="size-3.5 text-blue-600 dark:text-blue-400" />;

      default:
        return <Bell className="size-3.5 text-muted-foreground" />;
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const handleItemClick = async (n: NotificationResponse) => {
    if (!n.is_read) {
      void handleMarkRead(n.id);
    }
    if (n.action_url) {
      router.push(n.action_url);
    }
  };

  // Improved breadcrumb generator with role prefixes
  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean);
    const crumbs = [
      { label: "Home", href: `/${role.toLowerCase()}/dashboard` },
    ];

    if (segments.includes("assessments"))
      crumbs.push({
        label: "Assessments",
        href: `/${role.toLowerCase()}/assessments`,
      });
    if (segments.includes("results"))
      crumbs.push({ label: "Results", href: `/${role.toLowerCase()}/results` });
    if (segments.includes("courses"))
      crumbs.push({ label: "Courses", href: `/${role.toLowerCase()}/courses` });
    if (segments.includes("study"))
      crumbs.push({
        label: "Study Support",
        href: `/${role.toLowerCase()}/study`,
      });
    if (segments.includes("resources"))
      crumbs.push({
        label: "Resources",
        href: `/${role.toLowerCase()}/resources`,
      });
    if (segments.includes("schedule"))
      crumbs.push({
        label: "Schedule",
        href: `/${role.toLowerCase()}/schedule`,
      });
    if (segments.includes("profile"))
      crumbs.push({ label: "Profile", href: `/${role.toLowerCase()}/profile` });
    if (segments.includes("grading"))
      crumbs.push({ label: "Grading Queue", href: "/lecturer/grading" });
    if (segments.includes("supervision"))
      crumbs.push({ label: "Live Supervision", href: "/lecturer/supervision" });
    if (segments.includes("ai-assistant"))
      crumbs.push({ label: "AI Assistant", href: "/lecturer/ai-assistant" });

    return crumbs;
  };

  const crumbs = getBreadcrumbs();

  // Construct absolute profile picture URL
  const backendBaseUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ||
    "http://localhost:8000";
  const profilePictureUrl = user?.profile?.avatar_url
    ? `${backendBaseUrl}${user.profile.avatar_url}`
    : undefined;

  // Initials for fallback
  const initials =
    user?.profile?.first_name && user?.profile?.last_name
      ? `${user.profile.first_name[0]}${user.profile.last_name[0]}`
      : user?.email?.[0].toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />

      <Separator orientation="vertical" className="mr-2 h-4" />

      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              <BreadcrumbItem>
                {index === crumbs.length - 1 ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < crumbs.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("mindexa-open-tour", { detail: { step: 0 } }));
            }
          }}
          className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-2.5"
          title="Take Guided Tour"
        >
          <Compass className="size-3.5 text-primary" />
          <span>Take Tour</span>
        </Button>

        <Badge variant="secondary" className="font-medium">
          {role}
        </Badge>

        <ModeToggle />

        {/* Notifications Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            collisionPadding={12}
            className="w-[calc(100vw-2rem)] xs:w-[320px] sm:w-[340px] max-w-[calc(100vw-2rem)] sm:max-w-[350px] p-0 rounded-xl shadow-lg border border-border/60 bg-popover text-popover-foreground overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/20">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">Notifications</span>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-bold bg-primary/10 text-primary border-primary/20">
                    {unreadCount} new
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      handleMarkAllRead();
                    }}
                    className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground font-medium rounded-md gap-1"
                  >
                    <CheckCheck className="size-3 text-primary" />
                    <span>Mark all read</span>
                  </Button>
                )}
                {loading && (
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            {/* List */}
            <ScrollArea className="max-h-[min(340px,55vh)] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 px-3 text-center">
                  <div className="size-8 rounded-full bg-muted/60 mx-auto mb-2 flex items-center justify-center text-muted-foreground/60 border border-border/40">
                    <Bell className="size-4" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">No notifications</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px] mx-auto">
                    You&apos;re all caught up! New notices and alerts will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {notifications.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className={cn(
                        "flex items-start gap-2.5 p-2.5 sm:p-3 cursor-pointer focus:bg-muted/50 rounded-none transition-colors w-full text-left min-w-0 outline-hidden",
                        !n.is_read
                          ? "bg-primary/[0.03] dark:bg-primary/[0.06] hover:bg-primary/[0.06]"
                          : "hover:bg-muted/30"
                      )}
                      onClick={() => handleItemClick(n)}
                    >
                      <div className="mt-0.5 shrink-0 size-7 rounded-md flex items-center justify-center bg-muted/50 border border-border/50">
                        {getIcon(n.notification_type)}
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-start justify-between gap-1.5 min-w-0">
                          <h4 className={cn(
                            "text-xs leading-snug break-words [overflow-wrap:anywhere] min-w-0 flex-1",
                            n.is_read ? "font-medium text-foreground/80" : "font-semibold text-foreground"
                          )}>
                            {n.title}
                          </h4>
                          {!n.is_read && (
                            <span
                              className="size-1.5 rounded-full bg-primary shrink-0 mt-1 ring-2 ring-primary/20"
                              title="Unread"
                            />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed break-words [overflow-wrap:anywhere] whitespace-normal">
                          {n.body}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5 text-[9px] text-muted-foreground/75 font-medium">
                          <span>
                            {formatDistanceToNow(new Date(n.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                          {n.action_url && (
                            <>
                              <span>•</span>
                              <span className="text-primary font-medium flex items-center gap-0.5 hover:underline">
                                Details &rarr;
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Footer */}
            <div className="border-t border-border/50 p-1.5 bg-muted/10">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="w-full justify-center h-7 text-[11px] text-primary font-medium hover:text-primary hover:bg-primary/5 rounded-md gap-1"
              >
                <Link href={`/${role.toLowerCase()}/notifications`}>
                  <span>View all notifications</span>
                  <ArrowRight className="size-3" />
                </Link>
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="size-7">
                <AvatarImage
                  src={profilePictureUrl}
                  alt={user?.profile?.display_name || "User"}
                />
                <AvatarFallback className="bg-muted text-[10px] font-bold">
                  {initials}
                </AvatarFallback>
                <AvatarBadge className="bg-green-600 dark:bg-green-800" />
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/${role.toLowerCase()}/profile`}>
                Profile Settings
              </Link>
            </DropdownMenuItem>
            {role.toLowerCase() === "student" && (
              <DropdownMenuItem asChild>
                <Link href="/student/academic-record">Academic Record</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("mindexa-open-tour", { detail: { step: 0 } }));
                }
              }}
            >
              <Compass className="mr-2 size-4 text-primary" />
              Guided Tour
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive cursor-pointer"
              onClick={() => logout()}
            >
              <LogOut className="mr-2 size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
