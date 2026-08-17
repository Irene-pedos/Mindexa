"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Check,
  Loader2,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Award,
  Layers,
  FileText,
  HelpCircle,
} from "lucide-react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { assessmentApi } from "@/lib/api/assessment";
import { gradingApi } from "@/lib/api/grading";
import { lecturerApi } from "@/lib/api/lecturer";
import { toast } from "sonner";
import { AssessmentSummary, AnalyticsData } from "../types";

function AnalyticsBentoSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 4 KPI Skeleton Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 border border-border/50 bg-card/40 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="size-4 rounded-full" />
            </div>
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-3 w-36 rounded" />
          </div>
        ))}
      </div>

      {/* 3 Visual Chart Skeleton Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-5 border border-border/50 bg-card/40 rounded-xl space-y-4">
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ))}
      </div>

      {/* Table & AI Summary Skeleton */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="p-5 border border-border/50 bg-card/40 rounded-xl space-y-4">
          <Skeleton className="h-4 w-44 rounded" />
          <div className="space-y-2 pt-2">
            {[1, 2, 3, 4, 5].map((j) => (
              <Skeleton key={j} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="p-5 border border-border/50 bg-card/40 rounded-xl space-y-4">
          <Skeleton className="h-4 w-48 rounded" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function AssessmentAnalyticsPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("all");
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("all");
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentSummary | null>(null);
  
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("all");

  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Load Workspaces on mount
  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const wsRes = await lecturerApi.getWorkspaces();
        setWorkspaces(wsRes || []);
      } catch (err: any) {
        toast.error("Failed to load workspaces context");
      } finally {
        setLoading(false);
      }
    }
    loadWorkspaces();
  }, []);

  // Fetch assessments filtered by workspace
  useEffect(() => {
    async function loadAssessments() {
      try {
        const params: Record<string, any> = {};
        if (selectedWorkspaceId !== "all") {
          params.workspace_id = selectedWorkspaceId;
        }
        const res = await assessmentApi.getAssessments(params);
        const validItems = (res.items || []).filter(
          (a: any) => a.status !== "DRAFT" && a.status !== "ARCHIVED"
        );
        setAssessments(validItems);
        
        if (selectedAssessmentId !== "all" && !res.items?.some((a: any) => a.id === selectedAssessmentId)) {
          setSelectedAssessmentId("all");
          setSelectedAssessment(null);
          setClasses([]);
          setSelectedClassId("all");
          setAnalyticsData(null);
        }
      } catch (err: any) {
        toast.error("Failed to load assessments for selected workspace");
      }
    }
    loadAssessments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId]);

  // Load class sections for selected assessment
  useEffect(() => {
    async function loadClasses() {
      if (selectedAssessmentId === "all") {
        setClasses([]);
        setSelectedClassId("all");
        return;
      }
      try {
        const res = await gradingApi.getAssessmentClassStats(selectedAssessmentId);
        setClasses(res?.classes || []);
        setSelectedClassId("all");
      } catch (err: any) {
        console.error("Failed to load class sections stats", err);
      }
    }
    loadClasses();
  }, [selectedAssessmentId]);

  const fetchAnalytics = useCallback(async (asmtId: string, classSecId?: string, forceRegenerate?: boolean) => {
    if (!asmtId || asmtId === "all") return;

    if (forceRegenerate) {
      setIsRegenerating(true);
    } else {
      setAnalyticsLoading(true);
    }

    try {
      const res = await gradingApi.getAssessmentAnalytics(
        asmtId,
        classSecId === "all" ? undefined : classSecId,
        forceRegenerate
      );
      setAnalyticsData(res);
      if (forceRegenerate) {
        toast.success("AI narrative regenerated successfully.");
      }
    } catch (error: unknown) {
      console.error("Failed to fetch analytics", error);
      const msg =
        error instanceof Error && error.message
          ? error.message
          : "Failed to load analytics data";
      toast.error(msg);
    } finally {
      setAnalyticsLoading(false);
      setIsRegenerating(false);
    }
  }, []);

  // Trigger loading analytics when assessment or class section changes
  useEffect(() => {
    if (selectedAssessmentId !== "all") {
      const asmt = assessments.find((a) => a.id === selectedAssessmentId) || null;
      setSelectedAssessment(asmt);
      fetchAnalytics(selectedAssessmentId, selectedClassId);
    } else {
      setSelectedAssessment(null);
      setAnalyticsData(null);
    }
  }, [selectedAssessmentId, selectedClassId, assessments, fetchAnalytics]);

  // Transform grade distribution for Recharts
  const gradeChartData = useMemo(() => {
    if (!analyticsData?.grade_distribution) return [];
    return Object.entries(analyticsData.grade_distribution).map(([grade, count]) => ({
      grade,
      count
    }));
  }, [analyticsData]);

  // Transform per-question average scores for Recharts
  const questionChartData = useMemo(() => {
    if (!analyticsData?.question_difficulty) return [];
    return analyticsData.question_difficulty.map(q => ({
      name: q.question_title.substring(0, 14) + (q.question_title.length > 14 ? "..." : ""),
      average: q.average_score,
      max: q.max_score
    }));
  }, [analyticsData]);

  // Transform Pass/Fail rate for PieChart
  const passPieData = useMemo(() => {
    if (!analyticsData) return [];
    const pass = analyticsData.pass_rate;
    return [
      { name: "Passing", value: pass, color: "#10b981" },
      { name: "Failing", value: Math.max(0, 100 - pass), color: "#f43f5e" }
    ];
  }, [analyticsData]);

  // Compute stats metrics
  const totalSubmissions = analyticsData?.total_submissions ?? 0;
  const pendingSubmissions = analyticsData?.pending_submissions ?? 0;
  const gradedCount = Math.max(0, totalSubmissions - pendingSubmissions);
  const aiCoverage = analyticsData?.ai_coverage ?? 100;

  return (
    <div className="w-full space-y-6 p-1 md:p-3 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="size-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Assessment Analytics</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-normal">
            Comprehensive pedagogical insights, score distribution analysis, and AI narrative observations.
          </p>
        </div>
        {selectedAssessment && (
          <Badge variant="outline" className="w-fit text-xs font-medium px-3 py-1 bg-card border-border/80">
            <FileText className="size-3.5 mr-1.5 text-primary" />
            {selectedAssessment.title}
          </Badge>
        )}
      </div>

      {/* Filters Bento Box */}
      <Card className="shadow-xs border border-border/60 bg-card/50 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Workspace
            </Label>
            <Select
              value={selectedWorkspaceId}
              onValueChange={setSelectedWorkspaceId}
            >
              <SelectTrigger className="h-9 text-xs rounded-lg border-border/80 bg-background">
                <SelectValue placeholder="All Workspaces" />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-lg">
                <SelectItem value="all" className="text-xs">All Workspaces</SelectItem>
                {workspaces.map((ws: any) => (
                  <SelectItem key={ws.id} value={ws.id} className="text-xs">
                    {ws.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Assessment
            </Label>
            <Select
              value={selectedAssessmentId}
              onValueChange={setSelectedAssessmentId}
            >
              <SelectTrigger className="h-9 text-xs rounded-lg border-border/80 bg-background">
                <SelectValue placeholder="Choose assessment..." />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-lg">
                <SelectItem value="all" className="text-xs">Select assessment...</SelectItem>
                {assessments.map((a: AssessmentSummary) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAssessmentId !== "all" && classes.length > 0 ? (
            <div>
              <Label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Class Section
              </Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
              >
                <SelectTrigger className="h-9 text-xs rounded-lg border-border/80 bg-background">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent className="rounded-lg shadow-lg">
                  <SelectItem value="all" className="text-xs">All Class Sections</SelectItem>
                  {classes.map((cls: any) => (
                    <SelectItem key={cls.class_id} value={cls.class_id} className="text-xs">
                      {cls.class_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="hidden md:flex items-end text-xs text-muted-foreground/60 italic pb-2">
              Select an assessment to filter by class sections
            </div>
          )}
        </div>
      </Card>

      {/* Main Bento Analytics Area */}
      {loading || analyticsLoading ? (
        <AnalyticsBentoSkeleton />
      ) : !selectedAssessment ? (
        <Card className="border border-dashed border-border/80 bg-card/30 rounded-xl p-12 text-center space-y-3">
          <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Layers className="size-6" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">No Assessment Selected</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Choose an assessment from the dropdown above to inspect class performance metrics, difficulty distribution, and AI insights.
          </p>
        </Card>
      ) : !analyticsData ? (
        <Card className="border border-border/60 bg-card/30 rounded-xl p-10 text-center text-xs text-muted-foreground italic">
          No analytics records found for the selected assessment criteria.
        </Card>
      ) : (
        <div className="space-y-6">
          {/* 4 Primary KPI Bento Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Class Average */}
            <Card className="p-4 border border-border/60 bg-card/50 rounded-xl space-y-2 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Class Average</span>
                <TrendingUp className="size-4 text-emerald-500" />
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">
                  {analyticsData.class_average}%
                </p>
                <div className="text-[11px] text-muted-foreground font-mono">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">H: {analyticsData.highest_score}%</span>
                  <span className="mx-1">•</span>
                  <span className="text-rose-600 dark:text-rose-400 font-medium">L: {analyticsData.lowest_score}%</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground font-normal">
                Overall score average across cohort
              </p>
            </Card>

            {/* KPI 2: Pass Rate */}
            <Card className="p-4 border border-border/60 bg-card/50 rounded-xl space-y-2 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Pass Rate</span>
                <CheckCircle2 className="size-4 text-indigo-500" />
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">
                  {analyticsData.pass_rate}%
                </p>
                <Badge variant="secondary" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none">
                  {analyticsData.pass_rate >= 70 ? "Healthy" : "Attention Required"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground font-normal">
                Students meeting passing threshold
              </p>
            </Card>

            {/* KPI 3: Submissions & Grading Progress */}
            <Card className="p-4 border border-border/60 bg-card/50 rounded-xl space-y-2 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">Grading Status</span>
                <Award className="size-4 text-blue-500" />
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">
                  {gradedCount} / {totalSubmissions}
                </p>
                {pendingSubmissions > 0 ? (
                  <Badge variant="secondary" className="text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-none">
                    {pendingSubmissions} pending
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none">
                    All Graded
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-normal">
                Evaluated student submissions
              </p>
            </Card>

            {/* KPI 4: AI & Security Integrity */}
            <Card className="p-4 border border-border/60 bg-card/50 rounded-xl space-y-2 hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium">AI & Integrity</span>
                <ShieldAlert className="size-4 text-violet-500" />
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-semibold font-mono tracking-tight text-foreground">
                  {aiCoverage}%
                </p>
                {analyticsData.integrity_issues_count > 0 ? (
                  <Badge variant="secondary" className="text-[10px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border-none">
                    {analyticsData.integrity_issues_count} flagged
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none">
                    0 Flags
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-normal">
                AI assistance coverage & integrity flags
              </p>
            </Card>
          </div>

          {/* Visual Charts Bento Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Donut Chart: Cohort Pass/Fail Split */}
            <Card className="border border-border/60 bg-card/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground">Cohort Outcome Split</h3>
                <span className="text-[11px] text-muted-foreground font-mono">{analyticsData.pass_rate}% Pass</span>
              </div>
              <div className="h-48 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={passPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={72}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {passPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(v) => `${v}%`} 
                      contentStyle={{ backgroundColor: "var(--background)", borderRadius: "8px", borderColor: "var(--border)", fontSize: "12px" }}
                    />
                    <Legend verticalAlign="bottom" height={28} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Bar Chart: Grade Distribution */}
            <Card className="border border-border/60 bg-card/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground">Grade Distribution</h3>
                <span className="text-[11px] text-muted-foreground">Freq Count</span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={gradeChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.15)" />
                    <XAxis dataKey="grade" stroke="currentColor" className="text-[10px] text-muted-foreground" tickLine={false} axisLine={false} />
                    <YAxis stroke="currentColor" className="text-[10px] text-muted-foreground" tickLine={false} axisLine={false} allowDecimals={false} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "var(--background)", borderRadius: "8px", borderColor: "var(--border)", fontSize: "12px" }} />
                    <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Bar Chart: Per-Question Averages */}
            <Card className="border border-border/60 bg-card/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground">Per-Question Scores</h3>
                <span className="text-[11px] text-muted-foreground">Avg Marks</span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={questionChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150,150,150,0.15)" />
                    <XAxis dataKey="name" stroke="currentColor" className="text-[9px] text-muted-foreground" tickLine={false} axisLine={false} />
                    <YAxis stroke="currentColor" className="text-[10px] text-muted-foreground" tickLine={false} axisLine={false} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "var(--background)", borderRadius: "8px", borderColor: "var(--border)", fontSize: "12px" }} />
                    <Bar dataKey="average" fill="#3b82f6" name="Average Score" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Deep Trace & AI Narrative Bento Row */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Question Difficulty Trace */}
            <Card className="border border-border/60 bg-card/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-xs font-semibold text-foreground">Question Difficulty Trace</h3>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {analyticsData.question_difficulty?.length || 0} Questions
                </span>
              </div>
              <div className="border border-border/40 rounded-lg overflow-hidden bg-background/50">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="h-9 hover:bg-transparent">
                      <TableHead className="text-[11px] font-medium pl-3">Question Title</TableHead>
                      <TableHead className="text-[11px] font-medium">Type</TableHead>
                      <TableHead className="text-[11px] font-medium">Avg Marks</TableHead>
                      <TableHead className="text-[11px] font-medium text-right pr-3">Difficulty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {(analyticsData.question_difficulty ?? []).map((q, i) => (
                      <TableRow key={i} className="h-9 hover:bg-muted/30 transition-colors">
                        <TableCell className="font-normal pl-3 max-w-[180px] truncate" title={q.question_title}>
                          {q.question_title}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-[10px]">
                          {q.question_type.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="font-mono text-foreground font-medium">
                          {q.average_score} / {q.max_score}
                        </TableCell>
                        <TableCell className="text-right pr-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-medium px-2 py-0.5 border shadow-none",
                              q.difficulty === "Easy"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : q.difficulty === "Medium"
                                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                            )}
                          >
                            {q.difficulty}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* AI Performance Narrative Insights */}
            <Card className="border border-border/60 bg-card/50 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                    <Sparkles className="size-4" />
                  </div>
                  <h3 className="text-xs font-semibold text-foreground">AI Narrative & Cohort Insights</h3>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRegenerating}
                  onClick={() => fetchAnalytics(selectedAssessmentId, selectedClassId, true)}
                  className="h-7 text-[11px] font-medium text-primary hover:bg-primary/5 flex items-center gap-1.5 rounded-lg px-2.5"
                >
                  {isRegenerating ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  Regenerate
                </Button>
              </div>

              {pendingSubmissions > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>Grading in progress ({pendingSubmissions} pending). AI narrative will update when all marks are finalized.</span>
                </div>
              )}

              {analyticsData.ai_narrative ? (
                <div className="space-y-4 text-xs leading-relaxed">
                  <p className="text-muted-foreground italic bg-muted/20 p-3.5 rounded-lg border border-border/40">
                    &quot;{analyticsData.ai_narrative}&quot;
                  </p>

                  {/* Concept Weaknesses */}
                  {analyticsData.weak_topics && analyticsData.weak_topics.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Identified Concept Weaknesses:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {analyticsData.weak_topics.map((t, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border-none">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Cohort Observations */}
                  {analyticsData.insights && analyticsData.insights.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-medium text-foreground">Cohort Observations:</span>
                      <ul className="space-y-1 pl-1 text-muted-foreground">
                        {analyticsData.insights.map((insight, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs">
                            <span className="size-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                            <span>{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommended Pedagogical Interventions */}
                  {analyticsData.recommended_interventions && analyticsData.recommended_interventions.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-border/40">
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Recommended Interventions:</span>
                      <ul className="space-y-1 pl-1 text-emerald-700 dark:text-emerald-400">
                        {analyticsData.recommended_interventions.map((recommendation, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs">
                            <Check className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                            <span>{recommendation}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 space-y-3 bg-muted/20 rounded-xl border border-dashed border-border/60">
                  <p className="text-xs text-muted-foreground italic">
                    AI narrative summary not generated yet for this assessment.
                  </p>
                  <Button
                    size="sm"
                    disabled={isRegenerating}
                    onClick={() => fetchAnalytics(selectedAssessmentId, selectedClassId, true)}
                    className="h-8 text-xs font-medium"
                  >
                    <Sparkles className="size-3.5 mr-1.5" /> Generate AI Insights
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
