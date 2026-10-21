"use client";

import { useEffect, useState } from "react";
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
  Search,
  Filter,
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

  async function loadNotifications() {
    try {
      setLoading(true);
      const data = await notificationApi.getNotifications();
      setNotifications(data.items || []);
    } catch (err) {
      console.error("Failed to load notifications", err);
      toast.error("Failed to load notifications");
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
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark read", err);
    }
  };

  const getIconWrapper = (type: string) => {
    switch (type) {
      case "SYSTEM_ALERT":
        return (
          <div className="size-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Server className="size-5" />
          </div>
        );
      case "SECURITY_EVENT":
        return (
          <div className="size-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Shield className="size-5" />
          </div>
        );
      case "NEW_USER_REQUEST":
        return (
          <div className="size-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <UserPlus className="size-5" />
          </div>
        );
      case "POLICY_VIOLATION":
        return (
          <div className="size-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <AlertCircle className="size-5" />
          </div>
        );
      default:
        return (
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Bell className="size-5" />
          </div>
        );
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const securityCount = notifications.filter(
    (n) => n.notification_type === "SECURITY_EVENT" || n.notification_type === "POLICY_VIOLATION"
  ).length;

  const displayedNotifications =
    filterMode === "UNREAD"
      ? notifications.filter((n) => !n.is_read)
      : notifications;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Bell className="size-5" />
            </div>
            System Notifications
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Real-time event logging, security alerts, and administrative dispatches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadNotifications}
            disabled={loading}
            className="rounded-xl h-9 text-xs gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl h-9 text-xs gap-1.5"
            onClick={handleMarkAllRead}
            disabled={notifications.length === 0 || notifications.every((n) => n.is_read)}
          >
            <CheckCheck className="size-3.5 text-primary" /> Mark all read
          </Button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Logged Alerts",
            value: notifications.length,
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
            value: securityCount,
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
            className="border border-border/60 shadow-none rounded-2xl bg-card overflow-hidden p-5"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
                <h3 className="text-2xl font-bold tracking-tight">{stat.value}</h3>
              </div>
              <div className={cn("size-11 rounded-xl flex items-center justify-center shrink-0", stat.pill)}>
                <stat.icon className="size-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Notifications Card */}
      <Card className="border border-border/60 shadow-none rounded-2xl bg-card overflow-hidden">
        <CardHeader className="p-5 border-b bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Activity & Event Logs</CardTitle>
            <CardDescription className="text-xs">
              Review institutional events requiring administrative attention.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant={filterMode === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("ALL")}
              className="h-8 text-xs rounded-xl"
            >
              All Events ({notifications.length})
            </Button>
            <Button
              variant={filterMode === "UNREAD" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("UNREAD")}
              className="h-8 text-xs rounded-xl"
            >
              Unread ({unreadCount})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="p-5 rounded-2xl border border-border/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                </div>
              ))
            ) : displayedNotifications.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground space-y-2">
                <div className="size-12 rounded-full bg-muted/40 mx-auto flex items-center justify-center">
                  <Bell className="size-6 text-muted-foreground/60" />
                </div>
                <p className="font-semibold text-foreground text-sm">No notifications found.</p>
                <p className="text-xs text-muted-foreground">
                  {filterMode === "UNREAD"
                    ? "All notifications have been reviewed."
                    : "No system alerts have been recorded yet."}
                </p>
              </div>
            ) : (
              displayedNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    "flex gap-4 p-5 rounded-2xl border transition-all cursor-pointer items-start",
                    notif.is_read
                      ? "bg-card border-border/60 hover:bg-muted/20"
                      : "border-primary/40 bg-primary/[0.03] shadow-sm hover:bg-primary/[0.06]"
                  )}
                  onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                >
                  {getIconWrapper(notif.notification_type)}

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-sm text-foreground truncate">
                        {notif.title}
                      </h4>
                      {!notif.is_read && (
                        <Badge className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {notif.body}
                    </p>
                    <div className="text-[11px] text-muted-foreground/70 font-medium pt-1 flex items-center gap-2">
                      <span>{formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}</span>
                      <span>·</span>
                      <span className="uppercase tracking-wider font-mono text-[10px] text-muted-foreground/80">
                        {notif.notification_type.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
