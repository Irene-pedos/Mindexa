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
  BookOpen,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Info,
  Layers,
  MessageCircle,
  MessageSquare,
  Printer,
  RefreshCw,
  School,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Table as TableIcon,
  Timer,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { assessmentApi } from "@/lib/api/assessment";
import { attemptApi } from "@/lib/api/attempt";
import { resultApi } from "@/lib/api/result";
import { submissionApi } from "@/lib/api/submission";
import {
  isOpenEnded,
  getQuestionTypeLabel,
  isQuestionAutoGraded,
  normalizeQuestionType,
  isTrueFalseType,
  isMcqType,
  isMatchingType,
  isFillBlankType,
  isOrderingType,
  isClosedChoiceType,
} from "@/lib/grading-utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";
import {
  TableContextViewer,
  StructuredTableData,
} from "@/components/mindexa/common/table-context-viewer";
import { StudentAnswerCanvas } from "@/components/mindexa/grading/student-answer-canvas";
import { cn } from "@/lib/utils";

interface BlankItem {
  blank_index?: number;
  accepted_answers?: string[];
  case_sensitive?: boolean;
  points?: number;
}

interface OptionBreakdown {
  id: string;
  content?: string;
  text?: string;
  marks?: number | null;
  match_value?: string | null;
  order_index?: number;
  is_correct: boolean;
  explanation?: string | null;
}

interface QuestionBreakdown {
  id: string;
  question_id: string;
  question_type: string;
  question_text: string;
  image_url?: string | null;
  imageUrl?: string | null;
  case_study_context?: string | null;
  question_table_context?: any;
  questionTableContext?: any;
  requires_table_answer?: boolean;
  requiresTableAnswer?: boolean;
  answer_table_template?: any;
  answerTableTemplate?: any;
  section_title?: string | null;
  max_score: number;
  awarded_score: number;
  score?: number | null;
  was_skipped?: boolean;
  is_correct: boolean | null;
  student_answer: string;
  student_answer_json?: any;
  correct_answer?: string | null;
  correct_answer_json?: any;
  model_answer?: string | null;
  feedback: string | null;
  feedback_author_basis?: string | null;
  grading_mode?: string | null;
  ai_confidence: number | null;
  ai_rationale?: string | null;
  ai_adjustments?: string | null;
  ai_rubric_scores?: Record<string, any> | null;
  options: OptionBreakdown[];
  blanks?: BlankItem[] | null;
}

interface AssessmentResultResponse {
  id: string;
  attempt_id?: string | null;
  group_submission_id?: string | null;
  is_group_result?: boolean;
  group_id?: string | null;
  group_name?: string | null;
  group_feedback?: string | null;
  student_id: string;
  assessment_id: string;
  assessment_title: string | null;
  academic_year?: string | null;
  course_code?: string | null;
  course_name?: string | null;
  institution_name?: string | null;
  institution_logo_url?: string | null;
  college_name?: string | null;
  school_name?: string | null;
  department_name?: string | null;
  option_name?: string | null;
  campus_name?: string | null;
  assessment_type?: string | null;
  duration_minutes?: number | null;
  window_start?: string | null;
  window_end?: string | null;
  class_name?: string | null;
  academic_level?: string | null;
  submitted_at?: string | null;
  started_at?: string | null;
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
  is_post_release_corrected?: boolean;
  post_release_corrected_at?: string | null;
  breakdowns: QuestionBreakdown[];
}

const BLANK_SPLIT_REGEX = /(?:_{3,}|\[blank\]|\{\{blank\}\})/gi;

