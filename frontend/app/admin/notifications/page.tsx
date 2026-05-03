// app/admin/notifications/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bell, Shield, Server, AlertCircle, CheckCheck, UserPlus } from "lucide-react"
import { notificationApi, NotificationResponse } from "@/lib/api/notification"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([])
  const [loading, setLoading] = useState(true)

  async function loadNotifications() {
    try {
      const data = await notificationApi.getNotifications()
      setNotifications(data.items)
    } catch (err) {
      console.error("Failed to load notifications", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead()
      toast.success("All notifications marked as read")
      loadNotifications()
    } catch (err) {
      toast.error("Failed to mark all as read")
    }
  }

  const handleMarkRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch (err) {
      console.error("Failed to mark read", err)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "SYSTEM_ALERT": return <Server className="size-6 text-red-600" />
      case "SECURITY_EVENT": return <Shield className="size-6 text-amber-600" />
      case "NEW_USER_REQUEST": return <UserPlus className="size-6 text-blue-600" />
      case "POLICY_VIOLATION": return <AlertCircle className="size-6 text-orange-600" />
      default: return <Bell className="size-6 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <Bell className="size-8" /> System Notifications
          </h1>
          <p className="text-muted-foreground mt-1">Monitor system events and administrative alerts</p>
        </div>
        <Button variant="outline" onClick={handleMarkAllRead} disabled={notifications.every(n => n.is_read)}>
          <CheckCheck className="mr-2 size-4" /> Mark all as read
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin Logs & Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {loading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)
            ) : notifications.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">
                <Bell className="mx-auto size-12 opacity-20 mb-4" />
                <p>No system notifications yet.</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div 
                  key={notif.id} 
                  className={`flex gap-5 p-5 rounded-2xl border transition-all cursor-pointer hover:shadow-sm ${notif.is_read ? "bg-muted/30" : "border-primary/30 bg-primary/5 shadow-sm"}`}
                  onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                >
                  <div className="mt-1">
                    {getIcon(notif.notification_type)}
                  </div>

                  <div className="flex-1">
                    <div className="font-semibold">{notif.title}</div>
                    <div className="text-muted-foreground mt-1 text-sm">{notif.body}</div>
                    <div className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
                       {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                    </div>
                  </div>

                  {!notif.is_read && (
                    <Badge className="self-start bg-primary text-primary-foreground">New</Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
