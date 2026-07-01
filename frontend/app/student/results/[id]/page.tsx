// app/student/results/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  MessageCircle,
  Cpu,
  Calendar,
  RefreshCw,
  Award,
} from "lucide-react";

import { resultApi } from "@/lib/api/result";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuestionBreakdown {
  id: string;
  question_id: string;
  score: number | null;
  max_score: number;
  is_correct: boolean | null;
  feedback: string | null;
  feedback_author_basis?: string | null;
  grading_mode: string | null;
  was_skipped: boolean;
  question_text: string;
  question_type: string;
  section_title: string | null;
  student_answer: string | null;
  correct_answer: string | null;
  options: unknown;
}

interface AssessmentResultResponse {
  assessment_title: string;
  total_score: number;
  max_score: number;
  percentage: number;
  letter_grade: string | null;
  is_passing: boolean;
  is_released: boolean;
  released_at: string | null;
  integrity_hold: boolean;
  calculated_at: string | null;
  graded_question_count: number;
  total_question_count: number;
  breakdowns: QuestionBreakdown[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isOpenEnded = (type: string) =>
  ["short_answer", "essay", "case_study", "computational"].includes(type);

function getAssessmentTypeBadge(title: string): string {
  const t = title.toUpperCase();
  if (t.includes("CAT")) return "CAT";
  if (t.includes("ESSAY")) return "Essay";
  if (t.includes("HOMEWORK") || t.includes("HOME WORK")) return "Homework";
  if (t.includes("QUIZ")) return "Quiz";
  if (t.includes("EXAM")) return "Exam";
  if (t.includes("TEST")) return "Test";
  if (t.includes("ASSIGNMENT")) return "Assignment";
  return "Assessment";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

// SVG score ring — circumference = 2π × 38 ≈ 238.76
function ScoreRing({
  pct,
  isPassing,
}: {
  pct: number;
  isPassing: boolean;
}) {
  const circ = 238.76;
  const filled = Math.max(0, Math.min(1, pct / 100)) * circ;
  const stroke = isPassing ? "#10b981" : "#ef4444"; // emerald-500 / red-500
  return (
    <svg
      viewBox="0 0 88 88"
      width={88}
      height={88}
      className="shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={44}
        cy={44}
        r={38}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={8}
      />
      <circle
        cx={44}
        cy={44}
        r={38}
        fill="none"
        stroke={stroke}
        strokeWidth={8}
        strokeDasharray={`${filled} ${circ}`}
        strokeDashoffset={60}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text
        x="50%"
        y={40}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground text-[13px] font-semibold"
        style={{ fontSize: 13, fontWeight: 600, fill: "currentColor" }}
      >
        {pct}%
      </text>
      <text
        x="50%"
        y={56}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
      >
        score
      </text>
    </svg>
  );
}

// ─── Question Card ─────────────────────────────────────────────────────────────

function QuestionCard({
  item,
  index,
}: {
  item: QuestionBreakdown;
  index: number;
}) {
  const open = isOpenEnded(item.question_type);
  const pending =
    item.is_correct === null && (item.score === null || item.score === undefined);
  const graded = item.score !== null && item.score !== undefined;

  // Score badge
  let scoreBadge: React.ReactNode;
  if (item.was_skipped) {
    scoreBadge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Skipped
      </span>
    );
  } else if (item.is_correct === true) {
    scoreBadge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
        <CheckCircle2 className="size-3" />
        {item.score}/{item.max_score}
      </span>
    );
  } else if (item.is_correct === false) {
    scoreBadge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[11px] font-medium text-red-700">
        <XCircle className="size-3" />
        0/{item.max_score}
      </span>
    );
  } else if (pending) {
    scoreBadge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <Clock className="size-3" />
        Pending
      </span>
    );
  } else if (graded) {
    scoreBadge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-medium text-blue-700">
        {item.score}/{item.max_score}
      </span>
    );
  }

  return (
    <div className="border border-border/50 rounded-lg p-4 mb-2 bg-card/30">
      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">Question {index + 1}</p>
          <p className="text-[11px] text-muted-foreground/60 capitalize">
            {item.question_type.replace(/_/g, " ")} · {item.max_score}{" "}
            {item.max_score === 1 ? "mark" : "marks"}
          </p>
        </div>
        {scoreBadge}
      </div>

      {/* Question text */}
      <p className="text-sm text-foreground leading-relaxed mb-3">
        {item.question_text}
      </p>

      {/* Closed question answers */}
      {!open && (
        <div className="space-y-2">
          {item.was_skipped ? (
            <div className="bg-muted/40 rounded p-2 text-xs text-muted-foreground">
              No answer submitted
            </div>
          ) : item.is_correct === true ? (
            <div className="bg-emerald-50 border-l-2 border-emerald-500 p-2 rounded">
              <p className="text-[10px] font-medium text-emerald-700 mb-0.5">
                ✓ Your answer (correct)
              </p>
              <p className="text-xs text-emerald-900">{item.student_answer}</p>
            </div>
          ) : item.is_correct === false ? (
            <>
              <div className="bg-red-50 border-l-2 border-red-500 p-2 rounded">
                <p className="text-[10px] font-medium text-red-700 mb-0.5">
                  ✗ Your answer (incorrect)
                </p>
                <p className="text-xs text-red-900">
                  {item.student_answer || "—"}
                </p>
              </div>
              {item.correct_answer && (
                <div className="bg-emerald-50 border-l-2 border-emerald-500 p-2 rounded">
                  <p className="text-[10px] font-medium text-emerald-700 mb-0.5">
                    ✓ Correct answer
                  </p>
                  <p className="text-xs text-emerald-900">
                    {item.correct_answer}
                  </p>
                </div>
              )}
            </>
          ) : null}

          {/* Explanation */}
          {item.feedback && (
            <div className="border-t pt-3 mt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-medium text-muted-foreground">
                  Explanation
                </p>
                {item.feedback_author_basis && (
                  <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80">
                    {item.feedback_author_basis === "AI"
                      ? "AI Drafted"
                      : item.feedback_author_basis === "AI_EDITED"
                      ? "AI Drafted (Edited by Human)"
                      : "Human Written"}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{item.feedback}</p>
            </div>
          )}
        </div>
      )}

      {/* Open-ended answers */}
      {open && (
        <div className="space-y-2">
          {/* Student response */}
          <div className="bg-muted/30 rounded p-2">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">
              Your response
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {item.student_answer || (
                <span className="text-muted-foreground italic">
                  No response submitted
                </span>
              )}
            </p>
          </div>

          {/* Pending state */}
          {pending && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2">
              <p className="text-[10px] font-semibold text-amber-700 mb-0.5">
                Awaiting lecturer review
              </p>
              <p className="text-xs text-amber-700/80">
                This response will be reviewed and scored by your lecturer.
              </p>
            </div>
          )}

          {/* Graded open-ended */}
          {graded && !pending && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Awarded:
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <Award className="size-3" />
                  {item.score}/{item.max_score}
                </span>
              </div>

              {item.feedback && (
                <div className="bg-blue-50 border-l-2 border-blue-400 p-3 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <MessageCircle className="size-3 text-blue-600" />
                      <p className="text-[10px] font-medium text-blue-700">
                        Lecturer feedback
                      </p>
                    </div>
                    {item.feedback_author_basis && (
                      <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-100/50 text-blue-700">
                        {item.feedback_author_basis === "AI"
                          ? "AI Drafted"
                          : item.feedback_author_basis === "AI_EDITED"
                          ? "AI Drafted (Edited by Human)"
                          : "Human Written"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-blue-900">{item.feedback}</p>
                </div>
              )}

              {item.grading_mode?.toLowerCase().includes("ai") && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Cpu className="size-3" />
                  AI-assisted · reviewed by lecturer
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section Breakdown Bar ────────────────────────────────────────────────────

interface SectionGroup {
  name: string;
  items: QuestionBreakdown[];
  total: number;
  correct: number;
  incorrect: number;
  pending: number;
}

function ScoreBreakdownCard({ breakdowns }: { breakdowns: QuestionBreakdown[] }) {
  // Group by section_title or question_type
  const groupMap = new Map<string, QuestionBreakdown[]>();
  for (const item of breakdowns) {
    const key = item.section_title || item.question_type || "General";
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(item);
  }

  const groups: SectionGroup[] = Array.from(groupMap.entries()).map(
    ([name, items]) => {
      let correct = 0,
        incorrect = 0,
        pending = 0;
      let totalMarks = 0,
        correctMarks = 0,
        incorrectMarks = 0;
      for (const item of items) {
        totalMarks += item.max_score;
        if (item.is_correct === true) {
          correct++;
          correctMarks += item.score ?? item.max_score;
        } else if (item.is_correct === false) {
          incorrect++;
          incorrectMarks += item.max_score;
        } else {
          pending++;
        }
      }
      return {
        name,
        items,
        total: totalMarks,
        correct: correctMarks,
        incorrect: incorrectMarks,
        pending,
      };
    }
  );

  // Topic performance by question_type within all breakdowns
  const topicMap = new Map<string, { correct: number; total: number }>();
  for (const item of breakdowns) {
    const type = item.question_type || "Unknown";
    if (!topicMap.has(type)) topicMap.set(type, { correct: 0, total: 0 });
    const t = topicMap.get(type)!;
    t.total++;
    if (item.is_correct === true) t.correct++;
  }

  return (
    <div className="border border-border/50 rounded-lg p-4 bg-card/30">
      <p className="text-xs font-medium text-muted-foreground mb-3">
        Score breakdown
      </p>

      <div className="space-y-4">
        {groups.map((g) => {
          const pctCorrect = g.total > 0 ? (g.correct / g.total) * 100 : 0;
          const pctIncorrect = g.total > 0 ? (g.incorrect / g.total) * 100 : 0;
          const score = g.items.reduce((s, i) => s + (i.score ?? 0), 0);
          return (
            <div key={g.name}>
              <div className="flex justify-between mb-1">
                <span className="text-xs font-medium capitalize">
                  {g.name.replace(/_/g, " ")}
                </span>
                <span className="text-xs font-medium tabular-nums">
                  {score}/{g.total}
                </span>
              </div>
              {/* Stacked bar */}
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${pctCorrect}%` }}
                />
                <div
                  className="h-full bg-red-400 transition-all"
                  style={{ width: `${pctIncorrect}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-500 inline-block" />
          Correct
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="size-2 rounded-full bg-red-400 inline-block" />
          Incorrect
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="size-2 rounded-full bg-muted-foreground/30 inline-block" />
          Pending
        </span>
      </div>

      {/* Topic performance */}
      {topicMap.size > 0 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <p className="text-[10px] font-medium text-muted-foreground mb-2">
            Topic performance
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from(topicMap.entries()).map(([type, stat]) => {
              const pct =
                stat.total > 0
                  ? Math.round((stat.correct / stat.total) * 100)
                  : 0;
              return (
                <div
                  key={type}
                  className="border border-border/40 rounded p-2 text-center bg-muted/20"
                >
                  <p className="text-[10px] text-muted-foreground capitalize truncate">
                    {type.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm font-medium">{pct}%</p>
                  <p className="text-[10px] text-muted-foreground">
                    {stat.correct}/{stat.total} correct
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AssessmentResultResponse | null>(null);

  useEffect(() => {
    async function loadResult() {
      try {
        const data = await resultApi.getResultByAttempt(attemptId);
        setResult(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (!msg.toLowerCase().includes("available")) {
          console.error("Failed to load results", err);
          toast.error("Failed to load results.");
        }
      } finally {
        setLoading(false);
      }
    }
    loadResult();
  }, [attemptId]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <div className="border border-border/50 rounded-lg p-4 bg-card/30">
          <Skeleton className="h-4 w-48 mb-2 rounded" />
          <Skeleton className="h-3 w-64 rounded" />
        </div>
        <div className="border border-border/50 rounded-lg p-4 bg-card/30 flex gap-4 items-center">
          <Skeleton className="size-[88px] rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-7 w-32 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <div className="border border-border/50 rounded-lg p-4 bg-card/30 space-y-3">
          <Skeleton className="h-3 w-32 rounded" />
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-2 w-full rounded" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="border border-border/50 rounded-lg p-4 bg-card/30 space-y-2"
          >
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // ── Empty / not released state ─────────────────────────────────────────────
  if (!result) {
    return (
      <div className="py-20 text-center space-y-3 px-4">
        <div className="mx-auto size-12 bg-muted rounded-full flex items-center justify-center border border-dashed">
          <Clock className="size-5 text-muted-foreground/50" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">
          Results not yet released
        </h2>
        <p className="text-xs text-muted-foreground">
          The lecturer has not yet released results for this assessment.
        </p>
        <div className="flex gap-2 justify-center pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
            className="h-8 gap-1.5 text-xs font-medium border-border/60"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push("/student/dashboard")}
            className="h-8 text-xs font-medium"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const pct = Math.round(result.percentage ?? 0);
  const dateLabel = fmtDate(result.calculated_at ?? result.released_at);
  const typeBadge = getAssessmentTypeBadge(result.assessment_title);
  const holdBannerShown = result.integrity_hold;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/student/results")}
          className="h-8 px-3 text-xs font-medium gap-1.5 border border-border/55 rounded-lg hover:bg-muted/50"
        >
          <ArrowLeft className="size-3.5" />
          Results
        </Button>
      </div>

      {/* Integrity hold banner */}
      {holdBannerShown && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3">
          <AlertTriangle className="size-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs font-medium text-red-800">
            This result is provisional — under integrity review. Final result
            may differ.
          </p>
        </div>
      )}

      {/* ── 1. Header Zone ────────────────────────────────────────────────── */}
      <div className="border border-border/50 rounded-lg p-4 bg-card/30">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-sm font-medium text-foreground leading-snug">
            {result.assessment_title}
          </p>
          <span className="shrink-0 inline-flex items-center rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {typeBadge}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {dateLabel}
          </span>
          <span>·</span>
          <span>
            {result.graded_question_count}/{result.total_question_count}{" "}
            questions graded
          </span>
        </div>
      </div>

      {/* ── 2. Score Hero ─────────────────────────────────────────────────── */}
      <div className="border border-border/50 rounded-lg p-4 bg-card/30 flex flex-row gap-4 items-center">
        <ScoreRing pct={pct} isPassing={result.is_passing} />

        <div className="flex-1 space-y-1">
          <div className="flex items-baseline gap-1 tabular-nums">
            <span className="text-2xl font-medium text-foreground">
              {result.total_score}
            </span>
            <span className="text-sm text-muted-foreground">
              / {result.max_score}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {pct}%
            {result.letter_grade ? ` · Grade ${result.letter_grade}` : ""}
          </p>

          <div className="pt-0.5">
            {result.is_passing ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 className="size-3" />
                Passed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                <XCircle className="size-3" />
                Did not pass
              </span>
            )}
          </div>

          {result.released_at && (
            <p className="text-[10px] text-muted-foreground pt-0.5">
              Released by lecturer · {fmtDate(result.released_at)}
            </p>
          )}
        </div>
      </div>

      {/* ── 3. Score Breakdown ────────────────────────────────────────────── */}
      {result.breakdowns && result.breakdowns.length > 0 && (
        <ScoreBreakdownCard breakdowns={result.breakdowns} />
      )}

      {/* ── 4. Question Review List ───────────────────────────────────────── */}
      {result.breakdowns && result.breakdowns.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Question review</p>
          {result.breakdowns.map((item, idx) => (
            <QuestionCard key={item.id} item={item} index={idx} />
          ))}
        </div>
      )}

      {/* ── 5. Integrity Zone ─────────────────────────────────────────────── */}
      {result.integrity_hold && (
        <div className="border border-red-300 rounded-lg p-4 bg-red-50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-red-600" />
            <p className="text-xs font-semibold text-red-800">
              Integrity review in progress
            </p>
          </div>
          <p className="text-xs text-red-700">
            One or more responses in this assessment have been flagged for
            review. Your final result will be confirmed once the review is
            complete.
          </p>
        </div>
      )}

      {/* ── 6. Actions Zone ───────────────────────────────────────────────── */}
      <div className="border border-border/50 rounded-lg p-4 bg-card/30">
        <p className="text-sm font-medium mb-2">Actions</p>
        <div className="flex gap-2 flex-wrap">
          {!result.integrity_hold && result.is_released && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-medium gap-1.5 border border-border/50"
            >
              <MessageCircle className="size-3.5" />
              Request review
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            className="h-8 text-xs font-medium gap-1.5 border border-border/50"
          >
            <Download className="size-3.5" />
            Download PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/student/results")}
            className="h-8 text-xs font-medium gap-1.5 border border-border/60"
          >
            <ArrowLeft className="size-3.5" />
            Back to results
          </Button>
        </div>
      </div>
    </div>
  );
}