function fmtDate(iso?: string | null, withTime = true) {
  if (!iso) return null;
  try {
    return format(
      new Date(iso),
      withTime ? "MMM d, yyyy 'at' h:mm a" : "MMM d, yyyy",
    );
  } catch {
    return null;
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
  if (parsed && typeof parsed === "object")
    return Object.values(parsed).map(String);
  if (item.student_answer)
    return item.student_answer
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
}

function feedbackBasisLabel(value?: string | null) {
  if (!value) return "Lecturer feedback";
  if (value === "AI") return "AI Evaluation";
  if (value === "AI_EDITED") return "AI Evaluation (Lecturer Verified)";
  return "Lecturer Feedback";
}

function getAssessmentTypeLabel(
  rawType?: string | null,
  title?: string | null,
) {
  const raw = (rawType || "").toUpperCase();
  const t = (title || "").toUpperCase();

  if (raw.includes("CAT") || t.includes("CAT"))
    return "Continuous Assessment Test (CAT)";
  if (
    raw.includes("SUMMATIVE") ||
    raw.includes("EXAM") ||
    t.includes("EXAM") ||
    t.includes("FINAL")
  )
    return "Summative Assessment (Exam)";
  if (raw.includes("FORMATIVE") || t.includes("FORMATIVE"))
    return "Formative Assessment";
  if (raw.includes("GROUP") || t.includes("GROUP"))
    return "Group Work Assessment";
  if (raw.includes("QUIZ") || t.includes("QUIZ")) return "Quiz";
  if (raw.includes("PRACTICAL") || raw.includes("LAB") || t.includes("LAB"))
    return "Practical / Lab Assessment";
  if (raw.includes("COMPUTATIONAL")) return "Computational Assessment";
  return rawType ? rawType.replace(/_/g, " ") : "Institutional Assessment";
}

function ScoreRing({ pct, isPassing }: { pct: number; isPassing: boolean }) {
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * circ;

  return (
    <svg
      viewBox="0 0 96 96"
      width={96}
      height={96}
      className="shrink-0"
      aria-hidden="true"
    >
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth="8"
      />
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
      <text
        x="48"
        y="45"
        textAnchor="middle"
        className="fill-foreground text-sm font-bold"
      >
        {pct}%
      </text>
      <text
        x="48"
        y="60"
        textAnchor="middle"
        className="fill-muted-foreground text-[9px] uppercase font-bold tracking-wider"
      >
        Score
      </text>
    </svg>
  );
}

function ScoreBadge({ item }: { item: QuestionBreakdown }) {
  const currentScore = item.awarded_score ?? item.score;
  const pending = currentScore === null || currentScore === undefined;
  if (item.was_skipped) {
    return (
      <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground border border-border/50">
        Skipped (0/{item.max_score})
      </span>
    );
  }
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
        <Clock className="size-3" /> Awaiting Review
      </span>
    );
  }

  const isFull = currentScore !== null && currentScore >= item.max_score;
  const isPartial =
    currentScore !== null && currentScore > 0 && currentScore < item.max_score;

  let tone =
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (!isFull) {
    tone = isPartial
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      : "border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold font-mono",
        tone,
      )}
    >
      {isFull ? (
        <CheckCircle2 className="size-3.5" />
      ) : isPartial ? (
        <AlertTriangle className="size-3.5" />
      ) : (
        <XCircle className="size-3.5" />
      )}
      {currentScore}/{item.max_score} Marks
    </span>
  );
}

