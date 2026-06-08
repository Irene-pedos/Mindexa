// app/student/results/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  CheckCircle,
  Clock,
  Award,
  AlertTriangle,
  ArrowLeft,
  Download,
  XCircle,
  Info,
  HelpCircle,
  MessageSquare,
  Printer,
  Target,
  ArrowUpCircle,
  FileText,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resultApi } from "@/lib/api/result";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  getResultLifecycleSummary,
  getAssessmentCategory,
} from "@/lib/grading-architecture";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ResultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    async function loadResult() {
      try {
        const data = await resultApi.getResultByAttempt(attemptId);
        setResult(data);
      } catch (err: any) {
        if (!err.message?.toLowerCase().includes("available")) {
          console.error("Failed to load results", err);
          toast.error("Failed to load results registry trace.");
        }
      } finally {
        setLoading(false);
      }
    }
    loadResult();
  }, [attemptId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-3 py-4 px-4">
        <Skeleton className="h-6 w-32 rounded-md" />
        <Card className="rounded-lg overflow-hidden shadow-none border">
          <CardHeader className="text-center py-6">
            <Skeleton className="mx-auto h-10 w-10 rounded-full" />
            <Skeleton className="h-5 w-1/2 mx-auto mt-3 rounded-md" />
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <Skeleton className="h-12 w-24 mx-auto rounded-lg" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="py-20 text-center space-y-3 max-w-md mx-auto px-4">
        <div className="mx-auto size-10 bg-muted rounded-full flex items-center justify-center border-2 border-dashed">
          <HelpCircle className="size-5 text-muted-foreground/40" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight uppercase">
          Result Pending
        </h2>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
          Processing context trace.
        </p>
        <Button
          onClick={() => router.push("/student/results")}
          variant="outline"
          size="sm"
          className="h-8 px-6 rounded-md font-bold text-[10px] uppercase"
        >
          Registry
        </Button>
      </div>
    );
  }

  const score = result.total_score || 0;
  const maxScore = result.max_score || 100;
  const percentage = result.percentage || Math.round((score / maxScore) * 100);
  const isPending = result.graded_question_count < result.total_question_count;
  const lifecycle = getResultLifecycleSummary(result);
  const category = getAssessmentCategory(result);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-3 py-4 px-4 pb-20 print:p-0 print:max-w-full">
      <div className="flex items-center justify-between print:hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/student/results")}
          className="h-7 px-2 hover:bg-muted/50 rounded-md text-[10px] font-bold uppercase tracking-widest gap-1.5"
        >
          <ArrowLeft className="size-3" /> Registry
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="h-7 px-3 rounded-md font-bold text-[10px] uppercase border-border/60 gap-1.5"
          >
            <Printer className="size-3" /> Print
          </Button>
          <Badge
            variant={category === "VIOLATION" ? "destructive" : "outline"}
            className="text-[9px] uppercase font-bold h-7 px-2 border-muted-foreground/20 rounded-md"
          >
            {category === "VIOLATION"
              ? "TERMINATED"
              : result.letter_grade || lifecycle.label}
          </Badge>
        </div>
      </div>

      <Card className="border shadow-none overflow-hidden rounded-lg print:border-none">
        <CardHeader
          className={cn(
            "text-center py-6 border-b",
            category === "VIOLATION"
              ? "bg-red-50/30"
              : result.is_passing
                ? "bg-emerald-50/10"
                : "bg-red-50/10",
          )}
        >
          <div
            className={cn(
              "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-background shadow-sm",
              category === "VIOLATION"
                ? "bg-red-600 text-white"
                : result.is_passing
                  ? "bg-emerald-500 text-white"
                  : "bg-red-500 text-white",
            )}
          >
            {category === "VIOLATION" ? (
              <AlertTriangle className="size-6" />
            ) : result.is_passing ? (
              <CheckCircle className="size-6" />
            ) : (
              <XCircle className="size-6" />
            )}
          </div>
          <CardTitle className="text-xl font-bold tracking-tight uppercase px-4">
            {result.assessment_title}
          </CardTitle>
          <CardDescription className="text-[9px] mt-1 font-bold uppercase tracking-widest text-muted-foreground/60 leading-relaxed uppercase">
            {category === "VIOLATION"
              ? "Security Protocol Violation Detected."
              : result.is_passing
                ? "Proficiency achieved."
                : "Efficiency threshold not reached."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 p-5 md:p-8">
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="text-5xl font-bold tracking-tighter text-foreground">
                {score}
              </span>
              <span className="text-lg font-bold text-muted-foreground/30">
                / {maxScore}
              </span>
            </div>
            <div className="mt-4 w-full max-w-xs space-y-1">
              <div className="flex justify-between text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-0.5">
                <span>Performance</span>
                <span className="text-foreground/80">{percentage}%</span>
              </div>
              <Progress
                value={percentage}
                className="h-1 rounded-full bg-muted/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {[
              { icon: Clock, label: "Status", val: lifecycle.label },
              {
                icon: Award,
                label: "Recorded",
                val: result.released_at
                  ? format(new Date(result.released_at), "MMM d, yyyy")
                  : "LIVE",
              },
              {
                icon: Info,
                label: "Nodes",
                val: `${result.graded_question_count} / ${result.total_question_count}`,
              },
            ].map((item, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border bg-muted/5 flex flex-col items-center text-center space-y-0.5 hover:border-primary/10 transition-all"
              >
                <item.icon className="size-3.5 text-muted-foreground/40 mb-1" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  {item.label}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-tight text-foreground/80">
                  {item.val}
                </span>
              </div>
            ))}
          </div>

          <Separator className="bg-border/40" />

          {(result.feedback || result.strengths || result.weaknesses) && (
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 px-0.5">
                Pedagogical Guidance
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {result.feedback && (
                  <div className="col-span-full p-3.5 rounded-lg bg-primary/[0.02] border border-primary/10 space-y-1.5">
                    <div className="flex items-center gap-2 text-primary/60">
                      <MessageSquare className="size-3" />
                      <span className="text-[9px] font-bold uppercase tracking-widest">
                        Instructor Trace
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-foreground/80 leading-relaxed italic">
                      &quot;{result.feedback}&quot;
                    </p>
                  </div>
                )}
                {result.strengths && (
                  <div className="p-3.5 rounded-lg border bg-emerald-50/[0.02] border-emerald-100/50 space-y-1">
                    <div className="flex items-center gap-2 text-emerald-700/60">
                      <Target className="size-3" />
                      <span className="text-[9px] font-bold uppercase tracking-widest">
                        Proficiencies
                      </span>
                    </div>
                    <p className="text-[10px] font-medium text-emerald-900/70 leading-relaxed">
                      {result.strengths}
                    </p>
                  </div>
                )}
                {result.weaknesses && (
                  <div className="p-3.5 rounded-lg border bg-amber-50/[0.02] border-amber-100/50 space-y-1">
                    <div className="flex items-center gap-2 text-amber-700/60">
                      <ArrowUpCircle className="size-3" />
                      <span className="text-[9px] font-bold uppercase tracking-widest">
                        Growth Areas
                      </span>
                    </div>
                    <p className="text-[10px] font-medium text-amber-900/70 leading-relaxed">
                      {result.weaknesses}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                Audit Matrix
              </h3>
              <Badge
                variant="outline"
                className="text-[8px] font-bold uppercase tracking-widest border-muted-foreground/10 text-muted-foreground/40 h-4 rounded-sm"
              >
                Registry Breakdown
              </Badge>
            </div>

            <div className="space-y-2">
              {result.breakdowns?.map((item: any, idx: number) => (
                <div
                  key={item.id}
                  className={cn(
                    "p-4 rounded-lg border transition-all",
                    item.is_correct === true
                      ? "bg-emerald-50/[0.02] border-emerald-100/30"
                      : item.is_correct === false
                        ? "bg-red-50/[0.02] border-red-100/30"
                        : "bg-muted/[0.02] border-border/60",
                  )}
                >
                  <div className="flex items-start justify-between gap-4 mb-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "size-5 rounded flex items-center justify-center text-[9px] font-bold",
                          item.is_correct === true
                            ? "bg-emerald-500 text-white"
                            : item.is_correct === false
                              ? "bg-red-500 text-white"
                              : "bg-muted-foreground/20 text-muted-foreground",
                        )}
                      >
                        {idx + 1}
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[8px] uppercase font-bold h-4 px-1.5 border-muted-foreground/10 bg-white/50 rounded-sm"
                      >
                        {item.question_type}
                      </Badge>
                    </div>
                    <div className="text-[10px] font-bold tabular-nums text-foreground/60">
                      {item.score || 0} / {item.max_score}
                    </div>
                  </div>
                  <h4 className="text-[12px] font-semibold leading-relaxed mb-3 text-foreground/80">
                    {item.question_text}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border/10">
                    <div className="space-y-1">
                      <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/40">
                        Input Trace
                      </div>
                      <div className="p-2.5 rounded border bg-background/30 text-[10px] font-medium leading-relaxed text-foreground/70">
                        {item.student_answer ||
                          (item.was_skipped
                            ? "Trace skipped."
                            : "Null response.")}
                      </div>
                    </div>
                    {!isPending && (
                      <div className="space-y-1">
                        <div className="text-[8px] font-bold uppercase tracking-widest text-emerald-600/40">
                          Key Vector
                        </div>
                        <div className="p-2.5 rounded border border-emerald-100/50 bg-emerald-500/[0.01] text-[10px] font-medium italic text-emerald-900/50">
                          {item.correct_answer || "Evaluated."}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 pt-4 print:hidden">
            <Button
              className="flex-1 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest bg-primary hover:bg-primary/90 shadow-none"
              onClick={handlePrint}
            >
              Download Record
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/student/dashboard")}
              className="flex-1 h-9 rounded-md font-bold text-[10px] uppercase tracking-widest border-border/60"
            >
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
