// app/lecturer/notifications/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  Bell,
  Calendar,
  AlertTriangle,
  CheckCheck,
  FileText,
  Users,
  Inbox,
} from "lucide-react";
import { notificationApi, NotificationResponse } from "@/lib/api/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function LecturerNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "submissions" | "alerts">("all");

  async function loadNotifications() {
    try {
      const data = await notificationApi.getNotifications();
      setNotifications(data.items || []);
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
      case "NEW_SUBMISSION":
      case "SUBMISSION_RECEIVED":
        return <FileText className="size-4 text-blue-600 dark:text-blue-400" />;
      case "GRADING_REMINDER":
        return <Calendar className="size-4 text-amber-600 dark:text-amber-400" />;
      case "APPEAL_SUBMITTED":
      case "GROUP_APPEAL_REQUEST":
        return <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400" />;
      case "COURSE_UPDATE":
        return <Users className="size-4 text-emerald-600 dark:text-emerald-400" />;
      default:
        return <Bell className="size-4 text-primary" />;
    }
  };

  const filteredNotifications = notifications.filter((notif) => {
    if (filter === "unread") return !notif.is_read;
    if (filter === "submissions") {
      return ["NEW_SUBMISSION", "SUBMISSION_RECEIVED"].includes(notif.notification_type);
    }
    if (filter === "alerts") {
      return ["GRADING_REMINDER", "APPEAL_SUBMITTED", "GROUP_APPEAL_REQUEST", "COURSE_UPDATE"].includes(
        notif.notification_type,
      );
    }
    return true;
  });

  return (
    <div className="w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 space-y-4 sm:space-y-5 p-1 sm:p-2 lg:p-3 transition-all duration-300 font-sans pb-12">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Bell className="size-4.5 text-primary shrink-0" />
            Institutional Notifications
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-normal">
            Real-time telemetry, assessment submissions, and appeal alerts.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={notifications.length === 0 || notifications.every((n) => n.is_read)}
          className="h-8 px-3.5 rounded-xl text-xs font-semibold border-border/60 bg-card hover:bg-muted/50 text-foreground shadow-2xs gap-1.5"
        >
          <CheckCheck className="size-3.5 text-primary" /> Mark all read
        </Button>
      </div>

      {/* Tabs Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 border-b border-border/40 scrollbar-none">
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
            id: "submissions",
            label: "Student Submissions",
            count: notifications.filter((n) =>
              ["NEW_SUBMISSION", "SUBMISSION_RECEIVED"].includes(n.notification_type),
            ).length,
          },
          {
            id: "alerts",
            label: "Alerts & Appeals",
            count: notifications.filter((n) =>
              ["GRADING_REMINDER", "APPEAL_SUBMITTED", "GROUP_APPEAL_REQUEST", "COURSE_UPDATE"].includes(
                n.notification_type,
              ),
            ).length,
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id as any)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer",
              filter === t.id
                ? "border-primary/20 bg-primary/10 text-primary font-semibold shadow-2xs"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full text-[9px] font-semibold leading-none",
                  filter === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground border border-border/60",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Feed list container */}
      <div className="space-y-2.5">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex gap-4 p-4 border border-border/60 rounded-xl bg-card animate-pulse"
            >
              <Skeleton className="size-9 rounded-lg" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3 rounded" />
                <Skeleton className="h-3 w-5/6 rounded" />
              </div>
            </div>
          ))
        ) : filteredNotifications.length === 0 ? (
          <div className="py-16 text-center bg-card/60 border border-dashed border-border/60 rounded-2xl">
            <Inbox className="mx-auto size-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              No notifications in this category
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => !notif.is_read && handleMarkRead(notif.id)}
              className={cn(
                "group relative flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 sm:p-4 border rounded-xl bg-card transition-all duration-200 cursor-pointer text-left shadow-2xs",
                notif.is_read
                  ? "border-border/40 opacity-80 hover:border-border hover:opacity-100"
                  : "border-primary/30 bg-primary/[0.02] hover:border-primary/50",
              )}
            >
              <div className="flex gap-3 flex-1 min-w-0">
                <div
                  className={cn(
                    "mt-0.5 shrink-0 size-8.5 rounded-lg flex items-center justify-center border transition-colors",
                    notif.is_read
                      ? "bg-muted/40 border-border/60"
                      : "bg-primary/10 border-primary/20 text-primary",
                  )}
                >
                  {getIcon(notif.notification_type)}
                </div>

                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                    {notif.title}
                    {!notif.is_read && (
                      <span className="size-2 rounded-full bg-emerald-500 shrink-0 inline-block" />
                    )}
                  </div>
                  <p className="text-xs font-normal text-muted-foreground mt-0.5 leading-normal">
                    {notif.body}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
                <div className="text-[10px] font-medium text-muted-foreground">
                  {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
