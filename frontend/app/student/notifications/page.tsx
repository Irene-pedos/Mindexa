// app/student/notifications/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Bell,
  Calendar,
  Award,
  AlertTriangle,
  CheckCheck,
  Eye,
  PlayCircle,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
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
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "assessments" | "alerts">("all");
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

        // Keep unread count fresh
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
      case "RESULT_RELEASED":
      case "GROUP_RESULT_RELEASED":
        return <Award className="size-4 text-emerald-600 dark:text-emerald-400" />;
      case "DEADLINE_EXTENDED":
        return <Calendar className="size-4 text-amber-600 dark:text-amber-400" />;
      case "ASSESSMENT_PUBLISHED":
      case "ASSESSMENT_AVAILABLE":
      case "GROUP_WORK_ASSIGNED":
        return <Bell className="size-4 text-blue-600 dark:text-blue-400" />;
      case "APPEAL_DECISION":
      case "APPEAL_RESOLVED":
        return <AlertTriangle className="size-4 text-violet-600 dark:text-violet-400" />;
      case "GROUP_APPROVAL_REQUEST":
      case "GROUP_APPEAL_REQUEST":
        return <CheckCheck className="size-4 text-primary" />;
      case "GROUP_REASSESSMENT_ASSIGNED":
        return <RefreshCcw className="size-4 text-amber-600 dark:text-amber-400" />;
      default:
        return <Bell className="size-4 text-muted-foreground" />;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4 w-full mx-auto animate-in fade-in duration-300 pb-10">
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bell className="size-4" />
            </div>
            <span>Notifications & Activity Stream</span>
          </h1>
          <p className="text-[11px] text-muted-foreground font-medium">
            Registry Feed • Real-time Monitoring Active
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
            id: "assessments",
            label: "Assessments & Grades",
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
                  "px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none",
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

      {/* Registry Feed list container */}
      <div className="space-y-2">
        {loading && notifications.length === 0 ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex gap-3 p-3 sm:p-3.5 border border-border/60 rounded-xl bg-card animate-pulse"
            >
              <Skeleton className="size-8 rounded-lg" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3.5 w-1/3 rounded-md" />
                <Skeleton className="h-3 w-5/6 rounded-md" />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <div className="py-14 text-center bg-card/50 border border-dashed border-border/60 rounded-xl">
            <div className="size-10 rounded-full bg-muted/60 mx-auto flex items-center justify-center mb-2.5 text-muted-foreground/50 border border-border/40">
              <Bell className="size-5" />
            </div>
            <p className="text-xs font-semibold text-foreground">
              Transmission Feed Empty
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {filter === "unread"
                ? "You have caught up with all notifications."
                : "No notifications found in this category."}
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const isAssessment = [
              "ASSESSMENT_PUBLISHED",
              "ASSESSMENT_AVAILABLE",
              "GROUP_WORK_ASSIGNED",
              "GROUP_REASSESSMENT_ASSIGNED",
            ].includes(notif.notification_type);

            return (
              <div
                key={notif.id}
                className={cn(
                  "group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 border rounded-xl transition-all duration-200 shadow-2xs",
                  notif.is_read
                    ? "bg-card border-border/50 opacity-85 hover:opacity-100 hover:border-border hover:bg-muted/20"
                    : "bg-primary/[0.03] dark:bg-primary/[0.07] border-primary/30 dark:border-primary/40 hover:border-primary/60 shadow-xs",
                )}
              >
                <div className="flex gap-2.5 sm:gap-3 flex-1 min-w-0">
                  <div
                    className={cn(
                      "mt-0.5 shrink-0 size-7.5 sm:size-8 rounded-lg flex items-center justify-center border transition-colors",
                      notif.is_read
                        ? "bg-muted/40 border-border/60 text-muted-foreground"
                        : "bg-primary/10 border-primary/20 text-primary",
                    )}
                  >
                    {getIcon(notif.notification_type)}
                  </div>

                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                  >
                    <div className="flex items-center gap-1.5">
                      <h3
                        className={cn(
                          "text-xs font-semibold tracking-tight break-words",
                          notif.is_read
                            ? "text-foreground/80 font-medium"
                            : "text-foreground",
                        )}
                      >
                        {notif.title}
                      </h3>
                      {!notif.is_read && (
                        <Badge className="h-3.5 px-1.5 text-[8px] font-bold uppercase rounded-full bg-primary text-primary-foreground border-none shrink-0">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px] sm:text-xs leading-relaxed max-w-3xl font-normal break-words">
                      {notif.body}
                    </p>
                    <div className="text-[9px] text-muted-foreground/70 mt-1.5 font-medium flex items-center gap-1 uppercase tracking-wide">
                      <Calendar className="size-3" />
                      {formatDistanceToNow(new Date(notif.created_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                </div>

                {/* Right side Actions */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  {isAssessment && notif.action_url && (
                    <Button
                      asChild
                      size="sm"
                      className="h-7 px-2.5 rounded-lg text-[9px] font-bold uppercase tracking-wider shadow-none bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                    >
                      <Link href={notif.action_url}>
                        <PlayCircle className="size-3 mr-1" />
                        Start
                      </Link>
                    </Button>
                  )}
                  {!isAssessment && notif.action_url && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border-border/60 bg-background hover:bg-muted text-foreground"
                      onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                    >
                      <Link href={notif.action_url}>
                        <Eye className="size-3 mr-1" />
                        View
                      </Link>
                    </Button>
                  )}
                  {!notif.is_read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      onClick={() => handleMarkRead(notif.id)}
                      title="Mark as read"
                    >
                      <CheckCheck className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
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
