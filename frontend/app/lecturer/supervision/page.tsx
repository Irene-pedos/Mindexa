// app/lecturer/supervision/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  Clock,
  Shield,
  UserCheck,
  MoreVertical,
  Flag,
  Activity,
  User,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  supervisionApi,
  SupervisionEvent,
  SupervisionStats,
  IntegrityFlag,
} from "@/lib/api/supervision";
import { assessmentApi } from "@/lib/api/assessment";
import { toast } from "sonner";
import Link from "next/link";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { Separator } from "@/components/ui/separator";

export default function LecturerLiveSupervision() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [activeAssessmentId, setActiveAssessmentId] = useState<string>("");
  const [activeAssessment, setActiveAssessment] = useState<any>(null);
  const [stats, setStats] = useState<SupervisionStats | null>(null);
  const [events, setEvents] = useState<SupervisionEvent[]>([]);
  const [flags, setFlags] = useState<IntegrityFlag[]>([]);
  const [filterSeverity, setFilterSeverity] = useState<
    "all" | "low" | "medium" | "high" | "critical"
  >("all");
  const [loading, setLoading] = useState(true);

  const fetchAssessments = useCallback(async () => {
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
  }, []);

  const fetchData = useCallback(async () => {
    if (!activeAssessmentId) return;
    try {
      const [statsRes, eventsRes, flagsRes] = await Promise.all([
        supervisionApi.getStats(activeAssessmentId),
        supervisionApi.getEvents(activeAssessmentId),
        supervisionApi.getFlags(activeAssessmentId),
      ]);
      setStats(statsRes);
      setEvents(eventsRes.events);
      setFlags(flagsRes.flags);
    } catch (e) {
      console.error("Supervision polling failed");
    }
  }, [activeAssessmentId]);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  useEffect(() => {
    if (!activeAssessmentId) return;

    // Load active assessment details
    const ass = assessments.find((a) => a.id === activeAssessmentId);
    setActiveAssessment(ass);

    // Initial fetch
    fetchData();

    // Start polling
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [activeAssessmentId, fetchData, assessments]);

  const filteredEvents = events.filter(
    (e) => filterSeverity === "all" || e.severity === filterSeverity,
  );

  const getRiskBadge = (risk: number) => {
    if (risk >= 80) return "destructive";
    if (risk >= 50) return "outline";
    return "secondary";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN":
        return "text-destructive border-destructive bg-destructive/5";
      case "UNDER_REVIEW":
        return "text-amber-600 border-amber-200 bg-amber-50";
      case "CONFIRMED":
        return "text-red-700 border-red-200 bg-red-50";
      case "DISMISSED":
        return "text-emerald-700 border-emerald-200 bg-emerald-50";
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <Skeleton variant="title" className="h-8 w-64" />
          <Skeleton variant="title" className="h-10 w-[260px] rounded-lg" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <Skeleton variant="media" className="h-48 w-full rounded-xl" />
            <Skeleton variant="media" className="h-32 w-full rounded-xl" />
          </div>
          <div className="lg:col-span-8">
            <Skeleton variant="media" className="h-[500px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Live Supervision
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time institutional integrity monitoring and detection
            protocols.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={activeAssessmentId}
            onValueChange={setActiveAssessmentId}
          >
            <SelectTrigger className="w-[260px] h-10 rounded-full">
              <SelectValue placeholder="Select Session..." />
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
            variant="default"
            className="h-10 px-6 rounded-full font-medium shadow-none"
            onClick={async () => {
              try {
                await supervisionApi.startSession(activeAssessmentId);
                toast.success("Supervision session active.");
              } catch (e) {
                toast.error("Failed to initialize session.");
              }
            }}
          >
            Deploy Session
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Stats & Info */}
        <div className="lg:col-span-4 space-y-6">
          {/* Assessment Summary */}
          {activeAssessment && (
            <Card className="shadow-none border rounded-xl overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/30 py-3">
                <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Session Context
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div>
                  <div className="font-semibold text-lg leading-tight text-foreground">
                    {activeAssessment.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {activeAssessment.course_name} •{" "}
                    {activeAssessment.course_code}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/30 border border-transparent space-y-0.5">
                    <div className="text-[9px] uppercase font-bold text-muted-foreground">
                      Protocol
                    </div>
                    <div className="text-xs font-semibold">
                      {activeAssessment.assessment_type}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30 border border-transparent space-y-0.5">
                    <div className="text-[9px] uppercase font-bold text-muted-foreground">
                      Duration
                    </div>
                    <div className="text-xs font-semibold">
                      {activeAssessment.duration_minutes} min
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Session Stats */}
          <Card className="shadow-none border rounded-xl">
            <CardHeader className="pb-3 border-b bg-muted/30 py-3">
              <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="size-3.5" /> Operational Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <div className="text-3xl font-bold tracking-tight">
                    {stats?.online_count || 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                    Live Candidates
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <div className="text-3xl font-bold tracking-tight text-destructive">
                    {stats?.warning_count || 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                    Active Warns
                  </div>
                </div>
              </div>

              {stats && stats.high_risk_count > 0 && (
                <div className="mt-6 rounded-xl bg-destructive/5 p-4 flex gap-3 items-start border border-destructive/10">
                  <AlertTriangle className="size-5 text-destructive shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-destructive uppercase">
                      {stats.high_risk_count} Critical Violations
                    </div>
                    <p className="text-[11px] text-destructive/80 mt-0.5 leading-tight">
                      Immediate institutional intervention required.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status */}
          <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100/50 flex items-center gap-3">
            <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <div className="text-xs font-semibold text-emerald-800">
                Secure Audit Active
              </div>
              <div className="text-[10px] text-emerald-600/70 font-medium mt-0.5">
                5s synchronization interval
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Feed & Flags */}
        <div className="lg:col-span-8">
          <Tabs defaultValue="events" className="w-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <TabsList className="bg-muted/50 p-1 rounded-full">
                <TabsTrigger
                  value="events"
                  className="gap-2 font-semibold text-xs rounded-full uppercase tracking-tight data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Activity className="size-3.5" /> Live Registry
                </TabsTrigger>
                <TabsTrigger
                  value="flags"
                  className="gap-2 font-semibold text-xs rounded-full uppercase tracking-tight data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <Flag className="size-3.5" /> Audit Flags
                  {flags.filter((f) => f.status === "OPEN").length > 0 && (
                    <Badge
                      variant="destructive"
                      className="h-4 px-1.5 text-[9px] font-bold min-w-[18px] flex justify-center rounded-full"
                    >
                      {flags.filter((f) => f.status === "OPEN").length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="events" className="m-0 flex-1">
              <Card className="shadow-none border rounded-xl flex flex-col h-[550px]">
                <CardHeader className="border-b py-3 px-5 flex-row items-center justify-between space-y-0 bg-muted/10">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Real-time Event Stream
                  </CardTitle>
                  <div className="flex gap-1 bg-muted/50 p-0.5 rounded-full">
                    {(["all", "critical", "high", "medium"] as const).map(
                      (level) => (
                        <Button
                          key={level}
                          variant={
                            filterSeverity === level ? "secondary" : "ghost"
                          }
                          size="sm"
                          className={cn(
                            "h-6 text-[9px] px-3 font-bold uppercase tracking-wider rounded-full",
                            filterSeverity === level &&
                              "bg-background shadow-sm text-primary",
                          )}
                          onClick={() => setFilterSeverity(level)}
                        >
                          {level}
                        </Button>
                      ),
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="divide-y divide-border/30">
                      {filteredEvents.length > 0 ? (
                        filteredEvents.map((event) => (
                          <div
                            key={event.id}
                            className="flex items-start justify-between p-4 hover:bg-muted/20 transition-colors group"
                          >
                            <div className="flex-1 min-w-0 pr-4 space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-foreground truncate">
                                  {event.student_name}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">
                                  {event.student_id.slice(0, 8)}
                                </span>
                              </div>
                              <div className={cn(
                                "text-xs font-medium capitalize flex items-center gap-1.5",
                                (event.event_type === "TAB_SWITCH" || event.event_type === "TERMINATED") ? "text-destructive font-bold" : "text-foreground/70"
                              )}>
                                {event.event_type.replace(/_/g, " ")}
                                {event.metadata_json?.duration_ms && (
                                  <span className="text-[10px] text-muted-foreground font-normal">
                                    (
                                    {(
                                      event.metadata_json.duration_ms / 1000
                                    ).toFixed(1)}
                                    s)
                                  </span>
                                )}
                                {event.metadata_json?.warning_count && (
                                  <Badge variant="outline" className="h-4 text-[8px] border-destructive text-destructive">
                                    Warn {event.metadata_json.warning_count}/3
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <Clock className="size-3 text-muted-foreground/50" />
                                <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">
                                  {new Date(
                                    event.created_at,
                                  ).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Badge
                                variant={getRiskBadge(event.risk_score)}
                                className={cn(
                                  "text-[9px] font-bold h-5 px-2.5 rounded-full shadow-none",
                                  event.risk_score >= 50 &&
                                    event.risk_score < 80 &&
                                    "border-orange-200 bg-orange-50 text-orange-700",
                                )}
                              >
                                {event.risk_score}% RISK
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-muted/20"
                                asChild
                              >
                                <Link
                                  href={`/lecturer/assessments/${activeAssessmentId}/attempts/${event.attempt_id}`}
                                >
                                  <ExternalLink className="size-3.5" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-24 space-y-3">
                          <div className="size-12 bg-muted/30 rounded-full flex items-center justify-center mx-auto text-muted-foreground/20">
                            <Activity className="size-6" />
                          </div>
                          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                            {activeAssessmentId
                              ? "Registry clear."
                              : "Initialization required."}
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="flags" className="m-0 flex-1">
              <Card className="shadow-none border rounded-xl flex flex-col h-[550px]">
                <CardHeader className="border-b py-3 px-5 bg-muted/10">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    High-Risk Observations
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="divide-y divide-border/30">
                      {flags.length > 0 ? (
                        flags.map((flag) => (
                          <div
                            key={flag.id}
                            className="p-5 hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-3 flex-1">
                                <div className="flex items-center gap-3">
                                  <div className="size-9 rounded-full bg-muted flex items-center justify-center">
                                    <User className="size-4 text-muted-foreground" />
                                  </div>
                                  <div>
                                    <div className="font-semibold text-sm leading-none">
                                      {flag.student_name || "Unknown Student"}
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[9px] font-bold uppercase h-4.5 px-1.5 mt-1.5 rounded-full shadow-none",
                                        getStatusColor(flag.status),
                                      )}
                                    >
                                      {flag.status.replace(/_/g, " ")}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="p-3 rounded-lg bg-muted/10 border border-dashed text-xs text-foreground/80 leading-relaxed italic">
                                  &quot;{flag.description}&quot;
                                </div>
                                <div className="flex items-center gap-3 pt-0.5">
                                  <div className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1 uppercase tracking-wider">
                                    <Clock className="size-3" />{" "}
                                    {new Date(
                                      flag.created_at,
                                    ).toLocaleTimeString()}
                                  </div>
                                  <Badge
                                    variant="secondary"
                                    className="h-4.5 text-[9px] font-bold px-2 rounded-full uppercase shadow-none"
                                  >
                                    {flag.risk_level} Risk
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1.5 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-[10px] font-bold uppercase gap-1.5 px-3 rounded-full shadow-none"
                                  asChild
                                >
                                  <Link
                                    href={`/lecturer/assessments/${activeAssessmentId}/attempts/${flag.attempt_id}`}
                                  >
                                    <Activity className="size-3" /> Audit
                                  </Link>
                                </Button>
                                {flag.status === "OPEN" && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="h-8 text-[10px] font-bold uppercase gap-1.5 px-3 rounded-full shadow-none"
                                  >
                                    <CheckCircle2 className="size-3" /> Resolve
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-24 space-y-3">
                          <div className="size-12 bg-muted/30 rounded-full flex items-center justify-center mx-auto text-muted-foreground/20">
                            <Flag className="size-6" />
                          </div>
                          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                            Audit trail clear.
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Separator className="opacity-50" />

      <div className="flex items-center justify-center py-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2 opacity-40">
          <Shield className="size-3" /> Institutional Integrity Lock
        </p>
      </div>
    </div>
  );
}
