// app/student/results/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  MessageCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { assessmentApi } from "@/lib/api/assessment";
import { attemptApi } from "@/lib/api/attempt";
import { resultApi } from "@/lib/api/result";
import { submissionApi } from "@/lib/api/submission";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ResultOption {
  id: string;
  text: string;
  is_correct?: boolean | null;
  match_key?: string | null;
  match_value?: string | null;
  order_index?: number;
}

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
  question_text: string | null;
  question_type: string | null;
  section_title: string | null;
  imageUrl?: string | null;
  case_study_context?: string | null;
  student_answer: string | null;
  student_answer_json?: Record<string, unknown> | unknown[] | null;
  correct_answer: string | null;
  options: ResultOption[] | null;
}

interface AssessmentResultResponse {
  id: string;
  attempt_id: string;
  student_id: string;
  assessment_id: string;
  assessment_title: string | null;
  academic_year?: string | null;
  course_code?: string | null;
  course_name?: string | null;
  institution_name?: string | null;
  college_name?: string | null;
  department_name?: string | null;
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

const OPEN_TYPES = new Set(["shortanswer", "short_answer", "essay", "casestudy", "case_study", "computational", "practical"]);
const MCQ_TYPES = new Set(["mcq", "multiplechoice", "multiple_choice"]);
const TRUE_FALSE_TYPES = new Set(["truefalse", "true_false"]);

function normalizeType(value?: string | null) {
  return (value || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function labelForType(value?: string | null) {
  const normalized = normalizeType(value);
  if (MCQ_TYPES.has(normalized)) return "Multiple choice";
  if (TRUE_FALSE_TYPES.has(normalized)) return "True / False";
  if (normalized === "casestudy" || normalized === "case_study") return "Case study";
  if (normalized === "fillblank" || normalized === "fill_blank") return "Fill in the blanks";
  if (normalized === "matching") return "Matching";
  if (normalized === "ordering") return "Ordering";
  if (normalized === "essay") return "Essay";
  if (normalized === "computational") return "Computational";
  return (value || "Question").replace(/_/g, " ");
}

function isOpenEnded(type?: string | null) {
  return OPEN_TYPES.has(normalizeType(type));
}

function fmtDate(iso?: string | null, withTime = false) {
  if (!iso) return "N/A";
  try {
    return format(new Date(iso), withTime ? "MMM d, yyyy HH:mm" : "MMM d, yyyy");
  } catch {
    return "N/A";
  }
}

function safeJson(value: unknown) {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function answerValues(item: QuestionBreakdown): string[] {
  const parsed = safeJson(item.student_answer_json ?? item.student_answer);
  if (Array.isArray(parsed)) return parsed.map(String);
  if (parsed && typeof parsed === "object") return Object.values(parsed).map(String);
  if (item.student_answer) return item.student_answer.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function feedbackBasisLabel(value?: string | null) {
  if (!value) return "Lecturer feedback";
  if (value === "AI") return "AI drafted";
  if (value === "AI_EDITED") return "AI drafted, lecturer edited";
  return "Lecturer feedback";
}

function getAssessmentTypeBadge(title?: string | null) {
  const t = (title || "").toUpperCase();
  if (t.includes("CAT")) return "CAT";
  if (t.includes("EXAM")) return "Exam";
  if (t.includes("QUIZ")) return "Quiz";
  if (t.includes("TEST")) return "Test";
  if (t.includes("ASSIGNMENT")) return "Assignment";
  return "Assessment";
}

function ScoreRing({ pct, isPassing }: { pct: number; isPassing: boolean }) {
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, pct)) / 100 * circ;

  return (
    <svg viewBox="0 0 96 96" width={96} height={96} className="shrink-0" aria-hidden="true">
      <circle cx="48" cy="48" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke={isPassing ? "#059669" : "#dc2626"}
        strokeWidth="8"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <text x="48" y="45" textAnchor="middle" className="fill-foreground text-sm font-semibold">
        {pct}%
      </text>
      <text x="48" y="61" textAnchor="middle" className="fill-muted-foreground text-[10px]">
        score
      </text>
    </svg>
  );
}

function ScoreBadge({ item }: { item: QuestionBreakdown }) {
  const pending = item.score === null || item.score === undefined;
  if (item.was_skipped) {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Skipped</span>;
  }
  if (pending) {
    return <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"><Clock className="size-3" /> Pending</span>;
  }
  const tone = item.is_correct === false ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tone)}>
      {item.is_correct === false ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
      {item.score}/{item.max_score}
    </span>
  );
}

function FeedbackBlock({ item }: { item: QuestionBreakdown }) {
  if (!item.feedback) return null;
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 print:border-slate-300 print:bg-white">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase text-blue-700">
          <MessageCircle className="size-3" />
          Feedback
        </span>
        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700 print:bg-slate-100 print:text-slate-700">
          {feedbackBasisLabel(item.feedback_author_basis)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-blue-950 print:text-slate-800">{item.feedback}</p>
    </div>
  );
}

function ClosedChoiceReview({ item }: { item: QuestionBreakdown }) {
  const selected = answerValues(item);
  const options = item.options || [];
  const type = normalizeType(item.question_type);
  const renderedOptions = TRUE_FALSE_TYPES.has(type) && options.length === 0
    ? [
        { id: "true", text: "True", is_correct: item.correct_answer?.toLowerCase() === "true" },
        { id: "false", text: "False", is_correct: item.correct_answer?.toLowerCase() === "false" },
      ]
    : options;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {renderedOptions.map((option) => {
          const wasChosen = selected.some((v) => v === option.id || v.toLowerCase() === option.text.toLowerCase());
          const correct = !!option.is_correct;
          return (
            <div
              key={option.id}
              className={cn(
                "rounded-lg border p-3 text-xs",
                correct && "border-emerald-300 bg-emerald-50 text-emerald-900",
                wasChosen && !correct && "border-red-300 bg-red-50 text-red-900",
                wasChosen && correct && "ring-1 ring-emerald-500",
                !wasChosen && !correct && "border-border bg-muted/10",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{option.text}</span>
                <div className="flex shrink-0 gap-1">
                  {wasChosen && <span className="rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-bold uppercase">Chosen</span>}
                  {correct && <span className="rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-bold uppercase">Correct</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {item.was_skipped && <p className="text-xs italic text-muted-foreground">No answer submitted.</p>}
      {!item.was_skipped && selected.length === 0 && <p className="text-xs italic text-muted-foreground">Answer not available.</p>}
    </div>
  );
}

function MatchingReview({ item }: { item: QuestionBreakdown }) {
  const student = safeJson(item.student_answer_json ?? item.student_answer);
  const studentMap = student && typeof student === "object" && !Array.isArray(student) ? student as Record<string, unknown> : {};
  const options = item.options || [];
  return (
    <div className="space-y-2">
      {options.map((option) => {
        const chosen = studentMap[option.id] ?? studentMap[option.text] ?? "No match submitted";
        return (
          <div key={option.id} className="grid gap-2 rounded-lg border bg-muted/10 p-3 text-xs sm:grid-cols-3">
            <div><span className="text-muted-foreground">Prompt</span><p className="font-medium">{option.text}</p></div>
            <div><span className="text-muted-foreground">Your match</span><p className="font-medium">{String(chosen)}</p></div>
            <div><span className="text-muted-foreground">Expected</span><p className="font-medium text-emerald-700">{option.match_value || "N/A"}</p></div>
          </div>
        );
      })}
    </div>
  );
}

function OrderingReview({ item }: { item: QuestionBreakdown }) {
  const parsed = safeJson(item.student_answer_json ?? item.student_answer);
  const options = item.options;

  const optionMap = useMemo(() => new Map((options || []).map((o) => [o.id, o])), [options]);

  const orderedItems = useMemo(() => {
    const opts = options || [];
    if (Array.isArray(parsed)) {
      return parsed.map((val) => {
        const strVal = String(val);
        const opt = optionMap.get(strVal) || opts.find((o) => o.text === strVal);
        return {
          id: opt?.id || strVal,
          text: opt?.text || strVal,
        };
      });
    }
    if (item.student_answer) {
      const parts = item.student_answer.split(",").map((s) => s.trim()).filter(Boolean);
      return parts.map((strVal) => {
        const opt = optionMap.get(strVal) || opts.find((o) => o.text === strVal);
        return {
          id: opt?.id || strVal,
          text: opt?.text || strVal,
        };
      });
    }
    return [];
  }, [parsed, item.student_answer, optionMap, options]);

  const expectedOptions = useMemo(() => {
    return [...(options || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }, [options]);

  if (item.was_skipped || orderedItems.length === 0) {
    return <p className="text-xs italic text-muted-foreground">No response submitted.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your submitted sequence</p>
        {orderedItems.map((opt, idx) => {
          const expected = expectedOptions[idx];
          const isCorrectPosition = expected && (opt.id === expected.id || opt.text.trim().toLowerCase() === expected.text.trim().toLowerCase());

          return (
            <div
              key={opt.id || idx}
              className={cn(
                "flex items-center justify-between rounded-lg border p-3 text-xs",
                isCorrectPosition
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-bold shadow-xs">
                  {idx + 1}
                </span>
                <span className="font-medium">{opt.text}</span>
              </div>
              {expected && (
                <span className="text-[10px] font-semibold">
                  {isCorrectPosition ? (
                    <span className="font-bold text-emerald-700">Correct position</span>
                  ) : (
                    <span className="text-amber-800">Expected: {expected.text}</span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {item.correct_answer && (
        <p className="mt-2 text-xs font-medium text-emerald-700">
          Expected full sequence: {item.correct_answer}
        </p>
      )}
    </div>
  );
}

function FillBlankReview({ item }: { item: QuestionBreakdown }) {
  const parsed = safeJson(item.student_answer_json ?? item.student_answer);
  const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? Object.values(parsed) : [];
  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Your blanks</p>
      {values.length > 0 ? (
        <ol className="space-y-1 text-sm">
          {values.map((value, index) => <li key={index}>{index + 1}. {String(value)}</li>)}
        </ol>
      ) : (
        <p className="text-xs italic text-muted-foreground">No blank answers available.</p>
      )}
      {item.correct_answer && <p className="mt-3 text-xs text-emerald-700">Accepted answer: {item.correct_answer}</p>}
    </div>
  );
}

function CaseStudyReview({ item }: { item: QuestionBreakdown }) {
  const parsed = safeJson(item.student_answer_json ?? item.student_answer);
  const answerMap = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const prompts = item.options?.length ? item.options : Object.keys(answerMap).map((id, index) => ({ id, text: `Sub-question ${index + 1}` }));

  return (
    <div className="space-y-3">
      {item.case_study_context && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 print:bg-white">
          <p className="mb-1 text-[10px] font-semibold uppercase text-amber-700">Case context</p>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-amber-950 print:text-slate-800">{item.case_study_context}</p>
        </div>
      )}
      <div className="space-y-2">
        {prompts.map((prompt, index) => (
          <div key={prompt.id} className="rounded-lg border bg-muted/10 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Sub-question {index + 1}</p>
            <p className="mb-2 text-sm font-medium">{prompt.text}</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {String(answerMap[prompt.id] ?? "") || <span className="text-muted-foreground italic">No response submitted</span>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenResponseReview({ item }: { item: QuestionBreakdown }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/10 p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Your response</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {item.student_answer || <span className="text-muted-foreground italic">No response submitted</span>}
        </p>
      </div>
      {item.score === null && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Awaiting lecturer review.
        </div>
      )}
    </div>
  );
}

function QuestionCard({ item, index }: { item: QuestionBreakdown; index: number }) {
  const type = normalizeType(item.question_type);
  const isCaseStudy = type === "casestudy" || type === "case_study";
  const isMatching = type === "matching";
  const isOrdering = type === "ordering" || type === "ordered_list" || type === "orderedlist";
  const isFillBlank = type === "fillblank" || type === "fill_blank";
  const isClosedChoice = MCQ_TYPES.has(type) || TRUE_FALSE_TYPES.has(type);

  return (
    <section className="rounded-xl border border-border/50 bg-card/40 p-4 print:break-inside-avoid print:bg-white">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Question {index + 1}</p>
          <p className="text-[11px] font-medium capitalize text-muted-foreground/70">
            {labelForType(item.question_type)} - {item.max_score} {item.max_score === 1 ? "mark" : "marks"}
          </p>
          {item.section_title && <p className="text-[10px] text-muted-foreground/70">{item.section_title}</p>}
        </div>
        <ScoreBadge item={item} />
      </div>

      <p className="mb-3 whitespace-pre-wrap text-sm font-medium leading-relaxed">{item.question_text}</p>

      {isCaseStudy ? <CaseStudyReview item={item} /> :
        isClosedChoice ? <ClosedChoiceReview item={item} /> :
        isMatching ? <MatchingReview item={item} /> :
        isOrdering ? <OrderingReview item={item} /> :
        isFillBlank ? <FillBlankReview item={item} /> :
        isOpenEnded(item.question_type) ? <OpenResponseReview item={item} /> :
        <OpenResponseReview item={item} />}

      <div className="mt-3">
        <FeedbackBlock item={item} />
      </div>

      {item.grading_mode?.toLowerCase().includes("ai") && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          <Cpu className="size-3" />
          AI-assisted grading reviewed by lecturer
        </div>
      )}
    </section>
  );
}

function ScoreBreakdownCard({ breakdowns }: { breakdowns: QuestionBreakdown[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, QuestionBreakdown[]>();
    for (const item of breakdowns) {
      const key = item.section_title || labelForType(item.question_type);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return Array.from(map.entries()).map(([name, items]) => {
      const score = items.reduce((sum, item) => sum + (item.score ?? 0), 0);
      const total = items.reduce((sum, item) => sum + (item.max_score ?? 0), 0);
      return { name, items, score, total, pct: total > 0 ? Math.round((score / total) * 100) : 0 };
    });
  }, [breakdowns]);

  return (
    <section className="rounded-xl border border-border/50 bg-card/40 p-4 print:bg-white">
      <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Score breakdown</p>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.name}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium">{group.name}</span>
              <span className="tabular-nums">{group.score}/{group.total}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${group.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SubmittedQuestionCard({ q, sub, index }: { q: any; sub: any; index: number }) {
  const type = normalizeType(q.type || q.question_type);
  const selected = sub?.selected_option_ids || [];
  const isCaseStudy = type === "casestudy" || type === "case_study";
  const isOrdering = type === "ordering" || type === "ordered_list" || type === "orderedlist";
  const answer = safeJson(sub?.answer_text);
  const answerMap = answer && typeof answer === "object" && !Array.isArray(answer) ? answer as Record<string, unknown> : {};

  return (
    <section className="rounded-xl border border-border/40 bg-card/30 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Question {index + 1}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
            {labelForType(q.type)} - {q.marks} {q.marks === 1 ? "mark" : "marks"}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
          {sub?.is_skipped ? "Skipped" : "Submitted"}
        </span>
      </div>
      <p className="mb-3 whitespace-pre-wrap text-sm font-medium">{q.text || q.content}</p>
      {isCaseStudy && q.caseStudyContext && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          {q.caseStudyContext}
        </div>
      )}
      {MCQ_TYPES.has(type) || TRUE_FALSE_TYPES.has(type) ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {(q.options || []).map((option: any) => (
            <div key={option.id} className={cn("rounded-lg border p-3 text-xs", selected.includes(option.id) ? "border-primary bg-primary/5" : "bg-muted/10")}>
              <span className="font-medium">{option.text || option.option_text}</span>
              {selected.includes(option.id) && <span className="ml-2 rounded bg-background px-1.5 py-0.5 text-[9px] font-bold uppercase">Chosen</span>}
            </div>
          ))}
        </div>
      ) : isCaseStudy ? (
        <div className="space-y-2">
          {(q.options || Object.keys(answerMap).map((id: string, i: number) => ({ id, text: `Sub-question ${i + 1}` }))).map((option: any, i: number) => (
            <div key={option.id} className="rounded-lg border bg-muted/10 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Sub-question {i + 1}</p>
              <p className="mb-2 text-sm font-medium">{option.text || option.option_text}</p>
              <p className="whitespace-pre-wrap text-sm">{String(answerMap[option.id] ?? "") || "No response submitted"}</p>
            </div>
          ))}
        </div>
      ) : isOrdering ? (
        <div className="space-y-2">
          <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Your submitted sequence</p>
          {(() => {
            const rawOrdered: string[] = sub?.ordered_option_ids || (Array.isArray(safeJson(sub?.answer_text)) ? safeJson(sub?.answer_text) : []);
            const opts = q.options || [];
            const optionMap = new Map(opts.map((o: any) => [o.id, o]));
            if (!rawOrdered || rawOrdered.length === 0) {
              return <p className="text-xs italic text-muted-foreground">No response submitted</p>;
            }
            return rawOrdered.map((val: string, idx: number) => {
              const opt = optionMap.get(val);
              const label = opt ? ((opt as any).text || (opt as any).option_text) : val;
              return (
                <div key={val || idx} className="flex items-center gap-3 rounded-lg border bg-muted/10 p-3 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">{idx + 1}</span>
                  <span className="font-medium">{label}</span>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/10 p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Your response</p>
          <p className="whitespace-pre-wrap text-sm">{sub?.answer_text || "No response submitted"}</p>
        </div>
      )}
    </section>
  );
}

export default function ResultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AssessmentResultResponse | null>(null);
  const [attempt, setAttempt] = useState<any | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [assessment, setAssessment] = useState<any | null>(null);

  useEffect(() => {
    async function loadResult() {
      try {
        const data = await resultApi.getResultByAttempt(attemptId);
        setResult(data);
      } catch {
        try {
          const attemptData = await attemptApi.getAttempt(attemptId);
          setAttempt(attemptData);
          if (attemptData?.assessment_id) {
            const [assessmentData, submissionsData] = await Promise.all([
              assessmentApi.getAssessmentById(attemptData.assessment_id).catch(() => null),
              submissionApi.getSubmissionsForAttempt(attemptId).catch(() => ({ submissions: [] })),
            ]);
            setAssessment(assessmentData);
            setSubmissions(submissionsData.submissions || []);
          }
        } catch (attemptErr) {
          console.error("Failed to load attempt details", attemptErr);
        }
      } finally {
        setLoading(false);
      }
    }
    loadResult();
  }, [attemptId]);

  function requestReview() {
    const subject = encodeURIComponent(`Result review request: ${result?.assessment_title || "Assessment"}`);
    const body = encodeURIComponent(
      `Please review my published result.\n\nAssessment: ${result?.assessment_title || ""}\nAttempt ID: ${result?.attempt_id || attemptId}\nCurrent score: ${result?.total_score}/${result?.max_score} (${Math.round(result?.percentage || 0)}%)\n\nReason for review:\n`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    toast.info("Review request prepared in your email client.");
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!result && attempt) {
    const title = assessment?.title || "Assessment Submission";
    const isSubmitted = attempt.status?.toUpperCase() === "SUBMITTED" || !!attempt.submitted_at;
    const hasOpen = attempt.questions?.some((q: any) => isOpenEnded(q.type));
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/student/results")} className="h-8 gap-1.5 border border-border/55 text-xs">
          <ArrowLeft className="size-3.5" />
          Results
        </Button>
        <section className="rounded-2xl border bg-card/45 p-6">
          <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary">
            {getAssessmentTypeBadge(title)}
          </span>
          <h1 className="mt-2 text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Submitted: {fmtDate(attempt.submitted_at || attempt.started_at, true)} - {attempt.questions?.length || 0} questions
          </p>
        </section>
        <section className="flex gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Marks not published yet</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              {hasOpen && isSubmitted
                ? "This assessment includes responses that need lecturer review. You will receive a notification when marks are published."
                : "Your submission was recorded. Marks will appear here once the lecturer publishes the results."}
            </p>
          </div>
        </section>
        {attempt.questions?.length > 0 && (
          <div className="space-y-3">
            <h2 className="px-1 text-sm font-semibold">Submitted responses</h2>
            {attempt.questions.map((q: any, index: number) => (
              <SubmittedQuestionCard
                key={q.id}
                q={q}
                sub={submissions.find((s) => s.question_id === q.id)}
                index={index}
              />
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 rounded-xl border bg-card/30 p-4">
          <Button variant="outline" size="sm" onClick={() => router.push("/student/results")} className="h-8 text-xs">Back to results</Button>
          <Button size="sm" onClick={() => window.location.reload()} className="h-8 gap-1.5 text-xs"><RefreshCw className="size-3.5" /> Refresh status</Button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="py-20 text-center">
        <Clock className="mx-auto mb-3 size-6 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Result not available</h2>
        <p className="mt-1 text-xs text-muted-foreground">This attempt could not be found or is not visible to your account.</p>
      </div>
    );
  }

  const pct = Math.round(result.percentage || 0);
  const title = result.assessment_title || "Assessment Result";

  return (
    <div className="result-paper space-y-4">
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          aside, header, nav, .no-print { display: none !important; }
          main { padding: 0 !important; background: white !important; min-height: auto !important; }
          .result-paper { padding: 24px !important; color: #0f172a !important; }
          .result-paper * { box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/student/results")} className="h-8 gap-1.5 border border-border/55 text-xs">
          <ArrowLeft className="size-3.5" />
          Results
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={requestReview} className="h-8 gap-1.5 text-xs">
            <MessageCircle className="size-3.5" />
            Request review
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 gap-1.5 text-xs">
            <Download className="size-3.5" />
            Download PDF
          </Button>
        </div>
      </div>

      {result.integrity_hold && (
        <section className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
          <p className="text-xs font-medium text-red-800">
            This result is provisional and under integrity review. The final result may differ after the audit is completed.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-border/50 bg-card/40 p-5 print:bg-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Image src="/icons/logo/Mindexa-logo.svg" alt="Mindexa" width={154} height={40} className="h-10 w-auto print:h-9" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Official result slip</p>
              <h1 className="mt-1 text-xl font-semibold leading-snug">{title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {result.course_code ? `${result.course_code} - ` : ""}{result.course_name || "Course not specified"}
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary">
            {getAssessmentTypeBadge(title)}
          </span>
        </div>

        <div className="mt-4 grid gap-2 border-t pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="text-muted-foreground">Institution</span><p className="font-medium">{result.institution_name || "Mindexa"}</p></div>
          <div><span className="text-muted-foreground">College</span><p className="font-medium">{result.college_name || "N/A"}</p></div>
          <div><span className="text-muted-foreground">Department</span><p className="font-medium">{result.department_name || "N/A"}</p></div>
          <div><span className="text-muted-foreground">Academic year</span><p className="font-medium">{result.academic_year || "N/A"}</p></div>
          <div><span className="text-muted-foreground">Released</span><p className="font-medium">{fmtDate(result.released_at, true)}</p></div>
          <div><span className="text-muted-foreground">Calculated</span><p className="font-medium">{fmtDate(result.calculated_at, true)}</p></div>
          <div><span className="text-muted-foreground">Attempt ID</span><p className="font-mono text-[10px]">{result.attempt_id}</p></div>
          <div><span className="text-muted-foreground">Result ID</span><p className="font-mono text-[10px]">{result.id}</p></div>
        </div>
      </section>

      <section className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card/40 p-5 print:bg-white">
        <ScoreRing pct={pct} isPassing={result.is_passing} />
        <div className="flex-1">
          <div className="flex items-baseline gap-1 tabular-nums">
            <span className="text-3xl font-semibold">{result.total_score}</span>
            <span className="text-sm text-muted-foreground">/ {result.max_score}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {pct}%{result.letter_grade ? ` - Grade ${result.letter_grade}` : ""}
          </p>
          <div className="mt-2">
            {result.is_passing ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 className="size-3" /> Passed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                <XCircle className="size-3" /> Did not pass
              </span>
            )}
          </div>
        </div>
        <div className="hidden text-right text-xs text-muted-foreground sm:block">
          <Calendar className="mb-1 ml-auto size-4" />
          {result.graded_question_count}/{result.total_question_count} questions graded
        </div>
      </section>

      {result.breakdowns?.length > 0 && <ScoreBreakdownCard breakdowns={result.breakdowns} />}

      {result.breakdowns?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Question review</h2>
            <span className="text-[10px] font-medium uppercase text-muted-foreground">{result.breakdowns.length} items</span>
          </div>
          {result.breakdowns.map((item, index) => (
            <QuestionCard key={item.id} item={item} index={index} />
          ))}
        </div>
      )}

      <section className="rounded-xl border bg-card/30 p-4 text-xs text-muted-foreground print:bg-white">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
          <Award className="size-3.5" />
          Result note
        </div>
        This result slip is generated by Mindexa from published assessment marks and lecturer feedback. Formal review requests are subject to the institution&apos;s assessment appeal policy and deadlines.
      </section>
    </div>
  );
}
