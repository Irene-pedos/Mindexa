// app/lecturer/supervision/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  Clock,
  Shield,
  UserCheck,
  Flag,
  Activity,
  User,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Lock,
  FileText,
  Sparkles,
  RefreshCw,
  Users,
  Search,
  Check,
  X,
  Radio,
  BookOpen,
  Info,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  supervisionApi,
  SupervisionEvent,
  SupervisionStats,
  IntegrityFlag,
} from "@/lib/api/supervision";
import { integrityApi } from "@/lib/api/integrity";
import { assessmentApi } from "@/lib/api/assessment";
import { toast } from "sonner";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AIIntegrityExplainer } from "@/components/mindexa/integrity/ai-explainer";

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
  const [activeTab, setActiveTab] = useState<string>("events");
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  // Resolve Flag Dialog State
  const [resolveTarget, setResolveTarget] = useState<IntegrityFlag | null>(null);
  const [resolveStatus, setResolveStatus] = useState<string>("CONFIRMED");
  const [resolveNotes, setResolveNotes] = useState<string>("");
  const [resolving, setResolving] = useState(false);

  // AI Explain Dialog State
  const [explainingFlagId, setExplainingFlagId] = useState<string | null>(null);

  // Search filter inside tabs
  const [candidateSearch, setCandidateSearch] = useState<string>("");

  const fetchAssessments = useCallback(async () => {
    try {
      const response = await assessmentApi.getAssessments();
      const data = response.items || response;
      setAssessments(data);
      if (data.length > 0 && !activeAssessmentId) {
        setActiveAssessmentId(data[0].id);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  }, [activeAssessmentId]);

  const fetchData = useCallback(async () => {
    if (!activeAssessmentId) return;
    try {
      const [statsRes, eventsRes, flagsRes] = await Promise.all([
        supervisionApi.getStats(activeAssessmentId),
        supervisionApi.getEvents(activeAssessmentId),
        supervisionApi.getFlags(activeAssessmentId),
      ]);
      setStats(statsRes);
      setEvents(eventsRes.events || []);
      setFlags(flagsRes.flags || []);
    } catch {
      // Background polling failures handled silently
    }
  }, [activeAssessmentId]);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  useEffect(() => {
    if (!activeAssessmentId) return;

    // Load active assessment details
    const ass = assessments.find((a) => a.id === activeAssessmentId);
    setActiveAssessment(ass || null);

    // Initial fetch
    fetchData();

    // Start polling every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [activeAssessmentId, fetchData, assessments]);

  // Determine if assessment has ended or is closed
  const isEnded = useMemo(() => {
    if (!activeAssessment) return false;
    const status = activeAssessment.status;
    if (status === "CLOSED" || status === "ARCHIVED") return true;
    if (activeAssessment.window_end) {
      return new Date(activeAssessment.window_end).getTime() < Date.now();
    }
    return false;
  }, [activeAssessment]);

  const isDraft = activeAssessment?.status === "DRAFT";
  const canDeploy = !isEnded && !isDraft && !!activeAssessmentId;

  const filteredEvents = useMemo(() => {
    return events.filter(
      (e) => filterSeverity === "all" || e.severity === filterSeverity,
    );
  }, [events, filterSeverity]);

  const openFlagsCount = useMemo(() => {
    return flags.filter((f) => f.status === "OPEN").length;
  }, [flags]);

  const handleDeploySession = async () => {
    if (!canDeploy) {
      if (isEnded) {
        toast.error("Cannot deploy a supervision session on an assessment that has ended.");
      } else if (isDraft) {
        toast.error("Please publish the assessment draft before deploying live supervision.");
      }
      return;
    }

    setDeploying(true);
    try {
      await supervisionApi.startSession(activeAssessmentId);
      setIsSessionActive(true);
      toast.success("Live supervision telemetry deployed successfully.");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to initialize supervision session.");
    } finally {
      setDeploying(false);
    }
  };

  const handleEndSession = async () => {
    try {
      await supervisionApi.endSession(activeAssessmentId);
      setIsSessionActive(false);
      toast.info("Supervision session concluded.");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to end supervision session.");
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTarget) return;

    if (resolveNotes.trim().length < 5) {
      toast.error("Resolution notes must be at least 5 characters long.");
      return;
    }

    setResolving(true);
    try {
      await integrityApi.resolveFlag(resolveTarget.id, {
        status: resolveStatus,
        resolution_notes: resolveNotes.trim(),
      });
      toast.success(`Flag resolved with status: ${resolveStatus}`);
      setResolveTarget(null);
      setResolveNotes("");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to resolve integrity flag.");
    } finally {
      setResolving(false);
    }
  };

  const getRiskBadge = (risk: number) => {
    if (risk >= 80) return "destructive";
    if (risk >= 50) return "outline";
    return "secondary";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return "bg-rose-500/10 text-rose-600 border-rose-500/20";
      case "UNDER_REVIEW":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "CONFIRMED":
        return "bg-red-600 text-white border-red-700";
      case "DISMISSED":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "ESCALATED":
        return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
      default:
        return "bg-muted text-muted-foreground border-border/50";
    }
  };

  if (loading) {
    return (
      <div className="w-full space-y-4 p-2 animate-pulse">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <Skeleton className="h-7 w-52 rounded-xl" />
          <Skeleton className="h-9 w-64 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-4">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-36 w-full rounded-2xl" />
          </div>
          <div className="lg:col-span-8">
            <Skeleton className="h-[480px] w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tour="lecturer-supervision"
      className="w-full space-y-4 p-1 md:p-2 animate-in fade-in duration-200"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Live Supervision & Integrity Feed
            {isSessionActive && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-medium">
            Real-time candidate telemetry, violation detection, and high-risk audit flags.
          </p>
        </div>

        {/* Assessment Selector & Deployment Action */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={activeAssessmentId}
            onValueChange={setActiveAssessmentId}
          >
            <SelectTrigger className="w-64 h-9 text-xs rounded-xl bg-background border-border/70 shadow-none font-medium">
              <span className="flex items-center gap-1.5 truncate">
                <FileText className="size-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Select Assessment Session..." />
              </span>
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-lg max-h-72">
              {assessments.map((a) => {
                const asmtEnded =
                  a.status === "CLOSED" ||
                  a.status === "ARCHIVED" ||
                  (a.window_end && new Date(a.window_end).getTime() < Date.now());

                return (
                  <SelectItem key={a.id} value={a.id} className="text-xs py-2">
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span className="font-medium truncate max-w-[150px]">
                        {a.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] font-bold uppercase px-1.5 py-0 h-4 border",
                          asmtEnded
                            ? "bg-muted/40 text-muted-foreground border-border/50"
                            : a.status === "ACTIVE"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : "bg-primary/5 text-primary border-primary/20"
                        )}
                      >
                        {asmtEnded ? "Ended" : a.status}
                      </Badge>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Deploy / End Supervision Session */}
          {isSessionActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEndSession}
              className="h-9 px-3.5 font-bold text-xs rounded-xl border-border/70 shadow-none hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
            >
              <Radio className="size-3.5 mr-1.5 text-emerald-500 animate-pulse" />
              End Session
            </Button>
          ) : (
            <Button
              variant={canDeploy ? "default" : "outline"}
              size="sm"
              disabled={!canDeploy || deploying}
              onClick={handleDeploySession}
              className={cn(
                "h-9 px-4 font-bold text-xs rounded-xl shadow-none",
                canDeploy
                  ? "bg-primary hover:bg-primary/95 text-primary-foreground"
                  : "text-muted-foreground cursor-not-allowed border-border/60 bg-muted/30"
              )}
              title={
                isEnded
                  ? "Assessment has concluded. Real-time session cannot be deployed."
                  : isDraft
                  ? "Assessment is currently in draft status."
                  : "Deploy live supervision"
              }
            >
              {deploying ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : isEnded ? (
                <Lock className="size-3.5 mr-1.5 text-muted-foreground" />
              ) : isDraft ? (
                <FileText className="size-3.5 mr-1.5 text-muted-foreground" />
              ) : (
                <Play className="size-3.5 mr-1.5" />
              )}
              {isEnded
                ? "Assessment Ended"
                : isDraft
                ? "Draft Mode"
                : "Deploy Session"}
            </Button>
          )}
        </div>
      </div>

      {/* Notice Banner if assessment is ended */}
      {isEnded && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs text-muted-foreground">
          <Info className="size-4 text-muted-foreground/80 shrink-0" />
          <div className="leading-snug">
            <span className="font-semibold text-foreground">Assessment Concluded:</span>{" "}
            Live real-time candidate deployment is disabled for concluded assessments. You can inspect historical audit flags, timeline telemetry, and grading records below.
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Context & Metrics */}
        <div className="lg:col-span-4 space-y-4">
          {/* Assessment Summary Card */}
          {activeAssessment && (
            <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-border/40 bg-muted/20">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="size-3.5" /> Session Details
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] font-bold uppercase px-2 py-0.5",
                      isEnded
                        ? "bg-muted/40 text-muted-foreground"
                        : "bg-primary/10 text-primary border-primary/20"
                    )}
                  >
                    {isEnded ? "Concluded" : activeAssessment.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3.5">
                <div>
                  <h2 className="font-bold text-base leading-snug text-foreground">
                    {activeAssessment.title}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeAssessment.course_name || "General Course"} •{" "}
                    <span className="font-mono">{activeAssessment.course_code || "—"}</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border/40 space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">
                      Type
                    </div>
                    <div className="text-xs font-semibold text-foreground">
                      {activeAssessment.assessment_type || "EXAM"}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border/40 space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">
                      Duration
                    </div>
                    <div className="text-xs font-semibold text-foreground">
                      {activeAssessment.duration_minutes || "—"} min
                    </div>
                  </div>
                </div>

                {/* Quick Link to Assessment Overview & Grading */}
                <div className="pt-1 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-8 text-xs font-semibold rounded-xl flex-1 border-border/60"
                  >
                    <Link href={`/lecturer/assessments/${activeAssessmentId}`}>
                      <FileText className="size-3.5 mr-1.5 text-muted-foreground" /> Overview
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-8 text-xs font-semibold rounded-xl flex-1 border-border/60"
                  >
                    <Link href={`/lecturer/grading?assessment=${activeAssessmentId}`}>
                      <UserCheck className="size-3.5 mr-1.5 text-muted-foreground" /> Grading
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Operational Metrics Card */}
          <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground">
            <CardHeader className="py-3 px-4 border-b border-border/40 bg-muted/20">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Activity className="size-3.5" /> Operational Insights
                </span>
                <span className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-1">
                  <RefreshCw className="size-2.5 animate-spin" /> 5s Poll
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 p-3 rounded-xl bg-muted/30 border border-border/40">
                  <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
                    {stats?.online_count || 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                    <Users className="size-3" /> Live Candidates
                  </div>
                </div>
                <div className="space-y-1 p-3 rounded-xl bg-muted/30 border border-border/40">
                  <div className="text-2xl font-bold font-mono tracking-tight text-destructive">
                    {stats?.warning_count || 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="size-3 text-destructive" /> Active Warnings
                  </div>
                </div>
              </div>

              {stats && stats.high_risk_count > 0 ? (
                <div className="rounded-xl bg-destructive/10 p-3 flex gap-2.5 items-start border border-destructive/20">
                  <ShieldAlert className="size-4 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-destructive">
                      {stats.high_risk_count} High-Risk Flag{stats.high_risk_count !== 1 ? "s" : ""} Raised
                    </div>
                    <p className="text-[11px] text-destructive/90 leading-tight">
                      Review candidate audit trails and confirm integrity findings.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-500/5 p-3 flex gap-2.5 items-center border border-emerald-500/15">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <div className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    No critical breaches recorded in current session.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Interactive Tabs */}
        <div className="lg:col-span-8">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full flex flex-col gap-3"
          >
            {/* Tabs List */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
              <TabsList className="bg-muted/40 p-1 rounded-xl border border-border/50 h-auto gap-1 inline-flex shrink-0">
                <TabsTrigger
                  value="events"
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 gap-1.5",
                    "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60",
                    "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Activity className="size-3.5" />
                  <span>Live Registry</span>
                  {events.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                      {events.length}
                    </span>
                  )}
                </TabsTrigger>

                <TabsTrigger
                  value="flags"
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 gap-1.5",
                    "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60",
                    "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Flag className="size-3.5" />
                  <span>Audit Flags</span>
                  {openFlagsCount > 0 ? (
                    <Badge
                      variant="destructive"
                      className="h-4 px-1.5 text-[9px] font-bold rounded-full min-w-[18px] flex justify-center"
                    >
                      {openFlagsCount}
                    </Badge>
                  ) : flags.length > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                      {flags.length}
                    </span>
                  ) : null}
                </TabsTrigger>

                <TabsTrigger
                  value="integrity-guide"
                  className={cn(
                    "text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 gap-1.5",
                    "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60",
                    "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sparkles className="size-3.5 text-primary" />
                  <span>Policies & Protocols</span>
                </TabsTrigger>
              </TabsList>

              <Button
                variant="ghost"
                size="sm"
                onClick={fetchData}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-xl"
                title="Refresh Live Data"
              >
                <RefreshCw className="size-3 mr-1.5" /> Sync
              </Button>
            </div>

            {/* TAB 1: LIVE REGISTRY / EVENT STREAM */}
            <TabsContent value="events" className="m-0 outline-none">
              <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground flex flex-col h-[560px] overflow-hidden">
                <CardHeader className="border-b border-border/40 py-2.5 px-4 flex-row items-center justify-between space-y-0 bg-muted/20">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Activity className="size-3.5" /> Real-Time Telemetry Stream
                  </CardTitle>
                  <div className="flex gap-1 bg-muted/50 p-0.5 rounded-xl border border-border/40">
                    {(["all", "critical", "high", "medium", "low"] as const).map(
                      (level) => (
                        <Button
                          key={level}
                          variant={filterSeverity === level ? "secondary" : "ghost"}
                          size="sm"
                          className={cn(
                            "h-6 text-[10px] px-2.5 font-bold uppercase tracking-wider rounded-lg shadow-none",
                            filterSeverity === level &&
                              "bg-background text-foreground shadow-sm border border-border/50"
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
                            className="flex items-start justify-between p-3.5 hover:bg-muted/20 transition-colors group"
                          >
                            <div className="flex-1 min-w-0 pr-3 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-foreground truncate">
                                  {event.student_name || "Candidate"}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground uppercase">
                                  ID: {event.student_id ? event.student_id.slice(0, 8) : "—"}
                                </span>
                              </div>
                              <div
                                className={cn(
                                  "text-xs font-medium capitalize flex items-center gap-1.5",
                                  event.event_type === "TAB_SWITCH" ||
                                    event.event_type === "TERMINATED"
                                    ? "text-destructive font-semibold"
                                    : "text-foreground/80"
                                )}
                              >
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
                                  <Badge
                                    variant="outline"
                                    className="h-4 text-[8px] border-destructive text-destructive font-bold px-1 rounded"
                                  >
                                    Warn {event.metadata_json.warning_count}/3
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <Clock className="size-3 text-muted-foreground/60" />
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  {new Date(event.created_at).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Badge
                                variant={getRiskBadge(event.risk_score)}
                                className={cn(
                                  "text-[10px] font-bold h-5 px-2 rounded-full shadow-none font-mono",
                                  event.risk_score >= 50 &&
                                    event.risk_score < 80 &&
                                    "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                )}
                              >
                                {event.risk_score}% Risk
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs font-semibold rounded-lg px-2 shadow-none border-border/60"
                                asChild
                              >
                                <Link
                                  href={`/lecturer/grading?assessment=${activeAssessmentId}`}
                                  title="Inspect Candidate in Grading Queue"
                                >
                                  <ExternalLink className="size-3 mr-1" /> Inspect
                                </Link>
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-24 space-y-3">
                          <div className="size-12 bg-muted/40 rounded-2xl flex items-center justify-center mx-auto text-muted-foreground/40">
                            <Activity className="size-6" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-foreground font-semibold">
                              No events recorded matching filter.
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {activeAssessmentId
                                ? "Telemetry stream is operational and waiting for candidate interactions."
                                : "Select an assessment to begin monitoring."}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: AUDIT FLAGS */}
            <TabsContent value="flags" className="m-0 outline-none">
              <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground flex flex-col h-[560px] overflow-hidden">
                <CardHeader className="border-b border-border/40 py-2.5 px-4 bg-muted/20 flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Flag className="size-3.5" /> High-Risk Audit Observations
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-7 text-xs font-semibold rounded-lg px-2.5 border-border/60"
                  >
                    <Link href="/lecturer/integrity">
                      <Shield className="size-3 mr-1.5" /> Full Audit Logs
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="divide-y divide-border/30">
                      {flags.length > 0 ? (
                        flags.map((flag) => (
                          <div
                            key={flag.id}
                            className="p-4 hover:bg-muted/20 transition-colors space-y-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="size-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                                  <User className="size-4" />
                                </div>
                                <div>
                                  <div className="font-bold text-xs text-foreground">
                                    {flag.student_name || "Candidate"}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[9px] font-bold uppercase px-1.5 py-0 h-4 border",
                                        getStatusBadge(flag.status)
                                      )}
                                    >
                                      {flag.status.replace(/_/g, " ")}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      {new Date(flag.created_at).toLocaleTimeString()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setExplainingFlagId(flag.id)}
                                  className="h-7 text-xs font-semibold rounded-lg px-2.5 border-border/60"
                                >
                                  <Sparkles className="size-3 mr-1 text-primary" /> Explain AI
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  asChild
                                  className="h-7 text-xs font-semibold rounded-lg px-2.5 border-border/60"
                                >
                                  <Link
                                    href={`/lecturer/grading?assessment=${activeAssessmentId}`}
                                  >
                                    <Activity className="size-3 mr-1" /> Audit
                                  </Link>
                                </Button>
                                {flag.status === "OPEN" && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => {
                                      setResolveTarget(flag);
                                      setResolveStatus("CONFIRMED");
                                      setResolveNotes("");
                                    }}
                                    className="h-7 text-xs font-semibold rounded-lg px-3 bg-primary hover:bg-primary/95 text-primary-foreground"
                                  >
                                    <CheckCircle2 className="size-3 mr-1" /> Resolve
                                  </Button>
                                )}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-muted/20 border border-border/40 text-xs text-foreground/90 font-medium">
                              &ldquo;{flag.description}&rdquo;
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-24 space-y-3">
                          <div className="size-12 bg-muted/40 rounded-2xl flex items-center justify-center mx-auto text-muted-foreground/40">
                            <Flag className="size-6" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-foreground font-semibold">
                              Audit log is clear.
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              No integrity flags have been raised for this assessment.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: POLICIES & PROTOCOLS */}
            <TabsContent value="integrity-guide" className="m-0 outline-none">
              <Card className="shadow-none border border-border/70 rounded-2xl bg-card text-card-foreground flex flex-col h-[560px] overflow-hidden">
                <CardHeader className="border-b border-border/40 py-2.5 px-4 bg-muted/20">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Shield className="size-3.5 text-primary" /> Institutional Integrity Protocols
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed text-muted-foreground">
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/15 space-y-2">
                    <h3 className="font-bold text-sm text-primary flex items-center gap-1.5">
                      <Sparkles className="size-4" /> AI Governance & Human Authority
                    </h3>
                    <p className="text-foreground/85 font-medium">
                      Mindexa utilizes multi-modal integrity agents to monitor client-side browser events, tab switching, and fullscreen boundaries. In accordance with institutional guidelines, all flagged events require lecturer review and human confirmation before academic action is finalized.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1.5">
                      <div className="font-bold text-foreground text-xs flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5 text-amber-500" /> Tab Switch Thresholds
                      </div>
                      <p className="text-[11px] leading-normal">
                        Candidates receive progressive warnings on 3 and 5 tab exits. A critical supervisor flag is automatically raised upon the 8th occurrence.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1.5">
                      <div className="font-bold text-foreground text-xs flex items-center gap-1.5">
                        <Lock className="size-3.5 text-rose-500" /> Closed-Book Copy/Paste Lock
                      </div>
                      <p className="text-[11px] leading-normal">
                        Unsanctioned clipboard operations in closed-book environments trigger immediate warning overlays and mark attempts for audit hold.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="h-8 text-xs font-semibold rounded-xl border-border/60"
                    >
                      <Link href="/lecturer/integrity">
                        <ExternalLink className="size-3.5 mr-1.5" /> Navigate to Full Security Hub
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── Resolve Flag Modal Dialog ── */}
      <Dialog
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResolveTarget(null);
            setResolveNotes("");
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border border-border bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" /> Resolve Integrity Flag
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Update the official disposition and resolution notes for candidate{" "}
              <span className="font-semibold text-foreground">
                {resolveTarget?.student_name || "Unknown"}
              </span>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResolveSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Resolution Disposition</Label>
              <Select value={resolveStatus} onValueChange={setResolveStatus}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-border/70 bg-background font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="CONFIRMED">
                    Confirmed — Violation Verified (Hold Maintained)
                  </SelectItem>
                  <SelectItem value="DISMISSED">
                    Dismissed — False Positive (Clear Hold)
                  </SelectItem>
                  <SelectItem value="ESCALATED">
                    Escalated — Refer to Academic Committee
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Resolution Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Enter justification notes (min 5 characters)..."
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                className="min-h-[90px] text-xs rounded-xl bg-background border-border/70 font-medium"
                required
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResolveTarget(null)}
                className="h-8 text-xs font-semibold rounded-xl border-border/60"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={resolving || resolveNotes.trim().length < 5}
                className="h-8 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground"
              >
                {resolving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                Confirm Resolution
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── AI Explanation Modal Dialog ── */}
      <Dialog
        open={!!explainingFlagId}
        onOpenChange={(open) => {
          if (!open) setExplainingFlagId(null);
        }}
      >
        <DialogContent className="max-w-3xl sm:max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> AI Flag Explainability Analysis
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Autonomous synthesized timeline and rationale generated from browser event telemetry.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {explainingFlagId && <AIIntegrityExplainer flagId={explainingFlagId} />}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExplainingFlagId(null)}
              className="h-8 text-xs font-semibold rounded-xl border-border/60"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
