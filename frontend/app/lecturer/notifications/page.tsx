// app/lecturer/notifications/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Bell,
  Calendar,
  AlertTriangle,
  CheckCheck,
  FileText,
  Users,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { notificationApi, NotificationResponse } from "@/lib/api/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function LecturerNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "submissions" | "alerts">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(
    async (targetPage = page, targetFilter = filter, targetPageSize = pageSize) => {
      try {
        setLoading(true);
        const unreadOnly = targetFilter === "unread";
        const category =
          targetFilter !== "all" && targetFilter !== "unread"
            ? targetFilter
            : undefined;

        const data = await notificationApi.getNotifications(
          unreadOnly,
          targetPage,
          targetPageSize,
          category,
        );
        setNotifications(data.items || []);
        setTotal(data.total || 0);

        if (targetFilter === "unread") {
          setUnreadCount(data.total || 0);
        } else {
          const unreadData = await notificationApi.getNotifications(true, 1, 1);
          setUnreadCount(unreadData.total || 0);
        }
      } catch (err) {
        console.error("Failed to load notifications", err);
        toast.error("Failed to load notifications");
      } finally {
        setLoading(false);
      }
    },
    [page, filter, pageSize],
  );

  useEffect(() => {
    loadNotifications(page, filter, pageSize);
  }, [loadNotifications, page, filter, pageSize]);

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1);
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      toast.success("All notifications marked as read");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      loadNotifications(page, filter, pageSize);
    } catch {
      toast.error("Failed to mark all as read");
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
      console.error("Failed to mark read", err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "NEW_SUBMISSION":
      case "SUBMISSION_RECEIVED":
        return <FileText className="size-3.5 text-blue-600 dark:text-blue-400" />;
      case "GRADING_REMINDER":
      case "GRADING_REQUIRED":
        return <Calendar className="size-3.5 text-amber-600 dark:text-amber-400" />;
      case "APPEAL_SUBMITTED":
      case "GROUP_APPEAL_REQUEST":
        return <AlertTriangle className="size-3.5 text-rose-600 dark:text-rose-400" />;
      case "COURSE_UPDATE":
        return <Users className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
      default:
        return <Bell className="size-3.5 text-primary" />;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 space-y-4 p-1 sm:p-2 lg:p-3 transition-all duration-300 font-sans pb-10">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bell className="size-3.5 text-primary" />
            </div>
            Institutional Notifications
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-normal">
            Real-time telemetry, assessment submissions, and appeal alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground mr-1" />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={notifications.length === 0 || unreadCount === 0}
            className="h-7.5 px-3 rounded-lg text-xs font-medium border-border/60 bg-card hover:bg-muted/50 text-foreground shadow-2xs gap-1.5 cursor-pointer"
          >
            <CheckCheck className="size-3.5 text-primary" /> Mark all read
          </Button>
        </div>
      </div>

      {/* Tabs Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 border-b border-border/40 scrollbar-none">
        {[
          {
            id: "all",
            label: "All Notifications",
          },
          {
            id: "unread",
            label: "Unread",
            count: unreadCount,
          },
          {
            id: "submissions",
            label: "Student Submissions",
          },
          {
            id: "alerts",
            label: "Alerts & Appeals",
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => handleFilterChange(t.id as any)}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer",
              filter === t.id
                ? "border-primary/20 bg-primary/10 text-primary font-semibold shadow-2xs"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
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
      <div className="space-y-2">
        {loading && notifications.length === 0 ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex gap-3 p-3 border border-border/60 rounded-xl bg-card animate-pulse"
            >
              <Skeleton className="size-8 rounded-lg" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3.5 w-1/3 rounded" />
                <Skeleton className="h-3 w-5/6 rounded" />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <div className="py-14 text-center bg-card/60 border border-dashed border-border/60 rounded-xl">
            <Inbox className="mx-auto size-7 text-muted-foreground/30 mb-2" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {filter === "unread"
                ? "No unread notifications"
                : "No notifications in this category"}
            </p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => !notif.is_read && handleMarkRead(notif.id)}
              className={cn(
                "group relative flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-3 border rounded-xl bg-card transition-all duration-200 cursor-pointer text-left shadow-2xs",
                notif.is_read
                  ? "border-border/40 opacity-80 hover:border-border hover:opacity-100"
                  : "border-primary/30 bg-primary/[0.02] dark:bg-primary/[0.05] hover:border-primary/50",
              )}
            >
              <div className="flex gap-2.5 sm:gap-3 flex-1 min-w-0">
                <div
                  className={cn(
                    "mt-0.5 shrink-0 size-7.5 rounded-lg flex items-center justify-center border transition-colors",
                    notif.is_read
                      ? "bg-muted/40 border-border/60"
                      : "bg-primary/10 border-primary/20 text-primary",
                  )}
                >
                  {getIcon(notif.notification_type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="break-words">{notif.title}</span>
                    {!notif.is_read && (
                      <span className="size-1.5 rounded-full bg-emerald-500 shrink-0 inline-block" />
                    )}
                  </div>
                  <p className="text-[11px] sm:text-xs font-normal text-muted-foreground mt-0.5 leading-relaxed break-words">
                    {notif.body}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-border/40">
                <div className="text-[9px] font-medium text-muted-foreground">
                  {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Bar */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              Showing {Math.min((page - 1) * pageSize + 1, total)}–
              {Math.min(page * pageSize, total)} of {total} notifications
            </span>
            <span className="hidden sm:inline">•</span>
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-[11px]">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="h-7 text-xs rounded-lg border border-border/60 bg-card text-foreground px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-lg border-border/60 bg-card hover:bg-muted text-foreground cursor-pointer"
              aria-label="Previous page"
              disabled={page <= 1 || loading}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 font-medium tabular-nums text-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-lg border-border/60 bg-card hover:bg-muted text-foreground cursor-pointer"
              aria-label="Next page"
              disabled={page >= totalPages || loading}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
