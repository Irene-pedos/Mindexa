// app/lecturer/supervision/page.tsx
"use client"

import React, { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  AlertTriangle, 
  Eye, 
  Clock, 
  Users, 
  Shield, 
  UserCheck 
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SupervisionEvent {
  id: number
  studentId: string
  studentName: string
  assessment: string
  event: string
  time: string
  severity: "low" | "medium" | "high"
  riskScore: number
  actionTaken?: string
}

const liveEvents: SupervisionEvent[] = [
  {
    id: 1,
    studentId: "S3921",
    studentName: "Jordan Lee",
    assessment: "Database Systems CAT",
    event: "Tab switching detected (3 times)",
    time: "Just now",
    severity: "high",
    riskScore: 85,
  },
  {
    id: 2,
    studentId: "S2847",
    studentName: "Taylor Kim",
    assessment: "Algorithms Formative Quiz",
    event: "Extended inactivity (4.5 minutes)",
    time: "2 min ago",
    severity: "medium",
    riskScore: 62,
  },
  {
    id: 3,
    studentId: "S1759",
    studentName: "Sam Rivera",
    assessment: "Database Systems CAT",
    event: "Browser window minimized",
    time: "7 min ago",
    severity: "medium",
    riskScore: 45,
  },
  {
    id: 4,
    studentId: "S4412",
    studentName: "Alex Chen",
    assessment: "Database Systems CAT",
    event: "Copy-paste attempt (Closed Book)",
    time: "11 min ago",
    severity: "high",
    riskScore: 91,
  },
]

export default function LecturerLiveSupervision() {
  const [activeAssessment, setActiveAssessment] = useState("Database Systems CAT")
  const [filterSeverity, setFilterSeverity] = useState<"all" | "low" | "medium" | "high">("all")

  const filteredEvents = liveEvents.filter(
    (e) => filterSeverity === "all" || e.severity === filterSeverity
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <Shield className="size-9 text-red-600" /> Live Supervision Panel
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time integrity monitoring and suspicious behavior detection for active assessments
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Select value={activeAssessment} onValueChange={setActiveAssessment}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Database Systems CAT">Database Systems CAT</SelectItem>
              <SelectItem value="Algorithms Formative Quiz">Algorithms Formative Quiz</SelectItem>
              <SelectItem value="Software Engineering Group Work">Software Engineering Group Work</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">Assign Assistant Supervisor</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Live Overview Cards */}
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Session Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border p-4">
                  <div className="text-3xl font-semibold tabular-nums text-emerald-600">47</div>
                  <div className="text-sm text-muted-foreground mt-2">Students Currently Online</div>
                </div>
                <div className="rounded-2xl border p-6">
                  <div className="text-3xl font-semibold tabular-nums text-amber-600">5</div>
                  <div className="text-sm text-muted-foreground mt-2">Active Warnings</div>
                </div>
              </div>

              <Card className="border-red-600">
                <CardContent>
                  <div className="flex items-center gap-4 text-red-500">
                    <AlertTriangle className="size-8" />
                    <div>
                      <div className="font-semibold text-lg">High Risk Students: 2</div>
                      <div className="text-sm">Immediate attention recommended</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Supervision Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 text-emerald-500">
                <UserCheck className="size-6" />
                <div>
                  <div className="font-medium">Supervised Mode Active</div>
                  <div className="text-xs text-muted-foreground">Multi-supervisor enabled</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Events Feed */}
        <Card className="lg:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Live Integrity Events Feed</CardTitle>
              <CardDescription>Real-time detection • All events are logged with timestamps for audit trail</CardDescription>
            </div>
            <div className="flex gap-2">
              {(["all", "high", "medium"] as const).map((level) => (
                <Button
                  key={level}
                  variant={filterSeverity === level ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterSeverity(level)}
                >
                  {level === "all" ? "All Events" : level.charAt(0).toUpperCase() + level.slice(1)}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[560px] pr-4">
              <div className="space-y-5">
                {filteredEvents.length > 0 ? (
                  filteredEvents.map((event) => (
                    <div 
                      key={event.id} 
                      className={cn(
                        "rounded-3xl border p-4 transition-all hover:shadow-md",
                        event.severity === "high" && "border-red-600"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="font-semibold">{event.studentName}</div>
                            <Badge variant="outline" className="text-xs">{event.studentId}</Badge>
                          </div>
                          <div className="mt-3 text-sm leading-relaxed">{event.event}</div>
                          <div className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
                            <Clock className="size-4" /> {event.time} • {event.assessment}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-3">
                          <Badge 
                            variant={event.severity === "high" ? "destructive" : "default"}
                            className="font-mono"
                          >
                            Risk {event.riskScore}%
                          </Badge>
                          <Button variant="outline" size="sm">
                            View Full Log
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 text-muted-foreground">
                    No events match the current filter.
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Institutional Note */}
      <Card>
        <CardContent>
          All integrity events are automatically logged with full timestamps and screenshots (when enabled). 
          This panel supports <strong>multi-supervisor mode</strong>. Primary supervisor can invite assistant supervisors. 
          Every action is traceable for academic integrity audit.
        </CardContent>
      </Card>
    </div>
  )
}