"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BarChart, BrainCircuit, TrendingUp, CheckCircle2, AlertTriangle, Check } from "lucide-react";
import { assessmentApi } from "@/lib/api/assessment";
import { gradingApi } from "@/lib/api/grading";
import { toast } from "sonner";
import { AssessmentSummary, AnalyticsData } from "../types";

export default function AssessmentAnalyticsPage() {
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("all");
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentSummary | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    async function loadAssessments() {
      try {
        const res = await assessmentApi.getAssessments({ status: "PUBLISHED" });
        setAssessments(res.items || []);
      } catch (err: any) {
        toast.error("Failed to load assessments context");
      } finally {
        setLoading(false);
      }
    }
    loadAssessments();
  }, []);

  const fetchAnalytics = useCallback(async (asmtId: string) => {
    if (!asmtId) {
      toast.error("Invalid assessment ID");
      return;
    }

    setAnalyticsLoading(true);
    try {
      const res = await gradingApi.getAssessmentAnalytics(asmtId);
      setAnalyticsData(res);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("404")) {
        toast.error("Analytics data not found for this assessment");
      } else {
        console.error("Failed to fetch analytics", error);
        toast.error("Failed to load analytics data");
      }
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAssessmentId === "all") {
      setSelectedAssessment(null);
      setAnalyticsData(null);
      return;
    }

    const asmt = assessments.find((a) => a.id === selectedAssessmentId) || null;
    setSelectedAssessment(asmt);
    if (asmt) {
      fetchAnalytics(asmt.id);
    }
  }, [selectedAssessmentId, assessments, fetchAnalytics]);

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      <div className="border-b pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Assessment Analytics</h1>
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
          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm p-4">
            <Label className="text-xs font-semibold text-muted-foreground/80 block mb-1.5">
              Select Assessment context
            </Label>
            <Select
              value={selectedAssessmentId}
              onValueChange={setSelectedAssessmentId}
            >
              <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                <SelectValue placeholder="Choose assessment..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Choose an assessment...</SelectItem>
                {assessments.map((a: AssessmentSummary) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart className="size-5 text-primary" />
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
                <BarChart className="size-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">
                  Select an assessment to view deep pedagogical analytics.
                </p>
              </div>
            ) : analyticsLoading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in duration-500">
                  {[
                    {
                      label: "Class Average Score",
                      value: `${analyticsData.class_average}%`,
                      icon: TrendingUp,
                      color: "text-primary",
                    },
                    {
                      label: "Highest Evaluation",
                      value: `${analyticsData.highest_score}%`,
                      icon: CheckCircle2,
                      color: "text-emerald-600",
                    },
                    {
                      label: "Lowest Evaluation",
                      value: `${analyticsData.lowest_score}%`,
                      icon: AlertTriangle,
                      color: "text-rose-600",
                    },
                    {
                      label: "Evaluation Pass Rate",
                      value: `${analyticsData.pass_rate}%`,
                      icon: Check,
                      color: "text-indigo-600",
                    },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="p-4 border border-border/50 rounded-xl bg-background/50 space-y-1 shadow-sm"
                    >
                      <div className="flex items-center justify-between opacity-60">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                          {stat.label}
                        </span>
                        <stat.icon className={cn("size-3.5", stat.color)} />
                      </div>
                      <p
                        className={cn(
                          "text-2xl font-bold tracking-tight",
                          stat.color,
                        )}
                      >
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
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
                          {analyticsData.question_difficulty.map((q, i) => (
                            <TableRow
                              key={i}
                              className="h-10 hover:bg-muted/5 transition-colors border-border/10"
                            >
                              <TableCell className="font-bold pl-4 max-w-[200px] truncate">
                                {q.question_title}
                              </TableCell>
                              <TableCell className="capitalize text-muted-foreground/80 font-medium">
                                {q.question_type
                                  .replace("_", " ")
                                  .toLowerCase()}
                              </TableCell>
                              <TableCell className="font-bold text-foreground/70">
                                {q.average_score} / {q.max_score}
                              </TableCell>
                              <TableCell className="text-right pr-4">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] font-bold px-2 py-0 h-5",
                                    q.difficulty === "Easy"
                                      ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20"
                                      : q.difficulty === "Medium"
                                        ? "bg-amber-500/5 text-amber-600 border-amber-500/20"
                                        : "bg-rose-500/5 text-rose-600 border-rose-500/20",
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
                      AI Performance Summary
                    </h4>
                    <div className="p-5 rounded-xl border border-primary/20 bg-primary/[0.02] space-y-3 text-xs leading-relaxed text-foreground/80 shadow-sm">
                      <div className="flex items-center gap-2 border-b border-primary/10 pb-2 mb-2">
                        <BrainCircuit className="size-4 text-primary" />
                        <span className="font-bold text-primary uppercase tracking-widest">
                          Narrative Analytics
                        </span>
                      </div>
                      {analyticsData.ai_narrative ? (
                        <p className="font-medium italic leading-relaxed whitespace-pre-wrap">
                          {analyticsData.ai_narrative}
                        </p>
                      ) : (
                        <p className="italic text-muted-foreground/60 text-center py-6">
                          AI narrative processing incomplete for this
                          assessment.
                        </p>
                      )}
                      <div className="pt-2 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-primary/5"
                        >
                          Regenerate Narrative
                        </Button>
                      </div>
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

// Simple loader helper
function Loader2({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}