function DiagnosticFeedbackBlock({ item }: { item: QuestionBreakdown }) {
  const currentScore = item.awarded_score ?? item.score;
  const isDeducted =
    currentScore === null || currentScore === undefined
      ? false
      : currentScore < item.max_score ||
        item.is_correct === false ||
        Boolean(item.was_skipped);

  if (!item.feedback && !isDeducted) return null;

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 space-y-2 print:border-slate-300 print:bg-white",
        isDeducted
          ? "border-amber-500/25 bg-amber-50/40 dark:bg-amber-950/20 text-amber-950 dark:text-amber-100"
          : "border-primary/20 bg-primary/5 text-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-inherit/40 pb-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider",
            isDeducted ? "text-amber-800 dark:text-amber-300" : "text-primary",
          )}
        >
          {isDeducted ? (
            <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
          ) : (
            <Sparkles className="size-3.5 text-primary" />
          )}
          {isDeducted
            ? "Performance Analysis & Improvement Guidance"
            : "Evaluation Feedback"}
        </span>
        <span className="rounded-full bg-background/80 px-2 py-0.5 text-[9px] font-bold uppercase border border-inherit/40">
          {feedbackBasisLabel(item.feedback_author_basis)}
        </span>
      </div>

      {item.feedback ? (
        <div className="text-xs leading-relaxed font-medium">
          {renderRichMathText(item.feedback)}
        </div>
      ) : isDeducted && item.was_skipped ? (
        <p className="text-xs italic text-muted-foreground">
          No response was submitted for this question (0/{item.max_score}{" "}
          marks). Review the question requirements and reference materials to
          master this topic.
        </p>
      ) : isDeducted ? (
        <div className="text-xs space-y-1 text-muted-foreground font-medium">
          <p>
            Marks deducted ({currentScore ?? 0} out of {item.max_score} marks
            awarded).
          </p>
          {item.correct_answer && (
            <div className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-start gap-1">
              <span className="shrink-0">Expected Target:</span>
              <span>{renderRichMathText(item.correct_answer)}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function QuestionCard({
  item,
  index,
}: {
  item: QuestionBreakdown;
  index: number;
}) {
  const hasReferenceTable = !!(
    item.question_table_context || item.questionTableContext
  );
  const requiresTable = !!(
    item.requires_table_answer || item.requiresTableAnswer
  );
  const parsedAnswer = safeJson(
    item.student_answer_json ?? item.student_answer,
  );
  const answerObject =
    parsedAnswer &&
    typeof parsedAnswer === "object" &&
    !Array.isArray(parsedAnswer)
      ? (parsedAnswer as Record<string, any>)
      : {};
  const normalizedSubmission = {
    ...item,
    answer_content: answerObject,
    selected_option_ids:
      answerObject.selected_option_ids ??
      (Array.isArray(parsedAnswer) ? parsedAnswer : undefined),
    match_pairs_json: answerObject.match_pairs_json,
    ordered_option_ids: answerObject.ordered_option_ids,
    fill_blank_answers: answerObject.fill_blank_answers,
    answer_text:
      typeof parsedAnswer === "string" ? parsedAnswer : item.student_answer,
  };

  return (
    <section className="rounded-2xl border border-border/70 bg-card text-card-foreground p-4 md:p-5 shadow-none print:break-inside-avoid print:bg-white space-y-3.5">
      <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Question {index + 1}
            </span>
            {item.section_title && (
              <Badge
                variant="outline"
                className="text-[9px] font-semibold text-muted-foreground border-border/60"
              >
                {item.section_title}
              </Badge>
            )}
            {requiresTable && (
              <Badge
                variant="outline"
                className="text-[9px] h-4.5 py-0 px-1.5 font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20 gap-1"
              >
                <TableIcon className="size-2.5" /> Table Response Required
              </Badge>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
            {getQuestionTypeLabel(item.question_type)} • Total: {item.max_score}{" "}
            {item.max_score === 1 ? "mark" : "marks"}
          </p>
        </div>
        <ScoreBadge item={item} />
      </div>

      {item.question_text && (
        <div className="text-sm font-semibold leading-relaxed text-foreground">
          {renderRichMathText(item.question_text)}
        </div>
      )}

      {hasReferenceTable && (
        <div className="space-y-1.5 p-3 rounded-xl border border-border bg-muted/10">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <TableIcon className="size-3 text-primary" /> Question Stem
            Reference Table
          </div>
          <TableContextViewer
            data={item.question_table_context || item.questionTableContext}
          />
        </div>
      )}

      {item.imageUrl && (
        <div className="p-1 border border-border/40 rounded-xl bg-muted/5 inline-block relative max-w-full overflow-hidden">
          <Image
            src={item.imageUrl}
            alt="Question illustration context"
            width={480}
            height={270}
            className="max-h-[220px] rounded-lg object-contain w-auto h-auto"
          />
        </div>
      )}

      {/* Unified Student Answer Response Renderer */}
      <StudentAnswerCanvas
        currentQuestion={item}
        currentSubmission={normalizedSubmission}
        maxMarks={item.max_score}
        showCorrectAnswers={true}
      />

      {/* Diagnostics / Feedback Block */}
      <DiagnosticFeedbackBlock item={item} />

      {item.grading_mode?.toLowerCase().includes("ai") && (
        <div className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground pt-1">
          <Cpu className="size-3 text-primary" />
          Explainable AI-assisted grading verified by authorized course lecturer
        </div>
      )}
    </section>
  );
}

function ScoreBreakdownCard({
  breakdowns,
}: {
  breakdowns: QuestionBreakdown[];
}) {
  const groups = useMemo(() => {
    const map = new Map<string, QuestionBreakdown[]>();
    for (const item of breakdowns) {
      const key =
        item.section_title || getQuestionTypeLabel(item.question_type);
      map.set(key, [...(map.get(key) || []), item]);
    }
    return Array.from(map.entries()).map(([name, items]) => {
      const score = items.reduce(
        (sum, item) => sum + (item.awarded_score ?? item.score ?? 0),
        0,
      );
      const total = items.reduce((sum, item) => sum + (item.max_score ?? 0), 0);
      return {
        name,
        items,
        score,
        total,
        pct: total > 0 ? Math.round((score / total) * 100) : 0,
      };
    });
  }, [breakdowns]);

  return (
    <Card className="rounded-2xl border border-border/70 bg-card text-card-foreground shadow-none print:bg-white">
      <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/40">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Layers className="size-3.5" /> Sectional Score Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {groups.map((group) => (
          <div key={group.name} className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="font-semibold text-foreground">
                {group.name}
              </span>
              <span className="tabular-nums font-mono text-muted-foreground">
                {group.score} / {group.total} Marks ({group.pct}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  group.pct >= 50 ? "bg-emerald-600" : "bg-rose-500",
                )}
                style={{ width: `${group.pct}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SubmittedQuestionCard({
  q,
  sub,
  index,
}: {
  q: any;
  sub: any;
  index: number;
}) {
  const hasReferenceTable = !!(
    q.question_table_context || q.questionTableContext
  );
  const requiresTable = !!(q.requires_table_answer || q.requiresTableAnswer);
  const questionText = q.text || q.content || "";

  return (
    <section className="rounded-2xl border border-border/60 bg-card/30 p-4 space-y-3.5">
      <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold text-foreground">
              Question {index + 1}
            </p>
            {requiresTable && (
              <Badge
                variant="outline"
                className="text-[9px] h-4.5 py-0 px-1.5 font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20 gap-1"
              >
                <TableIcon className="size-2.5" /> Table Response Required
              </Badge>
            )}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
            {getQuestionTypeLabel(q.type || q.question_type)} • {q.marks}{" "}
            {q.marks === 1 ? "mark" : "marks"}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground border">
          {sub?.is_skipped ? "Skipped" : "Submitted"}
        </span>
      </div>

      {questionText && (
        <div className="text-sm font-medium text-foreground">
          {renderRichMathText(questionText)}
        </div>
      )}

      {hasReferenceTable && (
        <div className="space-y-1.5 p-3 rounded-xl border border-border bg-muted/10">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <TableIcon className="size-3 text-primary" /> Question Stem
            Reference Table
          </div>
          <TableContextViewer
            data={q.question_table_context || q.questionTableContext}
          />
        </div>
      )}

      <StudentAnswerCanvas
        currentQuestion={q}
        currentSubmission={sub}
        maxMarks={q.marks}
        showCorrectAnswers={false}
      />
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

  // Request Review Dialog State
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewType, setReviewType] = useState("recalculation");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

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
              assessmentApi
                .getAssessmentById(attemptData.assessment_id)
                .catch(() => null),
              submissionApi.getSubmissionsForAttempt(attemptId).catch(() => ({
                submissions: [],
              })),
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

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reviewNotes.trim().length < 10) {
      toast.error(
        "Please provide at least 10 characters detailing your review request.",
      );
      return;
    }

    setReviewSubmitting(true);
    try {
      // Simulate backend review dispatch / ticket logging
      await new Promise((resolve) => setTimeout(resolve, 800));
      toast.success(
        "Your result review request has been logged and forwarded to the course faculty.",
      );
      setReviewDialogOpen(false);
      setReviewNotes("");
    } catch {
      toast.error("Failed to submit review request. Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-2">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!result && attempt) {
    const title = assessment?.title || "Assessment Submission";
    const isSubmitted =
      attempt.status?.toUpperCase() === "SUBMITTED" || !!attempt.submitted_at;
    const hasOpen = attempt.questions?.some((q: any) => isOpenEnded(q.type));

    return (
      <div className="space-y-4 p-1 md:p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/student/results")}
          className="h-8 gap-1.5 border border-border/55 text-xs rounded-lg"
        >
          <ArrowLeft className="size-3.5" /> Results
        </Button>
        <section className="rounded-2xl border border-border/70 bg-card p-6 space-y-2">
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/5 text-primary text-[10px] font-bold uppercase"
          >
            {getAssessmentTypeLabel(assessment?.assessment_type, title)}
          </Badge>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground font-medium">
            Submitted:{" "}
            {fmtDate(attempt.submitted_at || attempt.started_at, true)} •{" "}
            {attempt.questions?.length || 0} questions
          </p>
        </section>

        <section className="flex gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5">
          <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-amber-950 dark:text-amber-200">
              Marks Awaiting Faculty Release
            </p>
            <p className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-300 font-medium">
              {hasOpen && isSubmitted
                ? "This assessment contains subjective questions requiring lecturer evaluation. You will receive an alert as soon as results are officially released."
                : "Your answers are securely recorded. Marks will become visible once the lecturer finalizes the grade publishing phase."}
            </p>
          </div>
        </section>

        {attempt.questions?.length > 0 && (
          <div className="space-y-3">
            <h2 className="px-1 text-sm font-bold text-foreground">
              Submitted Responses
            </h2>
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

        <div className="flex justify-end gap-2 rounded-2xl border border-border/60 bg-card/30 p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/student/results")}
            className="h-8 text-xs rounded-xl"
          >
            Back to Results
          </Button>
          <Button
            size="sm"
            onClick={() => window.location.reload()}
            className="h-8 gap-1.5 text-xs rounded-xl"
          >
            <RefreshCw className="size-3.5" /> Refresh Status
          </Button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="size-12 bg-muted/40 rounded-2xl flex items-center justify-center mx-auto text-muted-foreground/50">
          <Clock className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-foreground">
            Result Not Available
          </h2>
          <p className="text-xs text-muted-foreground">
            This attempt record could not be found or has not been released.
          </p>
        </div>
      </div>
    );
  }

  const pct = Math.round(result.percentage || 0);
  const title = result.assessment_title || "Official Assessment Result";
  const assessmentTypeLabel = getAssessmentTypeLabel(
    result.assessment_type,
    result.assessment_title,
  );

  return (
    <div className="result-paper relative space-y-5 w-full mx-auto animate-in fade-in duration-300 pb-10">
      {/* ── Official Mindexa Print & Watermark Styles ── */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          aside,
          header,
          nav,
          .no-print {
            display: none !important;
          }
          main {
            padding: 0 !important;
            background: white !important;
            min-height: auto !important;
          }
          .result-paper {
            padding: 20px !important;
            color: #0f172a !important;
          }
          .result-watermark-overlay {
            display: flex !important;
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) rotate(-15deg) !important;
            width: 80% !important;
            max-width: 600px !important;
            opacity: 0.04 !important;
            pointer-events: none !important;
            z-index: 0 !important;
          }
        }
      `}</style>

      {/* Background Watermark (Low Opacity Mindexa Wordmark for Screen & Print) */}
      <div
        className="result-watermark-overlay pointer-events-none select-none fixed inset-0 flex items-center justify-center overflow-hidden z-0 opacity-[0.03] dark:opacity-[0.04]"
        aria-hidden="true"
      >
        <div className="w-[600px] max-w-[85vw] -rotate-12 transform">
          <Image
            src="/icons/logo/Mindexa-wordmark.svg"
            alt=""
            width={600}
            height={104}
            className="w-full h-auto"
            priority
          />
        </div>
      </div>

      {/* ── Top Action Bar (Screen Only) ── */}
      <div className="no-print flex items-center justify-between gap-3 pb-3 border-b border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/student/results")}
          className="h-8.5 gap-1.5 border border-border/60 text-xs rounded-xl"
        >
          <ArrowLeft className="size-3.5" /> Back to Results
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (result.is_group_result) {
                toast.info(
                  "Group work appeals must be initiated collaboratively via the Group Workspace.",
                );
                router.push(`/student/group-work/${result.assessment_id}`);
                return;
              }
              setReviewDialogOpen(true);
            }}
            className="h-8.5 gap-1.5 text-xs rounded-xl border-border/60 font-semibold"
          >
            <MessageCircle className="size-3.5 text-primary" />
            Request Review
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => window.print()}
            className="h-8.5 gap-1.5 text-xs rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold shadow-none"
          >
            <Printer className="size-3.5" />
            Print Transcript (PDF)
          </Button>
        </div>
      </div>

      {/* Integrity Hold Alert Banner */}
      {result.integrity_hold && (
        <section className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
          <p className="text-xs font-semibold text-rose-900 dark:text-rose-200 leading-relaxed">
            Provisional Result Notice: This score is currently undergoing
            routine institutional audit. Final certified records will be updated
            upon audit completion.
          </p>
        </section>
      )}

      {/* ── Official Institutional Document Header ── */}
      <section className="relative rounded-2xl border border-border/70 bg-card text-card-foreground p-5 md:p-6 shadow-none print:bg-white space-y-4">
        {/* Top Logo Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          {/* Mindexa Platform Brand */}
          <div className="flex items-center gap-2.5">
            <Image
              src="/icons/logo/Mindexa-logo.svg"
              alt="Mindexa Platform"
              width={140}
              height={36}
              className="h-8 w-auto print:h-7"
            />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground pl-2 border-l border-border/60">
              Verified Transcript Slip
            </span>
          </div>

          {/* Institutional Brand / Logo */}
          <div className="flex items-center gap-2.5">
            {result.institution_logo_url ? (
              <div className="relative size-8 rounded-lg overflow-hidden border border-border/50 bg-muted">
                <Image
                  src={result.institution_logo_url}
                  alt={result.institution_name || "Institution"}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <School className="size-4" />
              </div>
            )}
            <div className="text-right">
              <span className="text-xs font-bold text-foreground block">
                {result.institution_name || "Institutional Assessment Body"}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                Academic Integrity Operating System
              </span>
            </div>
          </div>
        </div>

        {/* Assessment Heading & Type */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pt-1">
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground leading-tight">
              {title}
            </h1>
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
              <BookOpen className="size-3.5 text-primary" />
              {result.course_code ? (
                <span className="font-mono text-foreground font-bold">
                  {result.course_code}
                </span>
              ) : null}
              {result.course_name ? (
                <span>• {result.course_name}</span>
              ) : (
                <span>• Academic Course Assessment</span>
              )}
            </p>
          </div>

          <Badge
            variant="outline"
            className="w-fit rounded-full border-primary/30 bg-primary/5 text-primary text-[10px] font-bold uppercase px-3 py-1"
          >
            {assessmentTypeLabel}
          </Badge>
        </div>

        {/* Structured Academic & Assessment Context (matching student onboarding layout) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-3 border-t border-border/40 bg-muted/5 p-3.5 rounded-xl border border-muted/20">
          {/* College */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <School className="size-3 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                College:
              </span>
            </div>
            <p
              className="text-xs font-semibold text-foreground truncate"
              title={
                result.college_name ||
                result.school_name ||
                result.institution_name ||
                "Institutional Faculty"
              }
            >
              {result.college_name ||
                result.school_name ||
                result.institution_name ||
                "Faculty / College"}
            </p>
          </div>

          {/* Department */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="size-3 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Department:
              </span>
            </div>
            <p
              className="text-xs font-semibold text-foreground truncate"
              title={result.department_name || "General Department"}
            >
              {result.department_name || "General Department"}
            </p>
          </div>

          {/* Option / Degree Program */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Layers className="size-3 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Option:
              </span>
            </div>
            <p
              className="text-xs font-semibold text-foreground truncate"
              title={result.option_name || "Degree Program"}
            >
              {result.option_name || "Degree Program"}
            </p>
          </div>

          {/* Academic Level */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <GraduationCap className="size-3 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Academic Level:
              </span>
            </div>
            <p
              className="text-xs font-semibold text-foreground truncate"
              title={result.academic_level || "Undergraduate Program"}
            >
              {result.academic_level || "Undergraduate Program"}
            </p>
          </div>

          {/* Class */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-3 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Class / Cohort:
              </span>
            </div>
            <p
              className="text-xs font-semibold text-foreground truncate"
              title={result.class_name || "Standard Section"}
            >
              {result.class_name || "Standard Class Section"}
            </p>
          </div>

          {/* Academic Year */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="size-3 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Academic Year:
              </span>
            </div>
            <p
              className="text-xs font-semibold text-foreground truncate"
              title={result.academic_year || "Current Academic Session"}
            >
              {result.academic_year || "Current Session"}
            </p>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="size-3 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Assessment Date:
              </span>
            </div>
            <p className="text-xs font-semibold text-foreground truncate">
              {fmtDate(
                result.window_start ||
                  result.submitted_at ||
                  result.calculated_at,
                false,
              ) || "Scheduled"}
            </p>
          </div>

          {/* Duration / Time */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Timer className="size-3 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Duration / Time:
              </span>
            </div>
            <p className="text-xs font-semibold text-foreground truncate">
              {result.duration_minutes
                ? `${result.duration_minutes} Minutes`
                : "Standard Duration"}
            </p>
          </div>

          {/* Submitted At */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3 text-primary shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Completed At:
              </span>
            </div>
            <p className="text-xs font-semibold text-foreground truncate">
              {fmtDate(result.submitted_at || result.calculated_at, true) ||
                "Recorded"}
            </p>
          </div>
        </div>
      </section>

      {/* ── Score Performance Summary ── */}
      <section className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-border/70 bg-card text-card-foreground p-5 md:p-6 shadow-none print:bg-white">
        <ScoreRing pct={pct} isPassing={result.is_passing} />

        <div className="flex-1 space-y-1 text-center sm:text-left">
          <div className="flex items-baseline justify-center sm:justify-start gap-2 tabular-nums">
            <span className="text-3xl md:text-4xl font-extrabold text-foreground font-mono">
              {result.total_score}
            </span>
            <span className="text-base font-bold text-muted-foreground">
              / {result.max_score} Marks
            </span>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">
            Cumulative Percentage:{" "}
            <span className="text-foreground font-bold">{pct}%</span>
            {result.letter_grade && (
              <span>
                {" "}
                • Grade Classification:{" "}
                <span className="font-bold text-primary">
                  {result.letter_grade}
                </span>
              </span>
            )}
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2">
            {result.is_passing ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3.5" /> Satisfactory Assessment
                Pass
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                <XCircle className="size-3.5" /> Did Not Meet Passing Standard
              </span>
            )}
            {result.is_post_release_corrected && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                <ShieldCheck className="size-3.5" /> Official Faculty Moderation
                Adjustment
              </span>
            )}
          </div>
        </div>

        <div className="hidden sm:block text-right text-xs text-muted-foreground border-l border-border/40 pl-5 space-y-1">
          <div className="flex items-center justify-end gap-1.5 font-bold text-foreground">
            <Calendar className="size-3.5 text-muted-foreground" />
            <span>Grading Completed</span>
          </div>
          <p className="text-[11px]">
            {result.graded_question_count} of {result.total_question_count}{" "}
            items graded
          </p>
        </div>
      </section>

      {/* ── Collaborative Group Work Summary Card ── */}
      {result.is_group_result && (
        <section className="rounded-2xl border border-primary/25 bg-primary/[0.03] p-5 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/15 pb-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                <Users className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground">
                    Collaborative Group Assessment
                  </h2>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-bold border-primary/30 text-primary bg-primary/5"
                  >
                    Team Result
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Team Name:{" "}
                  <span className="font-semibold text-foreground">
                    {result.group_name || "Assigned Group"}
                  </span>
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() =>
                router.push(`/student/group-work/${result.assessment_id}`)
              }
              className="h-8 gap-1.5 text-xs rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
            >
              <ExternalLink className="size-3.5" />
              Open Group Workspace
            </Button>
          </div>

          {result.group_feedback && (
            <div className="rounded-xl border border-border/70 bg-card p-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <MessageSquare className="size-3.5 text-primary" />
                Faculty Evaluation & Team Feedback
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {result.group_feedback}
              </p>
            </div>
          )}

          <div className="flex items-start gap-2.5 text-xs text-muted-foreground bg-muted/40 rounded-xl p-3.5 border border-border/50">
            <Info className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Individual student grades for group assessments are derived
              directly from the team submission. Detailed collaborative answers,
              member contributions, peer reviews, and group-wide grade appeals
              are accessed within the{" "}
              <span className="font-semibold text-foreground">
                Group Workspace
              </span>
              .
            </p>
          </div>
        </section>
      )}

      {/* Sectional Breakdown */}
      {result.breakdowns?.length > 0 && (
        <ScoreBreakdownCard breakdowns={result.breakdowns} />
      )}

      {/* ── Detailed Question-by-Question Review ── */}
      {result.breakdowns?.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <FileText className="size-4 text-primary" /> Itemized Question
                Review & Diagnostics
              </h2>
              <p className="text-xs text-muted-foreground">
                Item evaluation, answer validation, and actionable revision
                feedback.
              </p>
            </div>
            <Badge
              variant="outline"
              className="text-xs font-mono font-bold text-muted-foreground"
            >
              {result.breakdowns.length} Questions
            </Badge>
          </div>

          <div className="space-y-4">
            {result.breakdowns.map((item, index) => (
              <QuestionCard key={item.id} item={item} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Institutional Note & Footer */}
      <section className="rounded-2xl border border-border/70 bg-card text-card-foreground p-4 text-xs text-muted-foreground print:bg-white space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <Award className="size-3.5 text-primary" /> Official Transcript Notice
          & Institutional Policy
        </div>
        <p className="leading-relaxed">
          This verified result slip was generated via Mindexa for institutional
          academic record-keeping. Formal grade inquiries and recalculation
          appeals are handled in accordance with the institution&apos;s
          assessment policy.
        </p>
      </section>

      {/* ── Request Review / Appeal Modal Dialog ── */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-border bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <MessageCircle className="size-4 text-primary" /> Request Mark
              Review / Appeal
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Submit a formal assessment inquiry for &quot;
              <span className="font-semibold text-foreground">{title}</span>
              &quot; (Current Score: {result.total_score}/{result.max_score}{" "}
              Marks).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReviewSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Inquiry Category</Label>
              <Select value={reviewType} onValueChange={setReviewType}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-border/70 bg-background font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs">
                  <SelectItem value="recalculation">
                    Score Recalculation / Verification
                  </SelectItem>
                  <SelectItem value="question_appeal">
                    Specific Question Appeal / Rubric Query
                  </SelectItem>
                  <SelectItem value="technical">
                    Technical Submission Discrepancy
                  </SelectItem>
                  <SelectItem value="other">
                    Other Academic Clarification
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Reason & Detailed Justification{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Explain the reason for your review request and specify relevant question numbers..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="min-h-[100px] text-xs rounded-xl bg-background border-border/70 font-medium"
                required
              />
              <p className="text-[10px] text-muted-foreground">
                Minimum 10 characters required. Your request will be forwarded
                to the course lecturer.
              </p>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReviewDialogOpen(false)}
                className="h-8 text-xs font-semibold rounded-xl border-border/60"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={reviewSubmitting || reviewNotes.trim().length < 10}
                className="h-8 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground"
              >
                <Send className="size-3 mr-1.5" /> Submit Appeal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
