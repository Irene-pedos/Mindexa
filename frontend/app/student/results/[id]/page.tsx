// app/student/results/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  BrainCircuit,
  MessageSquare,
  Printer,
  Share2,
  Target,
  ArrowUpCircle,
  FileText,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resultApi } from "@/lib/api/result";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getResultLifecycleSummary, isOpenQuestionType, getAssessmentCategory } from "@/lib/grading-architecture";
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
        console.error("Failed to load results", err);
        if (!err.message?.toLowerCase().includes("available")) {
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
      <div className="max-w-4xl mx-auto space-y-4 py-8 px-6">
        <Skeleton className="h-8 w-32 rounded-md" />
        <Card className="rounded-xl overflow-hidden shadow-none border">
          <CardHeader className="text-center py-6">
            <Skeleton className="mx-auto h-12 w-12 rounded-full" />
            <Skeleton className="h-6 w-1/2 mx-auto mt-4 rounded-md" />
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            <div className="flex flex-col items-center">
              <Skeleton className="h-16 w-24 rounded-lg" />
              <Skeleton className="h-1.5 w-48 mt-4 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="mx-auto size-12 bg-muted rounded-full flex items-center justify-center border-2 border-dashed">
          <HelpCircle className="size-6 text-muted-foreground/40" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Result Pending</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This context trace is being processed by the pedagogical engine.
        </p>
        <Button onClick={() => router.push("/student/results")} variant="outline" size="sm" className="px-6 h-9 rounded-lg font-medium">
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

  const handlePrint = () => { window.print(); };
  const handleShare = () => { toast.info("Secure sharing link generated."); };

  return (
    <div className="max-w-4xl mx-auto space-y-4 py-8 px-6 pb-20 print:p-0 print:max-w-full">
      <div className="flex items-center justify-between print:hidden px-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/student/results")}
          className="h-8 px-2 hover:bg-muted/50 rounded-lg text-xs font-semibold uppercase tracking-wider gap-2"
        >
          <ArrowLeft className="size-3.5" /> Registry
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 rounded-lg font-bold text-[10px] uppercase tracking-widest gap-2">
            <Printer className="size-3.5" /> Print
          </Button>
          <Badge
            variant={category === "VIOLATION" ? "destructive" : "outline"}
            className="text-[9px] uppercase font-bold tracking-widest px-2 h-6 border-muted-foreground/20"
          >
            {category === "VIOLATION" ? "TERMINATED" : (result.letter_grade || lifecycle.label)}
          </Badge>
        </div>
      </div>

      <Card className="border shadow-none overflow-hidden rounded-2xl print:border-none print:shadow-none">
        <CardHeader
          className={cn(
            "text-center pb-6 pt-10 relative border-b",
            category === "VIOLATION" ? "bg-red-50/50" : (result.is_passing ? "bg-emerald-50/20" : "bg-red-50/20"),
          )}
        >
          <div
            className={cn(
              "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-background shadow-sm",
              category === "VIOLATION" ? "bg-red-600 text-white" : (result.is_passing ? "bg-emerald-500 text-white" : "bg-red-500 text-white"),
            )}
          >
            {category === "VIOLATION" ? <AlertTriangle className="size-8" /> : (result.is_passing ? <CheckCircle className="size-8" /> : <XCircle className="size-8" />)}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight px-4 uppercase">
            {result.assessment_title || "Academic Result"}
          </CardTitle>
          <CardDescription className="text-[10px] mt-2 font-bold uppercase tracking-[0.2em] text-muted-foreground/60 px-10 leading-relaxed">
            {category === "VIOLATION" 
              ? `Security Protocol Violation: ${result.termination_reason || "Suspicious activity detected"}.`
              : (result.is_passing ? "Proficiency threshold achieved. Core objectives met." : "Target efficiency not reached. Review vector recommended.")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-10 p-6 md:p-10">
          <div className="flex flex-col items-center">
            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="text-6xl font-bold tracking-tighter text-foreground">
                {score}
              </span>
              <span className="text-xl font-semibold text-muted-foreground/40">
                / {maxScore}
              </span>
            </div>

            <div className="mt-6 flex flex-col items-center justify-center w-full max-w-xs gap-3">
               <div className="w-full space-y-1.5">
                <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-1">
                  <span>Performance</span>
                  <span className="text-foreground">{percentage}%</span>
                </div>
                <Progress value={percentage} className="h-1.5 rounded-full bg-muted/40" />
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border bg-muted/5 flex flex-col items-center text-center space-y-1 hover:border-primary/10 transition-all shadow-none">
              <Clock className="size-4 text-muted-foreground/60" />
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Status</div>
              <div className="text-[10px] font-bold uppercase tracking-tight">{lifecycle.label}</div>
            </div>

            <div className="p-4 rounded-xl border bg-muted/5 flex flex-col items-center text-center space-y-1 hover:border-primary/10 transition-all shadow-none">
              <Award className="size-4 text-muted-foreground/60" />
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Recorded</div>
              <div className="text-[10px] font-bold uppercase tracking-tight">{result.released_at ? new Date(result.released_at).toLocaleDateString() : "LIVE"}</div>
            </div>

            <div className="p-4 rounded-xl border bg-muted/5 flex flex-col items-center text-center space-y-1 hover:border-primary/10 transition-all shadow-none">
              <Info className="size-4 text-muted-foreground/60" />
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Progress</div>
              <div className="text-[10px] font-bold tabular-nums uppercase">{result.graded_question_count} / {result.total_question_count} NODES</div>
            </div>
          </div>

          <Separator className="bg-border/40" />

          {/* Feedback Section */}
          {(result.feedback || result.strengths || result.weaknesses) && (
            <div className="space-y-4 pt-2">
               <h3 className="text-sm font-bold uppercase tracking-widest px-1">Pedagogical Guidance</h3>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.feedback && (
                    <div className="col-span-full p-4 rounded-xl bg-primary/[0.03] border border-primary/10 space-y-2">
                      <div className="flex items-center gap-2 text-primary">
                        <MessageSquare className="size-3.5" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Instructor Comments</span>
                      </div>
                      <p className="text-xs font-medium text-foreground/80 leading-relaxed italic">
                        &quot;{result.feedback}&quot;
                      </p>
                    </div>
                  )}

                  {result.strengths && (
                    <div className="p-4 rounded-xl border bg-emerald-50/10 border-emerald-100 space-y-2">
                      <div className="flex items-center gap-2 text-emerald-700">
                        <Target className="size-3.5" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Proficiencies</span>
                      </div>
                      <p className="text-[11px] font-medium text-emerald-900/70 leading-relaxed">{result.strengths}</p>
                    </div>
                  )}

                  {result.weaknesses && (
                    <div className="p-4 rounded-xl border bg-amber-50/10 border-amber-100 space-y-2">
                      <div className="flex items-center gap-2 text-amber-700">
                        <ArrowUpCircle className="size-3.5" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Growth Areas</span>
                      </div>
                      <p className="text-[11px] font-medium text-amber-900/70 leading-relaxed">{result.weaknesses}</p>
                    </div>
                  )}
               </div>
            </div>
          )}

          {/* Breakdown Section */}
          <div className="space-y-6 pt-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold uppercase tracking-widest">Audit Matrix</h3>
              <Badge variant="outline" className="h-5 px-2 text-[8px] font-bold uppercase tracking-widest border-muted-foreground/20 text-muted-foreground">Registry Breakdown</Badge>
            </div>

            <div className="space-y-3">
              {result.breakdowns?.map((item: any, idx: number) => (
                <div
                  key={item.id}
                  className={cn(
                    "group p-4 rounded-xl border transition-all",
                    item.is_correct === true ? "bg-emerald-50/[0.04] border-emerald-100/50" : 
                    item.is_correct === false ? "bg-red-50/[0.04] border-red-100/50" : "bg-muted/[0.04] border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "size-6 rounded-lg flex items-center justify-center text-[10px] font-bold",
                        item.is_correct === true ? "bg-emerald-500 text-white" : 
                        item.is_correct === false ? "bg-red-500 text-white" : "bg-muted-foreground/20 text-muted-foreground",
                      )}>{idx + 1}</div>
                      <Badge variant="outline" className="text-[8px] uppercase font-bold h-4.5 px-1.5 border-muted-foreground/20 bg-white">{item.question_type}</Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold tabular-nums">{item.score || 0} / {item.max_score}</div>
                    </div>
                  </div>

                  <h4 className="text-[13px] font-semibold leading-relaxed mb-4 pr-6 text-foreground/90">{item.question_text}</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-dashed border-border/40">
                    <div className="space-y-1.5">
                      <div className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">Input Trace</div>
                      <div className="p-3 rounded-lg text-[11px] font-semibold leading-relaxed border bg-background/50">
                        {(() => {
                          const type = (item.question_type || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                          const ans = item.student_answer;
                          if (!ans && !item.selected_option_ids && !item.match_pairs_json && !item.fill_blank_answers && !item.ordered_option_ids) {
                             return item.was_skipped ? "Trace skipped." : "Null response.";
                          }
                          if (type === "mcq" || type === "truefalse") {
                             const opt = item.options?.find((o: any) => o.id === item.selected_option_ids?.[0]);
                             return opt?.option_text || "Invalid Identifier.";
                          }
                          if (type === "matching") {
                             const matches = item.match_pairs_json || {};
                             return (
                                <div className="space-y-1">
                                   {Object.entries(matches).map(([leftId, rightId]: any) => {
                                      const left = item.options?.find((o: any) => o.id === leftId);
                                      const right = item.options?.find((o: any) => o.id === rightId);
                                      return (
                                         <div key={leftId} className="flex items-center gap-2">
                                            <span className="opacity-60 text-[10px]">{left?.option_text}</span>
                                            <ArrowRight className="size-2.5 opacity-20" />
                                            <span className="uppercase text-[10px]">{right?.option_text_right}</span>
                                         </div>
                                      );
                                   })}
                                </div>
                             );
                          }
                          return ans;
                        })()}
                      </div>
                    </div>

                    {!isPending && (
                      <div className="space-y-1.5">
                        <div className="text-[8px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-2">Key Vector</div>
                        <div className="p-3 rounded-lg text-[11px] font-semibold leading-relaxed bg-emerald-500/[0.02] border border-emerald-100/50 text-emerald-900/60 italic">
                           {item.correct_answer || "Confirmed by Evaluator."}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-6 print:hidden">
            <Button size="lg" className="flex-1 h-12 rounded-xl font-bold text-[11px] uppercase tracking-widest group shadow-none" onClick={handlePrint}>
              <Download className="mr-2 size-4 transition-transform group-hover:-translate-y-0.5" /> Download Record
            </Button>
            <Button variant="secondary" size="lg" onClick={() => router.push("/student/dashboard")} className="flex-1 h-12 rounded-xl font-bold text-[11px] uppercase tracking-widest group shadow-none">
              Dashboard Overview
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
