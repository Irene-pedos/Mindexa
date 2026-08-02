"use client";

import React from "react";
import { CheckCircle2, Trophy, Flame, TrendingUp, Sparkles, ArrowRight, BookOpen } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
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
    <Card className="border-border/70 bg-card shadow-2xl rounded-2xl overflow-hidden max-w-3xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-400">
      <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/10 via-indigo-500/10 to-emerald-500/10 px-8 py-8 text-center">
        <div className="mx-auto size-20 rounded-full bg-gradient-to-tr from-primary to-indigo-600 flex items-center justify-center text-primary-foreground shadow-lg mb-4">
          <Trophy className="size-10" />
        </div>
        <Badge variant="outline" className="mx-auto text-xs font-bold border-primary/30 text-primary bg-primary/10 px-3 py-1 mb-2">
          Guided Session Completed
        </Badge>
        <CardTitle className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
          {session.topic}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1 font-medium">{session.title}</p>
      </CardHeader>

      <CardContent className="px-8 space-y-6">
        {/* Highlight Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 text-center space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
              <Flame className="size-3.5 text-amber-500" /> Streak Active
            </span>
            <p className="text-xl font-black text-foreground">Done</p>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 text-center space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
              <TrendingUp className="size-3.5 text-emerald-500" /> Knowledge Check
            </span>
            <p className="text-xl font-black text-foreground">
              {report ? `${Math.round(report.score_percentage)}%` : "Completed"}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 text-center space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
              <BookOpen className="size-3.5 text-primary" /> Session Time
            </span>
            <p className="text-xl font-black text-foreground">{session.duration_minutes}m</p>
          </div>
        </div>

        {/* AI Session Summary Report */}
        {session.session_summary_text && (
          <div className="p-6 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="size-4" /> AI Session Takeaways & Summary
            </h4>
            <div className="text-xs leading-relaxed text-foreground/90 font-sans">
              <RichMessageRenderer
                content={(() => {
                  const raw = session.session_summary_text.trim();
                  if (raw.startsWith("{") && raw.endsWith("}")) {
                    try {
                      // Attempt to parse JSON / python dict representation
                      const jsonStr = raw.replace(/'/g, '"');
                      const data = JSON.parse(jsonStr);
                      const parts = [];
                      if (data.key_takeaways && Array.isArray(data.key_takeaways)) {
                        parts.push("**Key Takeaways:**\n" + data.key_takeaways.map((t: string) => `- ${t}`).join("\n"));
                      }
                      if (data.concepts_covered && Array.isArray(data.concepts_covered)) {
                        parts.push("**Concepts Covered:** " + data.concepts_covered.map((c: string) => `\`${c}\``).join(", "));
                      }
                      if (data.common_mistakes_to_avoid && Array.isArray(data.common_mistakes_to_avoid)) {
                        parts.push("**Common Pitfalls to Avoid:**\n" + data.common_mistakes_to_avoid.map((m: string) => `- ${m}`).join("\n"));
                      }
                      if (data.recommendations_for_future_revision && Array.isArray(data.recommendations_for_future_revision)) {
                        parts.push("**Recommendations for Revision:**\n" + data.recommendations_for_future_revision.map((r: string) => `- ${r}`).join("\n"));
                      }
                      if (parts.length > 0) return parts.join("\n\n");
                    } catch (e) {
                      // Return raw if JSON parsing fails
                    }
                  }
                  return raw;
                })()}
              />
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="px-8 py-6 border-t border-border/50 flex justify-center">
        <Button
          onClick={onReturnToPlanner}
          className="w-full md:w-auto text-xs font-bold px-8 h-11 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 text-primary-foreground shadow-lg gap-2"
        >
          Return to Learning Workspace <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
