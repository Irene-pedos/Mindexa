"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  BarChart as BarChartIcon,
  BrainCircuit,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Check,
  Loader2,
  Users,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Award
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
        
        // Reset selected assessment if not in the new list
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
      name: q.question_title.substring(0, 15) + (q.question_title.length > 15 ? "..." : ""),
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
      { name: "Failing", value: 100 - pass, color: "#f43f5e" }
    ];
  }, [analyticsData]);

  // Compute stats metrics
  const totalSubmissions = analyticsData?.total_submissions ?? 0;
  const pendingSubmissions = analyticsData?.pending_submissions ?? 0;
  const gradedCount = totalSubmissions - pendingSubmissions;
  const aiCoverage = analyticsData?.ai_coverage ?? 100;

  return (
    <div className="w-full space-y-4 p-1 md:p-2 animate-in fade-in duration-200">
      <div className="border-b pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Assessment Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          View deep pedagogical analytics, average performance marks, difficulty trends, and AI narrative summaries.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center space-y-2">
          <Loader2 className="size-6 text-primary animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground font-medium">Loading analytics context...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filters Row */}
          <Card className="shadow-none border border-border bg-card/30 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground/80 block mb-1.5">
                Filter by Workspace
              </Label>
              <Select
                value={selectedWorkspaceId}
                onValueChange={setSelectedWorkspaceId}
              >
                <SelectTrigger className="h-9 text-xs rounded-lg border-border bg-background">
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
              <Label className="text-xs font-semibold text-muted-foreground/80 block mb-1.5">
                Select Assessment
              </Label>
              <Select
                value={selectedAssessmentId}
                onValueChange={setSelectedAssessmentId}
              >
                <SelectTrigger className="h-9 text-xs rounded-lg border-border bg-background">
                  <SelectValue placeholder="Choose assessment..." />
                </SelectTrigger>
                <SelectContent className="rounded-lg shadow-lg">
                  <SelectItem value="all" className="text-xs">Choose an assessment...</SelectItem>
                  {assessments.map((a: AssessmentSummary) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAssessmentId !== "all" && classes.length > 0 && (
              <div>
                <Label className="text-xs font-semibold text-muted-foreground/80 block mb-1.5">
                  Filter by Class Section
                </Label>
                <Select
                  value={selectedClassId}
                  onValueChange={setSelectedClassId}
                >
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background hover:bg-background/80 transition-colors">
                    <SelectValue placeholder="All Sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {classes.map((cls: any) => (
                      <SelectItem key={cls.class_id} value={cls.class_id}>
                        {cls.class_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>

          <Card className="shadow-none border border-border/50 bg-card/30 backdrop-blur-sm rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChartIcon className="size-5 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Class Performance Analytics
                </h3>
              </div>
              {selectedAssessment && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-bold uppercase tracking-widest bg-primary/5 text-primary border-primary/20"
                >
                  {selectedAssessment.title}
                </Badge>
              )}
            </div>

            {!selectedAssessment ? (
              <div className="py-20 text-center space-y-3 bg-muted/10 border border-dashed rounded-xl">
                <BarChartIcon className="size-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">
                  Select an assessment to view deep pedagogical analytics.
                </p>
              </div>
            ) : analyticsLoading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Skeleton className="h-64 w-full rounded-xl" />
                  <Skeleton className="h-64 w-full rounded-xl" />
                </div>
              </div>
            ) : !analyticsData ? (
              <div className="py-20 text-center text-sm font-medium text-muted-foreground italic">
                No analytics data available for this assessment.
              </div>
            ) : (
              <>
                {/* 8 KPIs Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-500">
                  {[
                    {
                      label: "Class Average Score",
                      value: `${analyticsData.class_average}%`,
                      icon: TrendingUp,
                      color: "text-primary bg-primary/5 border-primary/10",
                    },
                    {
                      label: "Highest Evaluation",
                      value: `${analyticsData.highest_score}%`,
                      icon: CheckCircle2,
                      color: "text-emerald-600 bg-emerald-500/5 border-emerald-500/10",
                    },
                    {
                      label: "Lowest Evaluation",
                      value: `${analyticsData.lowest_score}%`,
                      icon: AlertTriangle,
                      color: "text-rose-600 bg-rose-500/5 border-rose-500/10",
                    },
                    {
                      label: "Evaluation Pass Rate",
                      value: `${analyticsData.pass_rate}%`,
                      icon: Check,
                      color: "text-indigo-600 bg-indigo-500/5 border-indigo-500/10",
                    },
                    {
                      label: "Awaiting Review",
                      value: `${pendingSubmissions} attempts`,
                      icon: RefreshCw,
                      color: "text-amber-600 bg-amber-500/5 border-amber-500/10",
                    },
                    {
                      label: "Graded Submissions",
                      value: `${gradedCount} / ${totalSubmissions}`,
                      icon: Award,
                      color: "text-blue-600 bg-blue-500/5 border-blue-500/10",
                    },
                    {
                      label: "AI Grading Coverage",
                      value: `${aiCoverage}%`,
                      icon: Sparkles,
                      color: "text-violet-600 bg-violet-500/5 border-violet-500/10",
                    },
                    {
                      label: "Security Hold / Flags",
                      value: `${analyticsData.integrity_issues_count} flagged`,
                      icon: ShieldAlert,
                      color: "text-red-600 bg-red-500/5 border-red-500/10",
                    },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-4 border rounded-xl space-y-1 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow-md",
                        stat.color
                      )}
                    >
                      <div className="flex items-center justify-between opacity-75">
                        <span className="text-[10px] uppercase font-bold tracking-wider">
                          {stat.label}
                        </span>
                        <stat.icon className="size-4 shrink-0" />
                      </div>
                      <p className="text-xl font-extrabold tracking-tight font-mono">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Recharts Chart Visualizations Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
                  {/* Score Distribution Pie Chart */}
                  <Card className="border border-border/50 shadow-sm p-4 bg-background/50 rounded-xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Pass / Fail Rate Cohort Split
                      </h4>
                      <div className="h-44 w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={passPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={70}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {passPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <RechartsTooltip formatter={(v) => `${v}%`} />
                            <Legend verticalAlign="bottom" height={24} iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </Card>

                  {/* Grade Distribution Bar Chart */}
                  <Card className="border border-border/50 shadow-sm p-4 bg-background/50 rounded-xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Grade Distribution Frequencies
                      </h4>
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsBarChart data={gradeChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(228,228,231,0.2)" />
                            <XAxis dataKey="grade" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                            <RechartsTooltip />
                            <Bar dataKey="count" fill="var(--color-primary, #6366f1)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                          </RechartsBarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </Card>

                  {/* Question Difficulties Bar Chart */}
                  <Card className="border border-border/50 shadow-sm p-4 bg-background/50 rounded-xl flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Per-Question Average Score
                      </h4>
                      <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsBarChart data={questionChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(228,228,231,0.2)" />
                            <XAxis dataKey="name" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
                            <RechartsTooltip />
                            <Bar dataKey="average" fill="#3b82f6" name="Average Marks" radius={[4, 4, 0, 0]} maxBarSize={20} />
                          </RechartsBarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Table and Narrative Row */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-2">
                  {/* Question Difficulty analysis */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Question Difficulty Trace
                    </h4>
                    <div className="border border-border/50 rounded-xl overflow-hidden bg-background shadow-sm">
                      <Table>
                        <TableHeader className="bg-muted/15 border-b border-border/40">
                          <TableRow className="h-9 hover:bg-transparent">
                            <TableHead className="text-[10px] font-bold uppercase pl-4">
                              Question
                            </TableHead>
                            <TableHead className="text-[10px] font-bold uppercase">
                              Type
                            </TableHead>
                            <TableHead className="text-[10px] font-bold uppercase">
                              Avg Score
                            </TableHead>
                            <TableHead className="text-[10px] font-bold uppercase text-right pr-4">
                              Difficulty
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          {(analyticsData.question_difficulty ?? []).map((q, i) => (
                            <TableRow
                              key={i}
                              className="h-10 hover:bg-muted/5 transition-colors border-border/10"
                            >
                              <TableCell className="font-bold pl-4 max-w-[200px] truncate" title={q.question_title}>
                                {q.question_title}
                              </TableCell>
                              <TableCell className="text-muted-foreground/80 font-semibold font-mono text-[10px]">
                                {q.question_type.replace(/_/g, " ").toUpperCase()}
                              </TableCell>
                              <TableCell className="font-bold text-foreground/75 font-mono">
                                {q.average_score} / {q.max_score}
                              </TableCell>
                              <TableCell className="text-right pr-4">
                                <Badge
                                  className={cn(
                                    "text-[9px] font-bold px-2 py-0 h-5 border shadow-none",
                                    q.difficulty === "Easy"
                                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                      : q.difficulty === "Medium"
                                        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                        : "bg-rose-500/10 text-rose-600 border-rose-500/20",
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
                  </div>

                  {/* Narrative Summaries */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      AI Performance Summary & Insights
                    </h4>
                    <div className="p-5 rounded-xl border border-primary/20 bg-primary/[0.02] space-y-4 text-xs leading-relaxed text-foreground shadow-sm">
                      {pendingSubmissions > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2.5 py-1.5 font-semibold">
                          <AlertTriangle className="size-3.5 shrink-0" />
                          Pedagogical grading in progress ({pendingSubmissions} submissions remaining). AI insight summaries may be misleading or incomplete until all marks are finalised.
                        </div>
                      )}
                      <div className="flex items-center justify-between border-b border-primary/10 pb-2 mb-1">
                        <div className="flex items-center gap-2">
                          <BrainCircuit className="size-4 text-primary" />
                          <span className="font-bold text-primary uppercase tracking-widest text-[10px]">
                            Narrative Insights
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isRegenerating}
                          onClick={() => fetchAnalytics(selectedAssessmentId, selectedClassId, true)}
                          className="h-7 text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-primary/5 flex items-center gap-1.5 border border-primary/15 rounded-lg px-2"
                        >
                          {isRegenerating ? (
                            <Loader2 className="size-3 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="size-3 mr-1" />
                          )}
                          Regenerate
                        </Button>
                      </div>

                      {analyticsData.ai_narrative ? (
                        <div className="space-y-4">
                          <p className="font-medium italic leading-relaxed whitespace-pre-wrap text-foreground/80">
                            &quot;{analyticsData.ai_narrative}&quot;
                          </p>

                          {/* List of Insights / Interventions */}
                          {analyticsData.weak_topics && analyticsData.weak_topics.length > 0 && (
                            <div className="space-y-1 bg-muted/10 border p-2.5 rounded-lg">
                              <span className="font-bold text-amber-600 uppercase tracking-wide text-[9px]">Concept Weaknesses:</span>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {analyticsData.weak_topics.map((t, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-[9px] bg-amber-500/5 text-amber-600 border-amber-500/10">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {analyticsData.insights && analyticsData.insights.length > 0 && (
                            <div className="space-y-1">
                              <span className="font-bold text-primary uppercase tracking-wide text-[9px]">Key cohort observations:</span>
                              <ul className="list-disc pl-4 space-y-1 mt-1 text-[11px] text-muted-foreground">
                                {analyticsData.insights.map((insight, idx) => (
                                  <li key={idx} className="font-medium">{insight}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {analyticsData.recommended_interventions && analyticsData.recommended_interventions.length > 0 && (
                            <div className="space-y-1 pt-1 border-t border-border/40">
                              <span className="font-bold text-emerald-600 uppercase tracking-wide text-[9px]">Recommended Pedagogical Interventions:</span>
                              <ul className="list-disc pl-4 space-y-1 mt-1 text-[11px] text-emerald-600">
                                {analyticsData.recommended_interventions.map((recommendation, idx) => (
                                  <li key={idx} className="font-semibold">{recommendation}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-10 space-y-3">
                          <p className="italic text-muted-foreground/60">
                            AI narrative processing incomplete for this assessment.
                          </p>
                          <Button
                            size="sm"
                            disabled={isRegenerating}
                            onClick={() => fetchAnalytics(selectedAssessmentId, selectedClassId, true)}
                            className="h-8 font-bold text-xs"
                          >
                            <Sparkles className="size-3.5 mr-1.5" /> Initialize AI Narrative
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
