// components/mindexa/dashboard/recent-results.tsx
"use client";

import React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Award,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  FileCheck,
} from "lucide-react";
import { StudentRecentResult } from "@/lib/api/student";
import { getResultLifecycleSummary } from "@/lib/grading-architecture";
import { cn } from "@/lib/utils";

interface RecentResultsProps {
  results?: StudentRecentResult[];
}

export function RecentResults({ results = [] }: RecentResultsProps) {
  const topResults = results.slice(0, 4);

  return (
    <Card className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
      <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/40 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <Award className="size-3.5" />
          </div>
          <div>
            <CardTitle className="text-xs font-semibold text-foreground tracking-tight">
              Recent Results & Release Status
            </CardTitle>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs font-medium px-2 text-primary hover:text-primary gap-1"
          asChild
        >
          <Link href="/student/results">
            All Results <ArrowRight className="size-3" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 space-y-2.5">
        {topResults.length > 0 ? (
          <div className="space-y-2">
            {topResults.map((res, i) => {
              const summary = getResultLifecycleSummary(res as any);
              const isTerminated = summary.tone === "destructive";
              const isPending = summary.tone === "warning";

              return (
                <Link
                  key={res.id || i}
                  href={`/student/results/${res.id}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background/80 hover:bg-muted/30 transition-all gap-3 group"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    {/* Top line: Course code & Date */}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {res.course_code && (
                        <span className="font-semibold text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-foreground/80">
                          {res.course_code}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="size-3 text-muted-foreground/70 shrink-0" />
                        {res.released_at
                          ? new Date(res.released_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Pending release"}
                      </span>
                    </div>

                    {/* Assessment title */}
                    <div className="text-xs sm:text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {res.assessment_title}
                    </div>

                    {/* Lifecycle status */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md",
                          isTerminated
                            ? "bg-destructive/10 text-destructive border border-destructive/20 font-semibold"
                            : isPending
                              ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                        )}
                      >
                        {isTerminated ? (
                          <AlertCircle className="size-2.5 shrink-0" />
                        ) : (
                          <CheckCircle2 className="size-2.5 shrink-0" />
                        )}
                        <span className="truncate">{summary.label}</span>
                      </span>
                    </div>
                  </div>

                  {/* Right side: Score & Grade */}
                  <div className="text-right shrink-0 flex flex-col items-end justify-center space-y-1">
                    <div className="flex items-baseline gap-1">
                      <span
                        className={cn(
                          "text-base sm:text-lg font-bold tabular-nums tracking-tight",
                          isTerminated
                            ? "text-destructive"
                            : typeof res.percentage === "number" && res.percentage >= 70
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-foreground"
                        )}
                      >
                        {typeof res.percentage === "number" ? `${res.percentage}%` : "--"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {res.letter_grade ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                            res.letter_grade.startsWith("A") && "bg-primary/10 text-primary border-primary/20",
                            res.letter_grade.startsWith("B") && "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                            res.letter_grade.startsWith("F") && "bg-destructive/10 text-destructive border-destructive/20"
                          )}
                        >
                          {res.letter_grade}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded">
                          Graded
                        </Badge>
                      )}
                      <ArrowRight className="size-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="py-8 px-4 text-center rounded-xl border border-dashed border-border/70 bg-muted/10 space-y-2.5">
            <div className="size-9 rounded-full bg-muted/30 flex items-center justify-center mx-auto text-muted-foreground">
              <FileCheck className="size-4.5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-foreground">
                No Results Released Yet
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Completed assessment results will appear here once automated scoring and lecturer evaluations are finalized.
              </p>
            </div>
            <div className="pt-1">
              <Button asChild variant="outline" size="sm" className="h-7.5 text-xs font-medium rounded-lg border-border/70">
                <Link href="/student/results">View Results Registry</Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
