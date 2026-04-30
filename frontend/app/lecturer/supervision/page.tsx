// app/lecturer/supervision/page.tsx
"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Clock,
  Shield,
  UserCheck,
  MoreVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SupervisionEvent {
  id: number;
  studentId: string;
  studentName: string;
  assessment: string;
  event: string;
  time: string;
  severity: "low" | "medium" | "high";
  riskScore: number;
  actionTaken?: string;
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
];

export default function LecturerLiveSupervision() {
  const [activeAssessment, setActiveAssessment] = useState(
    "Database Systems CAT",
  );
  const [filterSeverity, setFilterSeverity] = useState<
    "all" | "low" | "medium" | "high"
  >("all");

  const filteredEvents = liveEvents.filter(
    (e) => filterSeverity === "all" || e.severity === filterSeverity,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="size-6 text-primary" /> Live Supervision
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time integrity monitoring and suspicious behavior detection
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={activeAssessment} onValueChange={setActiveAssessment}>
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Database Systems CAT">
                Database Systems CAT
              </SelectItem>
              <SelectItem value="Algorithms Formative Quiz">
                Algorithms Formative Quiz
              </SelectItem>
              <SelectItem value="Software Engineering Group Work">
                Software Engineering Group Work
              </SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary">Assign Assistant</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Overview Cards */}
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Session Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-2xl font-semibold tracking-tight">
                    47
                  </div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Online
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-semibold tracking-tight">5</div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Warnings
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-lg bg-destructive/10 p-4 flex gap-3 items-start border border-destructive/20">
                <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-destructive">
                    2 High Risk Students
                  </div>
                  <div className="text-xs text-destructive/80 mt-1">
                    Immediate attention recommended
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-full">
                  <UserCheck className="size-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">
                    Supervised Mode Active
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Multi-supervisor enabled
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Events Feed */}
        <Card className="lg:col-span-8 flex flex-col">
          <CardHeader className="border-b pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Events Feed</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Real-time integrity logs
                </CardDescription>
              </div>
              <div className="flex gap-1.5 bg-muted p-1 rounded-md">
                {(["all", "high", "medium"] as const).map((level) => (
                  <Button
                    key={level}
                    variant={filterSeverity === level ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-7 text-xs px-3",
                      filterSeverity === level && "bg-background shadow-sm",
                    )}
                    onClick={() => setFilterSeverity(level)}
                  >
                    {level === "all"
                      ? "All"
                      : level.charAt(0).toUpperCase() + level.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[480px]">
              <div className="divide-y">
                {filteredEvents.length > 0 ? (
                  filteredEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {event.studentName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {event.studentId}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-foreground/90">
                          {event.event}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                          <Clock className="size-3" /> {event.time}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <Badge
                          variant={
                            event.severity === "high"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-[10px] font-medium"
                        >
                          Risk {event.riskScore}%
                        </Badge>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreVertical className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    No events match the current filter.
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Institutional Note */}
      <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
        All integrity events are automatically logged with full timestamps and
        screenshots. This panel supports multi-supervisor mode. Every action is
        traceable for academic integrity audit.
      </p>
    </div>
  );
}
