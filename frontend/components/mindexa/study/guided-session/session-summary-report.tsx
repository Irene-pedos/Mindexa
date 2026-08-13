"use client";

import React from "react";
import {
  Trophy,
  Flame,
  TrendingUp,
  Sparkles,
  ArrowRight,
  BookOpen,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { StudySession, KnowledgeCheckReport } from "@/lib/api/study-planner";

interface SessionSummaryReportProps {
  session: StudySession;
  report?: KnowledgeCheckReport | null;
  onReturnToPlanner: () => void;
}

export function SessionSummaryReport({
  session,
  report,
  onReturnToPlanner,
}: SessionSummaryReportProps) {
  return (
    <Card className="w-full border border-border bg-card rounded-2xl overflow-hidden space-y-6 shadow-xs animate-in fade-in duration-300">
      {/* Clean, Non-Gradient Header */}
      <CardHeader className="border-b border-border/60 bg-background px-6 sm:px-8 py-6 text-center space-y-3">
        <div className="mx-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
          <Trophy className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span>Guided Session Completed</span>
        </div>
        
        <div className="space-y-1">
          <CardTitle className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {session.topic}
          </CardTitle>
          {session.title && (
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">
              {session.title}
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-4 sm:px-6 md:px-8 space-y-6">
        {/* Responsive Stats Row (1-col on mobile, 3-col on sm/md) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/30 transition-colors text-center space-y-1 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
              <Flame className="size-3.5 text-amber-500" /> Streak Status
            </span>
            <p className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-1">
              <CheckCircle2 className="size-4 text-emerald-500 inline" /> Active
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/30 transition-colors text-center space-y-1 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
              <TrendingUp className="size-3.5 text-emerald-500" /> Knowledge Check
            </span>
            <p className="text-lg sm:text-xl font-bold text-foreground">
              {report ? `${Math.round(report.score_percentage)}%` : "Completed"}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/30 transition-colors text-center space-y-1 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
              <Clock className="size-3.5 text-primary" /> Session Time
            </span>
            <p className="text-lg sm:text-xl font-bold text-foreground">
              {session.duration_minutes}m
            </p>
          </div>
        </div>

        {/* AI Session Summary Report */}
        {session.session_summary_text && (
          <div className="p-4 sm:p-6 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="size-4" /> AI Session Takeaways & Summary
            </h4>
            <div className="text-xs leading-relaxed text-foreground/90 font-sans">
              <RichMessageRenderer
                content={(() => {
                  const raw = session.session_summary_text.trim();
                  if (raw.startsWith("{") && raw.endsWith("}")) {
                    const tryParseJson = (value: string) => {
                      try {
                        return JSON.parse(value);
                      } catch {
                        return null;
                      }
                    };

                    const data =
                      tryParseJson(raw) ?? tryParseJson(raw.replace(/'/g, '"'));
                    if (data && typeof data === "object") {
                      const parts = [];
                      if (
                        data.key_takeaways &&
                        Array.isArray(data.key_takeaways)
                      ) {
                        parts.push(
                          "**Key Takeaways:**\n" +
                            data.key_takeaways
                              .map((t: string) => `- ${t}`)
                              .join("\n"),
                        );
                      }
                      if (
                        data.concepts_covered &&
                        Array.isArray(data.concepts_covered)
                      ) {
                        parts.push(
                          "**Concepts Covered:** " +
                            data.concepts_covered
                              .map((c: string) => `\`${c}\``)
                              .join(", "),
                        );
                      }
                      if (
                        data.common_mistakes_to_avoid &&
                        Array.isArray(data.common_mistakes_to_avoid)
                      ) {
                        parts.push(
                          "**Common Pitfalls to Avoid:**\n" +
                            data.common_mistakes_to_avoid
                              .map((m: string) => `- ${m}`)
                              .join("\n"),
                        );
                      }
                      if (
                        data.recommendations_for_future_revision &&
                        Array.isArray(data.recommendations_for_future_revision)
                      ) {
                        parts.push(
                          "**Recommendations for Revision:**\n" +
                            data.recommendations_for_future_revision
                              .map((r: string) => `- ${r}`)
                              .join("\n"),
                        );
                      }
                      if (parts.length > 0) return parts.join("\n\n");
                    }
                  }
                  return raw;
                })()}
              />
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="px-4 sm:px-6 md:px-8 py-5 border-t border-border/60 bg-muted/10 flex justify-center">
        <Button
          onClick={onReturnToPlanner}
          className="w-full sm:w-auto text-xs font-semibold px-8 h-10 rounded-xl gap-2 shadow-xs cursor-pointer"
        >
          Return to Learning Workspace <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
