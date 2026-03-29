// app/admin/integrity/page.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertTriangle, Clock, Shield, Users } from "lucide-react"

const integrityLogs = [
  {
    id: 1,
    timestamp: "2026-03-28 14:32",
    user: "S3921 - Jordan Lee",
    role: "Student",
    event: "Multiple tab switches (5 times) during Database Systems CAT",
    severity: "High",
    assessment: "Database Systems CAT",
    action: "Warning Level 3 Issued",
  },
  {
    id: 2,
    timestamp: "2026-03-28 13:45",
    user: "S2847 - Taylor Kim",
    role: "Student",
    event: "Browser window minimized for 3.2 minutes",
    severity: "Medium",
    assessment: "Algorithms Quiz",
    action: "Logged",
  },
  {
    id: 3,
    timestamp: "2026-03-28 11:20",
    user: "S1759 - Sam Rivera",
    role: "Student",
    event: "Copy-paste attempt detected",
    severity: "High",
    assessment: "Database Systems CAT",
    action: "Session Flagged",
  },
]

export default function AdminIntegrityPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
          <Shield className="size-8 text-red-600" /> Integrity & Security Center
        </h1>
        <p className="text-muted-foreground mt-1">Platform-wide audit trail and security oversight</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Summary Cards */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Today’s Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Flagged Events</span>
              <span className="font-semibold text-red-600">19</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">High Severity</span>
              <span className="font-semibold">7</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Sessions Monitored</span>
              <span className="font-semibold">1,284</span>
            </div>
          </CardContent>
        </Card>

        {/* Live Integrity Feed */}
        <Card className="lg:col-span-8">
          <CardHeader>
            <CardTitle>Recent Integrity Events</CardTitle>
            <CardDescription>Last 24 hours • All assessments</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[520px]">
              <div className="space-y-5">
                {integrityLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border p-6 hover:bg-muted/50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <AlertTriangle className={`size-6 ${log.severity === "High" ? "text-red-600" : "text-amber-600"}`} />
                        <div>
                          <div className="font-semibold">{log.user}</div>
                          <div className="text-sm text-muted-foreground">{log.assessment}</div>
                        </div>
                      </div>
                      <Badge variant={log.severity === "High" ? "destructive" : "default"}>{log.severity}</Badge>
                    </div>

                    <div className="mt-4 pl-10">
                      <div className="font-medium text-red-600">{log.event}</div>
                      <div className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
                        <Clock className="size-4" /> {log.timestamp} • Action: {log.action}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="p-6">
          <p className="text-sm">
            All events are permanently logged with timestamps and user context. 
            High-severity incidents automatically notify primary supervisors and are available for export in audit reports.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}