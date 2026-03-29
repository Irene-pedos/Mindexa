// app/lecturer/integrity/page.tsx
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertTriangle, Clock, User } from "lucide-react"

const integrityLogs = [
  {
    id: 1,
    student: "Jordan Lee (S3921)",
    assessment: "Database Systems CAT",
    event: "Multiple tab switches (5 times)",
    time: "14:32",
    risk: "High",
    actionTaken: "Warning issued",
  },
  {
    id: 2,
    student: "Taylor Kim (S2847)",
    assessment: "Algorithms Quiz",
    event: "Browser minimized for 3 minutes",
    time: "13:45",
    risk: "Medium",
    actionTaken: "Logged only",
  },
  {
    id: 3,
    student: "Sam Rivera (S1759)",
    assessment: "Database Systems CAT",
    event: "Copy-paste attempt detected",
    time: "11:20",
    risk: "High",
    actionTaken: "Flag raised",
  },
]

export default function LecturerIntegrityPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
          <AlertTriangle className="size-8 text-red-600" /> Integrity & Security Logs
        </h1>
        <p className="text-muted-foreground mt-1">Complete audit trail of all flagged events across assessments</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Integrity Events</CardTitle>
          <CardDescription>Last 24 hours • All supervised assessments</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[620px]">
            <div className="space-y-5">
              {integrityLogs.map((log) => (
                <div key={log.id} className="border rounded-2xl p-6 hover:bg-muted/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
                        <User className="size-5 text-red-600" />
                      </div>
                      <div>
                        <div className="font-semibold">{log.student}</div>
                        <div className="text-sm text-muted-foreground">{log.assessment}</div>
                      </div>
                    </div>
                    <Badge variant={log.risk === "High" ? "destructive" : "default"}>{log.risk} Risk</Badge>
                  </div>

                  <div className="mt-5 pl-14">
                    <div className="font-medium text-red-600">{log.event}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
                      <Clock className="size-4" /> {log.time} • Action: {log.actionTaken}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline">Export Full Integrity Report (PDF)</Button>
      </div>
    </div>
  )
}