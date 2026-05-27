// app/student/notifications/page.tsx
"use client"

import React, { useEffect, useState } from "react"
import {
  Bell,
  Calendar,
  Award,
  AlertTriangle,
  CheckCheck,
  RefreshCcw,
  Eye,
  PlayCircle,
} from "lucide-react";
import Link from "next/link";
import { notificationApi, NotificationResponse } from "@/lib/api/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

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
        return <Award className="size-5 text-emerald-600" />;
      case "DEADLINE_EXTENDED":
        return <Calendar className="size-5 text-amber-600" />;
      case "ASSESSMENT_PUBLISHED":
      case "GROUP_WORK_ASSIGNED":
        return <Bell className="size-5 text-blue-600" />;
      case "APPEAL_DECISION":
      case "APPEAL_RESOLVED":
        return <AlertTriangle className="size-5 text-violet-600" />;
      case "GROUP_APPROVAL_REQUEST":
      case "GROUP_APPEAL_REQUEST":
        return <CheckCheck className="size-5 text-primary" />;
      case "GROUP_REASSESSMENT_ASSIGNED":
        return <RefreshCcw className="size-5 text-amber-600" />;
      default:
        return <Bell className="size-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 pb-12">
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2.5">
            <Bell className="size-5 text-primary" /> Notifications
          </h1>
          <p className="text-muted-foreground text-[9px] font-semibold uppercase tracking-widest mt-0.5">
            Academic Ledger • Real-time Monitoring Active
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={notifications.every((n) => n.is_read)}
          className="h-8 px-4 rounded-lg text-[10px] font-semibold uppercase tracking-tight"
        >
          <CheckCheck className="mr-1.5 size-3" /> Mark all read
        </Button>
      </div>

      <Card className="shadow-none border rounded-xl overflow-hidden">
        <CardHeader className="bg-muted/5 border-b py-3 px-5">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Registry Feed
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-muted/10">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="p-5">
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ))
            ) : notifications.length === 0 ? (
              <div className="py-20 text-center bg-muted/5">
                <Bell className="mx-auto size-10 text-muted-foreground/10 mb-4" />
                <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">
                  Transmission Archive Empty
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isAssessment = [
                  "ASSESSMENT_PUBLISHED",
                  "GROUP_WORK_ASSIGNED",
                  "GROUP_REASSESSMENT_ASSIGNED",
                ].includes(notif.notification_type);

                return (
                  <div
                    key={notif.id}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center gap-5 p-5 transition-all group",
                      notif.is_read
                        ? "bg-transparent opacity-70"
                        : "bg-primary/[0.02] hover:bg-primary/[0.04]",
                    )}
                  >
                    <div className="flex gap-4 flex-1 min-w-0">
                      <div
                        className={cn(
                          "mt-0.5 shrink-0 size-10 rounded-xl flex items-center justify-center border transition-colors",
                          notif.is_read
                            ? "bg-muted/50 border-muted-foreground/10"
                            : "bg-background border-primary/10 shadow-sm group-hover:border-primary/20",
                        )}
                      >
                        {getIcon(notif.notification_type)}
                      </div>

                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-sm text-foreground/90 tracking-tight">
                            {notif.title}
                          </div>
                          {!notif.is_read && (
                            <Badge className="h-4 px-1.5 text-[8px] font-bold uppercase rounded-full bg-primary text-white border-none">
                              New
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-1 text-[13px] leading-relaxed line-clamp-2">
                          {notif.body}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 mt-2.5 font-medium flex items-center gap-2 uppercase tracking-tight">
                          <Calendar className="size-2.5" />
                          {formatDistanceToNow(new Date(notif.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:ml-4">
                      {isAssessment && notif.action_url && (
                        <Button
                          asChild
                          size="sm"
                          className="h-9 px-5 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-none bg-primary hover:bg-primary/90"
                          onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                        >
                          <Link href={notif.action_url}>
                            <PlayCircle className="size-3.5 mr-2" />
                            Start Assessment
                          </Link>
                        </Button>
                      )}
                      {!isAssessment && notif.action_url && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-9 px-5 rounded-lg text-[10px] font-bold uppercase tracking-wider border-muted-foreground/20"
                          onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                        >
                          <Link href={notif.action_url}>
                            <Eye className="size-3.5 mr-2" />
                            View More
                          </Link>
                        </Button>
                      )}
                      {!notif.is_read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 rounded-full text-muted-foreground/40 hover:text-primary transition-colors"
                          onClick={() => handleMarkRead(notif.id)}
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
        </CardContent>
      </Card>
    </div>
  );
}
