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
      case "NEW_SUBMISSION":
      case "SUBMISSION_RECEIVED":
        return <FileText className="size-4.5 text-blue-600" />;
      case "GRADING_REMINDER":
        return <Calendar className="size-4.5 text-amber-600" />;
      case "APPEAL_SUBMITTED":
      case "GROUP_APPEAL_REQUEST":
        return <AlertTriangle className="size-4.5 text-red-600" />;
      case "COURSE_UPDATE":
        return <Users className="size-4.5 text-emerald-600" />;
      default:
        return <Bell className="size-4.5 text-muted-foreground" />;
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
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <Bell className="size-5 text-primary shrink-0" /> Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
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

      {/* Feed list container */}
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
            <Inbox className="mx-auto size-8 text-muted-foreground/20 mb-3" />
            <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
              Transmission Feed Empty
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => !notif.is_read && handleMarkRead(notif.id)}
              className={cn(
                "group relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border rounded-xl bg-white/70 hover:bg-white shadow-sm transition-all duration-200 cursor-pointer text-left",
                notif.is_read
                  ? "border-zinc-200/50 opacity-75"
                  : "border-primary/25 bg-white",
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

                <div className="min-w-0">
                  <div className="text-xs font-bold text-zinc-950 flex items-center gap-2">
                    {notif.title}
                    {!notif.is_read && (
                      <Badge className="bg-primary hover:bg-primary text-white text-[8px] font-bold leading-none h-4 px-1.5 rounded">
                        NEW
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-muted-foreground mt-1 leading-normal">
                    {notif.body}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100">
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
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
