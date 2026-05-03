// app/lecturer/supervision/page.tsx
"use client";

import React, { useState, useEffect } from "react";
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
import {
  supervisionApi,
  SupervisionEvent,
  SupervisionStats,
} from "@/lib/api/supervision";
import { assessmentApi } from "@/lib/api/assessment";
import { toast } from "sonner";

export default function LecturerLiveSupervision() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [activeAssessmentId, setActiveAssessmentId] = useState<string>("");
  const [stats, setStats] = useState<SupervisionStats | null>(null);
  const [events, setEvents] = useState<SupervisionEvent[]>([]);
  const [filterSeverity, setFilterSeverity] = useState<
    "all" | "low" | "medium" | "high"
  >("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssessments();
  }, []);

  useEffect(() => {
    if (!activeAssessmentId) return;

    // Initial fetch
    fetchData();

    // Start polling
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [activeAssessmentId]);

  const fetchAssessments = async () => {
    try {
      const response = await assessmentApi.getAssessments();
      const data = response.items || response;
      setAssessments(data);
      if (data.length > 0) {
        setActiveAssessmentId(data[0].id);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [statsRes, eventsRes] = await Promise.all([
        supervisionApi.getStats(activeAssessmentId),
        supervisionApi.getEvents(activeAssessmentId),
      ]);
      setStats(statsRes);
      setEvents(eventsRes.events);
    } catch (e) {
      console.error("Supervision polling failed");
    }
  };

  const filteredEvents = events.filter(
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
          <Select
            value={activeAssessmentId}
            onValueChange={setActiveAssessmentId}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select Assessment" />
            </SelectTrigger>
            <SelectContent>
              {assessments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            onClick={() => supervisionApi.startSession(activeAssessmentId)}
          >
            Start Session
          </Button>
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
                    {stats?.online_count || 0}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Online
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-semibold tracking-tight">
                    {stats?.warning_count || 0}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Warnings
                  </div>
                </div>
              </div>

              {stats && stats.high_risk_count > 0 && (
                <div className="mt-6 rounded-lg bg-destructive/10 p-4 flex gap-3 items-start border border-destructive/20">
                  <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-destructive">
                      {stats.high_risk_count} High Risk Students
                    </div>
                    <div className="text-xs text-destructive/80 mt-1">
                      Immediate attention recommended
                    </div>
                  </div>
                </div>
              )}
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
                  <div className="text-sm font-medium">Monitoring Active</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Data updates every 5 seconds
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
                            {event.student_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {event.student_id}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-foreground/90 capitalize">
                          {event.event_type.replace("_", " ")}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                          <Clock className="size-3" />{" "}
                          {new Date(event.created_at).toLocaleTimeString()}
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
                          Risk {event.risk_score}%
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    {activeAssessmentId
                      ? "No events detected yet."
                      : "Select an assessment to monitor."}
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
        All integrity events are automatically logged with full timestamps.
        Every action is traceable for academic integrity audit.
      </p>
    </div>
  );
}
