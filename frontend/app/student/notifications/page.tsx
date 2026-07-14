// app/student/notifications/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  Bell,
  Calendar,
  Award,
  AlertTriangle,
  CheckCheck,
  Eye,
  PlayCircle,
  RefreshCcw,
} from "lucide-react";
import Link from "next/link";
import { notificationApi, NotificationResponse } from "@/lib/api/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "unread" | "assessments" | "alerts"
  >("all");

  async function loadNotifications() {
    try {
      const data = await notificationApi.getNotifications();
      setNotifications(data.items);
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      toast.success("All notifications marked as read");
      loadNotifications();
    } catch (err) {
      toast.error("Failed to mark all as read");
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
    } catch (err) {
      console.error("Failed to mark read", err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "RESULT_RELEASED":
      case "GROUP_RESULT_RELEASED":
        return <Award className="size-4.5 text-emerald-600" />;
      case "DEADLINE_EXTENDED":
        return <Calendar className="size-4.5 text-amber-600" />;
      case "ASSESSMENT_PUBLISHED":
      case "GROUP_WORK_ASSIGNED":
        return <Bell className="size-4.5 text-blue-600" />;
      case "APPEAL_DECISION":
      case "APPEAL_RESOLVED":
        return <AlertTriangle className="size-4.5 text-violet-600" />;
      case "GROUP_APPROVAL_REQUEST":
      case "GROUP_APPEAL_REQUEST":
        return <CheckCheck className="size-4.5 text-primary" />;
      case "GROUP_REASSESSMENT_ASSIGNED":
        return <RefreshCcw className="size-4.5 text-amber-600" />;
      default:
        return <Bell className="size-4.5 text-muted-foreground" />;
    }
  };

  const filteredNotifications = notifications.filter((notif) => {
    if (filter === "unread") return !notif.is_read;
    if (filter === "assessments") {
      return [
        "RESULT_RELEASED",
        "GROUP_RESULT_RELEASED",
        "ASSESSMENT_PUBLISHED",
        "GROUP_WORK_ASSIGNED",
      ].includes(notif.notification_type);
    }
    if (filter === "alerts") {
      return [
        "DEADLINE_EXTENDED",
        "GROUP_REASSESSMENT_ASSIGNED",
        "APPEAL_DECISION",
        "APPEAL_RESOLVED",
      ].includes(notif.notification_type);
    }
    return true;
  });

  return (
    <div className="space-y-5 w-full max-w-7xl mx-auto p-4 md:p-6">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <Bell className="size-5 text-primary shrink-0" /> Notifications
          </h1>
          <p className="text-[10px]">
            Registry Feed • Real-time Monitoring Active
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={notifications.every((n) => n.is_read)}
          className="h-8 px-3.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border-zinc-200 bg-white"
        >
          <CheckCheck className="mr-1.5 size-3.5" /> Mark all read
        </Button>
      </div>

      {/* Tabs Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 border-b border-zinc-100 scrollbar-none">
        {[
          {
            id: "all",
            label: "All Notifications",
            count: notifications.length,
          },
          {
            id: "unread",
            label: "Unread",
            count: notifications.filter((n) => !n.is_read).length,
          },
          {
            id: "assessments",
            label: "Assessments & Grades",
            count: notifications.filter((n) =>
              [
                "RESULT_RELEASED",
                "GROUP_RESULT_RELEASED",
                "ASSESSMENT_PUBLISHED",
                "GROUP_WORK_ASSIGNED",
              ].includes(n.notification_type),
            ).length,
          },
          {
            id: "alerts",
            label: "Alerts & Appeals",
            count: notifications.filter((n) =>
              [
                "DEADLINE_EXTENDED",
                "GROUP_REASSESSMENT_ASSIGNED",
                "APPEAL_DECISION",
                "APPEAL_RESOLVED",
              ].includes(n.notification_type),
            ).length,
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id as any)}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap",
              filter === t.id
                ? "border-primary bg-primary/5 text-primary shadow-sm"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-zinc-100",
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none",
                  filter === t.id
                    ? "bg-primary text-white"
                    : "bg-zinc-100 text-muted-foreground border",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Registry Feed list container */}
      <div className="space-y-2">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex gap-4 p-4 border rounded-xl bg-white animate-pulse"
            >
              <Skeleton className="size-9 rounded-lg" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3 rounded" />
                <Skeleton className="h-3 w-5/6 rounded" />
              </div>
            </div>
          ))
        ) : filteredNotifications.length === 0 ? (
          <div className="py-16 text-center bg-zinc-50/50 border border-dashed rounded-xl">
            <Bell className="mx-auto size-8 text-muted-foreground/20 mb-3" />
            <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
              Transmission Feed Empty
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const isAssessment = [
              "ASSESSMENT_PUBLISHED",
              "GROUP_WORK_ASSIGNED",
              "GROUP_REASSESSMENT_ASSIGNED",
            ].includes(notif.notification_type);

            return (
              <div
                key={notif.id}
                className={cn(
                  "group relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border rounded-xl bg-white/70 hover:bg-white shadow-sm transition-all duration-200",
                  notif.is_read
                    ? "border-zinc-200/50 opacity-75"
                    : "border-primary/25",
                )}
              >
                <div className="flex gap-3 flex-1 min-w-0">
                  <div
                    className={cn(
                      "mt-0.5 shrink-0 size-9 rounded-lg flex items-center justify-center border transition-colors",
                      notif.is_read
                        ? "bg-zinc-50 border-zinc-200"
                        : "bg-primary/5 border-primary/10 text-primary",
                    )}
                  >
                    {getIcon(notif.notification_type)}
                  </div>

                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-xs text-foreground/90 tracking-tight">
                        {notif.title}
                      </div>
                      {!notif.is_read && (
                        <Badge className="h-4 px-1.5 text-[8px] font-bold uppercase rounded-full bg-primary text-white border-none shrink-0">
                          New
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1 text-[11px] leading-relaxed max-w-3xl font-medium">
                      {notif.body}
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 mt-2 font-medium flex items-center gap-1.5 uppercase tracking-wide">
                      <Calendar className="size-3" />
                      {formatDistanceToNow(new Date(notif.created_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                </div>

                {/* Right side Actions */}
                <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                  {isAssessment && notif.action_url && (
                    <Button
                      asChild
                      size="sm"
                      className="h-7 px-3 rounded-lg text-[9px] font-bold uppercase tracking-wider shadow-none bg-primary hover:bg-primary/90 text-white"
                      onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                    >
                      <Link href={notif.action_url}>
                        <PlayCircle className="size-3 mr-1.5" />
                        Start
                      </Link>
                    </Button>
                  )}
                  {!isAssessment && notif.action_url && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-7 px-3 rounded-lg text-[9px] font-bold uppercase tracking-wider border-zinc-200 bg-white"
                      onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                    >
                      <Link href={notif.action_url}>
                        <Eye className="size-3 mr-1.5" />
                        View
                      </Link>
                    </Button>
                  )}
                  {!notif.is_read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-lg text-muted-foreground/45 hover:text-primary transition-colors"
                      onClick={() => handleMarkRead(notif.id)}
                      title="Mark as read"
                    >
                      <CheckCheck className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
