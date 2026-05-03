// components/mindexa/layout/site-header.tsx
"use client";

import {
  Bell,
  LogOut,
  User,
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
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  const { logout, user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
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
    // Refresh every 2 minutes
    const interval = setInterval(loadNotifications, 120000);
    return () => clearInterval(interval);
  }, [user]);

  const getIcon = (type: string) => {
    switch (type) {
      // Student
      case "RESULT_RELEASED": return <Award className="size-4 text-emerald-600" />
      case "DEADLINE_EXTENDED": return <Calendar className="size-4 text-amber-600" />
      case "ASSESSMENT_PUBLISHED": return <Bell className="size-4 text-blue-600" />
      
      // Lecturer
      case "NEW_SUBMISSION": return <FileText className="size-4 text-blue-600" />
      case "GRADING_REMINDER": return <Calendar className="size-4 text-amber-600" />
      case "APPEAL_SUBMITTED": return <AlertTriangle className="size-4 text-red-600" />
      
      // Admin
      case "SYSTEM_ALERT": return <Server className="size-4 text-red-600" />
      case "SECURITY_EVENT": return <Shield className="size-4 text-amber-600" />
      case "NEW_USER_REQUEST": return <UserPlus className="size-4 text-blue-600" />
      
      default: return <Bell className="size-4 text-muted-foreground" />
    }
  }

  const handleMarkRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification as read", err);
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

      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="font-medium">
          {role}
        </Badge>

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
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="h-72">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              ) : (
                notifications.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    className="flex gap-3 py-3 cursor-pointer"
                    onClick={() => !n.is_read && handleMarkRead(n.id)}
                  >
                    <div className="mt-0.5 shrink-0">
                      {getIcon(n.notification_type)}
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      <div
                        className={`text-sm truncate ${n.is_read ? "text-muted-foreground" : "font-medium"}`}
                      >
                        {n.title}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {n.body}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    {!n.is_read && (
                      <div className="ml-auto size-2 rounded-full bg-primary shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </ScrollArea>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="w-full justify-center py-2 cursor-pointer">
              <Link href={`/${role.toLowerCase()}/notifications`} className="text-primary text-xs font-medium">
                View all notifications
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/${role.toLowerCase()}/profile`}>Profile Settings</Link>
            </DropdownMenuItem>
            {role.toLowerCase() === "student" && (
              <DropdownMenuItem asChild>
                <Link href="/student/academic-record">Academic Record</Link>
              </DropdownMenuItem>
            )}
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
