"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  MessageSquare,
  ShieldAlert,
  AlertTriangle,
  Info,
  Download,
  Settings,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NotificationMenuItem = {
  id: string | number;
  type: string;
  user?: {
    name: string;
    avatar?: string;
    fallback: string;
  };
  title?: string;
  action?: string;
  target?: string;
  content?: string;
  body?: string;
  timestamp?: string;
  timeAgo?: string;
  isRead: boolean;
  hasActions?: boolean;
  actionUrl?: string;
  file?: {
    name: string;
    size: string;
    type: string;
  };
};

// Default dummy data from 21st dev
const defaultNotifications: NotificationMenuItem[] = [
  {
    id: 1,
    type: "comment",
    user: {
      name: "Amélie",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
      fallback: "A",
    },
    action: "commented in",
    target: "Dashboard 2.0",
    content: "Really love this approach. I think this is the best solution for the document sync UX issue.",
    timestamp: "Friday 3:12 PM",
    timeAgo: "2 hours ago",
    isRead: false,
  },
  {
    id: 2,
    type: "follow",
    user: {
      name: "Sienna",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80",
      fallback: "S",
    },
    action: "followed you",
    timestamp: "Friday 3:04 PM",
    timeAgo: "2 hours ago",
    isRead: false,
  },
  {
    id: 3,
    type: "invitation",
    user: {
      name: "Ammar",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      fallback: "A",
    },
    action: "invited you to",
    target: "Blog design",
    timestamp: "Friday 2:22 PM",
    timeAgo: "3 hours ago",
    isRead: true,
    hasActions: true,
  },
  {
    id: 4,
    type: "file_share",
    user: {
      name: "Mathilde",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      fallback: "M",
    },
    action: "shared a file in",
    target: "Dashboard 2.0",
    file: {
      name: "Prototype recording 01.mp4",
      size: "14 MB",
      type: "MP4",
    },
    timestamp: "Friday 1:40 PM",
    timeAgo: "4 hours ago",
    isRead: true,
  },
  {
    id: 5,
    type: "mention",
    user: {
      name: "James",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
      fallback: "J",
    },
    action: "mentioned you in",
    target: "Project Alpha",
    content: "Hey @you, can you review the latest designs when you get a chance?",
    timestamp: "Thursday 11:30 AM",
    timeAgo: "1 day ago",
    isRead: true,
  },
  {
    id: 6,
    type: "like",
    user: {
      name: "Sofia",
      avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
      fallback: "S",
    },
    action: "liked your comment in",
    target: "Team Meeting Notes",
    timestamp: "Thursday 9:15 AM",
    timeAgo: "1 day ago",
    isRead: true,
  },
];

const getNotificationBadgeColor = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("result") || t.includes("grade")) return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (t.includes("alert") || t.includes("warning") || t.includes("integrity")) return "bg-destructive/10 text-destructive border-destructive/20";
  if (t.includes("reminder") || t.includes("schedule")) return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-primary/10 text-primary border-primary/20";
};

const getNotificationIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("result") || t.includes("grade")) return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (t.includes("alert") || t.includes("warning") || t.includes("integrity")) return <ShieldAlert className="size-4 text-destructive" />;
  if (t.includes("reminder") || t.includes("schedule")) return <Clock className="size-4 text-amber-600" />;
  if (t.includes("feedback") || t.includes("comment") || t.includes("mention")) return <MessageSquare className="size-4 text-primary" />;
  return <Bell className="size-4 text-muted-foreground" />;
};

export interface NotificationItemProps {
  notification: NotificationMenuItem;
  onMarkRead?: (id: string | number) => void;
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const displayTitle = notification.title || notification.user?.name || "Notification";
  const displayAction = notification.action || "";
  const displayTarget = notification.target || "";
  const displayContent = notification.content || notification.body;

