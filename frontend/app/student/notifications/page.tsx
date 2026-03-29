// app/(student)/notifications/page.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bell, Calendar, Award, AlertTriangle } from "lucide-react"

const notifications = [
  {
    id: 1,
    type: "result",
    title: "Database Systems CAT Result Released",
    message: "You scored 92% (A-). Detailed feedback is now available.",
    time: "2 hours ago",
    read: false,
  },
  {
    id: 2,
    type: "deadline",
    title: "Group Project Deadline Extended",
    message: "Submission window extended by 24 hours due to technical issues.",
    time: "Yesterday",
    read: true,
  },
  {
    id: 3,
    type: "assessment",
    title: "New Formative Quiz Available",
    message: "Algorithms formative quiz is now open until April 2.",
    time: "Mar 26",
    read: false,
  },
  {
    id: 4,
    type: "appeal",
    title: "Appeal Decision",
    message: "Your appeal for Operating Systems exam has been approved.",
    time: "Mar 25",
    read: true,
  },
]

export default function NotificationsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <Bell className="size-8" /> Notifications
          </h1>
          <p className="text-muted-foreground mt-1">Stay updated with all academic activities</p>
        </div>
        <Button variant="outline">Mark all as read</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {notifications.map((notif) => (
              <div key={notif.id} className={`flex gap-5 p-5 rounded-2xl border ${notif.read ? "bg-muted/30" : "border-primary/30 bg-primary/5"}`}>
                <div className="mt-1">
                  {notif.type === "result" && <Award className="size-6 text-emerald-600" />}
                  {notif.type === "deadline" && <Calendar className="size-6 text-amber-600" />}
                  {notif.type === "assessment" && <Bell className="size-6 text-blue-600" />}
                  {notif.type === "appeal" && <AlertTriangle className="size-6 text-violet-600" />}
                </div>

                <div className="flex-1">
                  <div className="font-semibold">{notif.title}</div>
                  <div className="text-muted-foreground mt-1">{notif.message}</div>
                  <div className="text-xs text-muted-foreground mt-3">{notif.time}</div>
                </div>

                {!notif.read && (
                  <Badge className="self-start bg-primary text-primary-foreground">New</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}