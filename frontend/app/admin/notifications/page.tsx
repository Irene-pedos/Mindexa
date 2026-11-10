// app/admin/notifications/page.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Shield,
  Server,
  AlertCircle,
  CheckCheck,
  UserPlus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { notificationApi, NotificationResponse } from "@/lib/api/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<"ALL" | "UNREAD">("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(
    async (targetPage = page, targetFilter = filterMode, targetPageSize = pageSize) => {
      try {
        setLoading(true);
        const unreadOnly = targetFilter === "UNREAD";
        const data = await notificationApi.getNotifications(
          unreadOnly,
          targetPage,
          targetPageSize,
        );
        setNotifications(data.items || []);
        setTotal(data.total || 0);

        if (targetFilter === "UNREAD") {
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
    [page, filterMode, pageSize],
  );

  useEffect(() => {
    loadNotifications(page, filterMode, pageSize);
  }, [loadNotifications, page, filterMode, pageSize]);

  const handleFilterChange = (mode: "ALL" | "UNREAD") => {
    setFilterMode(mode);
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
      loadNotifications(page, filterMode, pageSize);
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

  const getIconWrapper = (type: string) => {
    switch (type) {
      case "SYSTEM_ALERT":
        return (
          <div className="size-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Server className="size-4" />
          </div>
        );
      case "SECURITY_EVENT":
        return (
          <div className="size-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Shield className="size-4" />
          </div>
        );
      case "NEW_USER_REQUEST":
        return (
          <div className="size-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <UserPlus className="size-4" />
          </div>
        );
      case "POLICY_VIOLATION":
        return (
          <div className="size-8 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <AlertCircle className="size-4" />
          </div>
        );
      default:
        return (
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Bell className="size-4" />
          </div>
        );
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
            <div className="size-7.5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bell className="size-4" />
            </div>
            <span>System Notifications</span>
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">
            Real-time event logging, security alerts, and administrative dispatches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadNotifications(page, filterMode, pageSize)}
            disabled={loading}
            className="rounded-lg h-8 text-xs gap-1.5 border-border/60 bg-card hover:bg-muted text-foreground cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg h-8 text-xs gap-1.5 border-border/60 bg-card hover:bg-muted text-foreground cursor-pointer"
            onClick={handleMarkAllRead}
            disabled={notifications.length === 0 || unreadCount === 0}
          >
            <CheckCheck className="size-3.5 text-primary" /> Mark all read
          </Button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          {
            label: "Total Logged Alerts",
            value: filterMode === "ALL" ? total : "—",
            icon: Bell,
            pill: "bg-primary/10 text-primary",
          },
          {
            label: "Unread Dispatches",
            value: unreadCount,
            icon: AlertCircle,
            pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          },
          {
            label: "Security & Policy",
            value: notifications.filter(
              (n) => n.notification_type === "SECURITY_EVENT" || n.notification_type === "POLICY_VIOLATION"
            ).length,
            icon: Shield,
            pill: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
          },
          {
            label: "Daemon Health",
            value: "Operational",
            icon: Server,
            pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className="border border-border/60 shadow-none rounded-xl bg-card overflow-hidden p-3.5"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight">{stat.value}</h3>
              </div>
              <div className={cn("size-8.5 rounded-lg flex items-center justify-center shrink-0", stat.pill)}>
                <stat.icon className="size-4" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Notifications Card */}
      <Card className="border border-border/60 shadow-none rounded-xl bg-card overflow-hidden">
        <CardHeader className="p-3.5 sm:p-4 border-b border-border/40 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm sm:text-base font-semibold">Activity & Event Logs</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Review institutional events requiring administrative attention.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant={filterMode === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilterChange("ALL")}
              className="h-7.5 text-xs rounded-lg cursor-pointer"
            >
              All Events {filterMode === "ALL" && `(${total})`}
            </Button>
            <Button
              variant={filterMode === "UNREAD" ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilterChange("UNREAD")}
              className="h-7.5 text-xs rounded-lg cursor-pointer"
            >
              Unread ({unreadCount})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3.5 sm:p-4 space-y-3">
          <div className="space-y-2">
            {loading && notifications.length === 0 ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="p-3.5 rounded-xl border border-border/60 bg-card space-y-2 animate-pulse">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3.5 w-40 rounded-md" />
                    <Skeleton className="h-3.5 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full rounded-md" />
                </div>
              ))
            ) : notifications.length === 0 ? (
              <div className="py-14 text-center text-muted-foreground space-y-2">
                <div className="size-10 rounded-full bg-muted/40 mx-auto flex items-center justify-center border border-border/40">
                  <Bell className="size-5 text-muted-foreground/60" />
                </div>
                <p className="font-semibold text-foreground text-xs sm:text-sm">No notifications found.</p>
                <p className="text-[11px] text-muted-foreground">
                  {filterMode === "UNREAD"
                    ? "All notifications have been reviewed."
                    : "No system alerts have been recorded yet."}
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    "flex gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer items-start shadow-2xs",
                    notif.is_read
                      ? "bg-card border-border/50 hover:bg-muted/20 hover:border-border opacity-85 hover:opacity-100"
                      : "border-primary/40 bg-primary/[0.03] dark:bg-primary/[0.06] shadow-sm hover:bg-primary/[0.06]"
                  )}
                  onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                >
                  {getIconWrapper(notif.notification_type)}

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-xs sm:text-xs text-foreground break-words">
                        {notif.title}
                      </h4>
                      {!notif.is_read && (
                        <Badge className="bg-primary text-primary-foreground text-[8px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed break-words">
                      {notif.body}
                    </p>
                    <div className="text-[9px] text-muted-foreground/70 font-medium pt-0.5 flex items-center gap-1.5">
                      <span>{formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}</span>
                      <span>·</span>
                      <span className="uppercase tracking-wider font-mono text-[9px] text-muted-foreground/80">
                        {notif.notification_type.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination Bar */}
          {total > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-border/40 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>
                  Showing {Math.min((page - 1) * pageSize + 1, total)}–
                  {Math.min(page * pageSize, total)} of {total} events
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
        </CardContent>
      </Card>
    </div>
  );
}