  const contentElement = (
    <div className="flex gap-3 sm:gap-3.5">
      {notification.user?.avatar ? (
        <Avatar className="size-9 sm:size-10 shrink-0 ring-1 ring-border/60">
          <AvatarImage
            src={notification.user.avatar}
            alt={notification.user.name}
            className="object-cover"
          />
          <AvatarFallback className="text-xs font-semibold bg-muted">
            {notification.user.fallback || "U"}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div
          className={cn(
            "size-9 sm:size-10 rounded-full flex items-center justify-center shrink-0 border",
            getNotificationBadgeColor(notification.type)
          )}
        >
          {getNotificationIcon(notification.type)}
        </div>
      )}

      <div className="flex flex-1 flex-col space-y-1.5 min-w-0">
        <div className="w-full">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs sm:text-sm font-medium leading-snug">
              <span className="font-semibold text-foreground">{displayTitle}</span>
              {displayAction && (
                <span className="text-muted-foreground font-normal"> {displayAction} </span>
              )}
              {displayTarget && (
                <span className="font-semibold text-foreground"> {displayTarget}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
              {!notification.isRead && (
                <span
                  className="size-2 rounded-full bg-primary ring-2 ring-background animate-pulse shrink-0"
                  title="Unread"
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5 text-[11px] text-muted-foreground">
            <span>{notification.timeAgo || notification.timestamp}</span>
            {notification.timestamp && notification.timeAgo && (
              <span className="text-muted-foreground/60 hidden sm:inline">{notification.timestamp}</span>
            )}
          </div>
        </div>

        {displayContent && (
          <div className="rounded-lg bg-muted/50 p-2 sm:p-2.5 text-xs text-foreground/90 leading-relaxed border border-border/30">
            {displayContent}
          </div>
        )}

        {notification.file && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-2 border border-border/40">
            <div className="size-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileText className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate text-foreground">
                {notification.file.name}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase font-medium">
                {notification.file.type} • {notification.file.size}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
              <Download className="size-3.5" />
            </Button>
          </div>
        )}

        {notification.hasActions && (
          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-6.5 text-[11px] px-2.5 rounded-md">
              Decline
            </Button>
            <Button size="sm" className="h-6.5 text-[11px] px-2.5 rounded-md">
              Accept
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "w-full p-3 sm:p-4 rounded-xl transition-all duration-150 hover:bg-muted/40",
        !notification.isRead && "bg-primary/[0.02]"
      )}
      onClick={() => onMarkRead?.(notification.id)}
    >
      {notification.actionUrl ? (
        <Link href={notification.actionUrl} className="block group">
          {contentElement}
        </Link>
      ) : (
        contentElement
      )}
    </div>
  );
}

export interface NotificationsMenuProps {
  notifications?: NotificationMenuItem[];
  title?: string;
  onMarkAllAsRead?: () => void;
  onMarkAsRead?: (id: string | number) => void;
  viewAllHref?: string;
  className?: string;
}

export function NotificationsMenu({
  notifications = defaultNotifications,
  title = "Notifications",
  onMarkAllAsRead,
  onMarkAsRead,
  viewAllHref = "/student/notifications",
  className,
}: NotificationsMenuProps) {
  const [activeTab, setActiveTab] = useState<string>("all");

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const alertCount = notifications.filter((n) => {
    const t = n.type.toLowerCase();
    return t.includes("alert") || t.includes("warning") || t.includes("integrity") || t.includes("mention");
  }).length;

  const getFilteredNotifications = () => {
    switch (activeTab) {
      case "unread":
        return notifications.filter((n) => !n.isRead);
      case "alerts":
        return notifications.filter((n) => {
          const t = n.type.toLowerCase();
          return t.includes("alert") || t.includes("warning") || t.includes("integrity") || t.includes("mention");
        });
      default:
        return notifications;
    }
  };

  const filtered = getFilteredNotifications();

  return (
    <Card className={cn("rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden", className)}>
      <CardHeader className="p-3.5 sm:p-4 pb-3 border-b border-border/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Bell className="size-3.5" />
            </div>
            <h3 className="text-xs sm:text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-primary/10 text-primary border-primary/20">
                {unreadCount} new
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            {onMarkAllAsRead && unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onMarkAllAsRead}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                title="Mark all as read"
              >
                <CheckCheck className="size-3.5" />
                <span className="hidden sm:inline">Mark read</span>
              </Button>
            )}
            {viewAllHref && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-primary hover:text-primary gap-1 font-medium"
                asChild
              >
                <Link href={viewAllHref}>
                  <span>View all</span>
                  <ArrowRight className="size-3" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Tab Filters */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="w-full grid grid-cols-3 h-8 p-0.5 bg-muted/50 rounded-lg">
            <TabsTrigger
              value="all"
              className="text-xs py-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs rounded-md font-medium"
            >
              All
              <Badge variant="secondary" className="ml-1 text-[9px] h-4 px-1 font-bold">
                {notifications.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="unread"
              className="text-xs py-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs rounded-md font-medium"
            >
              Unread
              <Badge variant="secondary" className="ml-1 text-[9px] h-4 px-1 font-bold">
                {unreadCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="alerts"
              className="text-xs py-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs rounded-md font-medium"
            >
              Alerts
              <Badge variant="secondary" className="ml-1 text-[9px] h-4 px-1 font-bold">
                {alertCount}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="p-2 sm:p-3">
        <div className="space-y-1 divide-y divide-border/30">
          {filtered.length > 0 ? (
            filtered.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={onMarkAsRead}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full bg-muted/60 p-3 mb-2 border border-border/40">
                <Bell className="size-5 text-muted-foreground/60" />
              </div>
              <p className="text-xs font-semibold text-foreground">
                No notifications to display
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {activeTab === "unread"
                  ? "You have caught up with all unread updates."
                  : activeTab === "alerts"
                  ? "No critical alerts at this time."
                  : "New academic notices and results will appear here."}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const Component = NotificationsMenu;
