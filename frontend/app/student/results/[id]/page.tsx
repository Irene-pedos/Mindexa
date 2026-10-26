// app/student/results/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  GraduationCap,
  Info,
  Layers,
  MessageCircle,
  MessageSquare,
  Printer,
  RefreshCw,
  School,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Table as TableIcon,
  Timer,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { assessmentApi } from "@/lib/api/assessment";
import { attemptApi } from "@/lib/api/attempt";
import { resultApi } from "@/lib/api/result";
import { appealApi, APPEAL_REASON_MIN_LENGTH } from "@/lib/api/appeals";
import { submissionApi } from "@/lib/api/submission";
import {
  isOpenEnded,
  getQuestionTypeLabel,
  isMatchingType,
  isFillBlankType,
  isOrderingType,
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
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";
import { TableContextViewer } from "@/components/mindexa/common/table-context-viewer";
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
  topic_tag?: string | null;
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
  course_id?: string | null;
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

function feedbackBasisLabel(value?: string | null) {
  if (!value) return "Lecturer Feedback";
  if (value === "AI") return "Automated Evaluation";
  if (value === "AI_EDITED") return "Lecturer Verified";
  return "Lecturer Feedback";
}

function getAssessmentTypeLabel(rawType?: string | null, title?: string | null) {
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
    return "Final Examination";
  if (raw.includes("FORMATIVE") || t.includes("FORMATIVE"))
    return "Formative Assessment";
  if (raw.includes("GROUP") || t.includes("GROUP"))
    return "Group Assessment";
  if (raw.includes("QUIZ") || t.includes("QUIZ")) return "Quiz";
  if (raw.includes("PRACTICAL") || raw.includes("LAB") || t.includes("LAB"))
    return "Practical / Lab Assessment";
  if (raw.includes("COMPUTATIONAL")) return "Computational Assessment";
  return rawType ? rawType.replace(/_/g, " ") : "Assessment";
}

function ScoreGauge({ pct, isPassing }: { pct: number; isPassing: boolean }) {
  const radius = 34;
  const circ = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * circ;

  return (
    <div className="relative flex items-center justify-center shrink-0">
      <svg viewBox="0 0 84 84" width={84} height={84} className="shrink-0 -rotate-90">
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted/60 dark:text-muted/30"
        />
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          className={cn(
            "transition-all duration-500 ease-out",
            isPassing
              ? "text-emerald-600 dark:text-emerald-500"
              : "text-rose-600 dark:text-rose-500",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-base font-bold leading-none text-foreground tabular-nums">
          {pct}%
        </span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">
          Score
        </span>
      </div>
    </div>
  );
}

function QuestionScoreBadge({ item }: { item: QuestionBreakdown }) {
  const currentScore = item.awarded_score ?? item.score;
  const pending = currentScore === null || currentScore === undefined;

  if (item.was_skipped) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground border border-border/40">
        Skipped (0/{item.max_score})
      </span>
    );
  }

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200/80 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <Clock className="size-3" /> Awaiting Review
      </span>
    );
  }

  const isFull = currentScore >= item.max_score;
  const isPartial = currentScore > 0 && currentScore < item.max_score;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold font-mono tracking-tight",
        isFull &&
          "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300",
        isPartial &&
          "border-amber-200/80 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
        !isFull &&
          !isPartial &&
          "border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300",
      )}
    >
      {isFull ? (
        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : isPartial ? (
        <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
      ) : (
        <XCircle className="size-3.5 text-rose-600 dark:text-rose-400" />
      )}
      {currentScore} / {item.max_score} {item.max_score === 1 ? "Mark" : "Marks"}
    </span>
  );
}

function FeedbackCallout({ item }: { item: QuestionBreakdown }) {
  const currentScore = item.awarded_score ?? item.score;
  const isDeducted =
    currentScore !== null &&
    currentScore !== undefined &&
    currentScore < item.max_score;

  if (!item.feedback && !isDeducted) return null;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-xs space-y-1.5",
        isDeducted
          ? "border-amber-200/70 bg-amber-50/50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100"
          : "border-border/60 bg-muted/40 text-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold inline-flex items-center gap-1.5 text-foreground">
          {item.feedback ? (
            <MessageSquare className="size-3.5 text-primary" />
          ) : (
            <Info className="size-3.5 text-amber-600 dark:text-amber-400" />
          )}
          {item.feedback ? "Lecturer Feedback" : "Mark Deduction Note"}
        </span>
        {item.feedback_author_basis && (
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            {feedbackBasisLabel(item.feedback_author_basis)}
          </span>
        )}
      </div>

      {item.feedback ? (
        <div className="leading-relaxed">
          {renderRichMathText(item.feedback)}
        </div>
      ) : item.was_skipped ? (
        <p className="text-muted-foreground italic">
          This question was skipped (0 / {item.max_score} marks). Review the question materials to master this concept.
        </p>
      ) : isDeducted ? (
        <div className="space-y-1 text-muted-foreground">
          <p>
            {currentScore ?? 0} of {item.max_score} marks awarded.
          </p>
          {item.correct_answer && (
            <div className="text-emerald-700 dark:text-emerald-400 font-medium flex items-start gap-1">
              <span className="shrink-0 font-semibold">Expected Answer:</span>
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

  const isFillBlank = isFillBlankType(item.question_type);
  const isMatching = isMatchingType(item.question_type);
  const isOrdering = isOrderingType(item.question_type);

  const fillBlankAnswers =
    answerObject.fill_blank_answers ??
    (isFillBlank && parsedAnswer && typeof parsedAnswer === "object" && !Array.isArray(parsedAnswer)
      ? parsedAnswer
      : undefined);

  const normalizedSubmission = {
    ...item,
    answer_content: answerObject,
    selected_option_ids:
      answerObject.selected_option_ids ??
      (Array.isArray(parsedAnswer) ? parsedAnswer : undefined),
    match_pairs_json:
      answerObject.match_pairs_json ??
      (isMatching && typeof parsedAnswer === "object" ? parsedAnswer : undefined),
    ordered_option_ids:
      answerObject.ordered_option_ids ??
      (isOrdering && Array.isArray(parsedAnswer) ? parsedAnswer : undefined),
    fill_blank_answers: fillBlankAnswers,
    student_answer_json: item.student_answer_json ?? parsedAnswer,
    answer_text:
      typeof parsedAnswer === "string" ? parsedAnswer : item.student_answer,
  };

  return (
    <article
      id={`question-${index + 1}`}
      className="scroll-mt-6 rounded-xl border border-border/70 bg-card text-card-foreground p-4 sm:p-5 shadow-xs transition-all duration-200 ease-linear print:break-inside-avoid print:bg-white space-y-3.5 w-full min-w-0"
    >
      {/* Question Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/40 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            Question {index + 1}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] font-medium text-muted-foreground border-border/60"
          >
            {getQuestionTypeLabel(item.question_type)}
          </Badge>
          {item.section_title && (
            <Badge
              variant="outline"
              className="text-[10px] font-medium text-muted-foreground border-border/60"
            >
              {item.section_title}
            </Badge>
          )}
          {requiresTable && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 font-medium bg-primary/5 text-primary border-primary/20 gap-1"
            >
              <TableIcon className="size-2.5" /> Table Required
            </Badge>
          )}
        </div>
        <QuestionScoreBadge item={item} />
      </div>

      {/* Question Stem Text */}
      {item.question_text && (
        <div className="text-sm font-medium leading-relaxed text-foreground">
          {renderRichMathText(item.question_text)}
        </div>
      )}

      {/* Reference Table Context */}
      {hasReferenceTable && (
        <div className="space-y-1.5 p-3 rounded-lg border border-border/60 bg-muted/20">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <TableIcon className="size-3 text-primary" /> Reference Table
          </div>
          <TableContextViewer
            data={item.question_table_context || item.questionTableContext}
          />
        </div>
      )}

      {/* Question Illustration Context */}
      {item.imageUrl && (
        <div className="p-1 border border-border/40 rounded-lg bg-muted/10 inline-block relative max-w-full overflow-hidden">
          <Image
            src={item.imageUrl}
            alt="Question reference context"
            width={480}
            height={260}
            className="max-h-[220px] rounded-md object-contain w-auto h-auto"
          />
        </div>
      )}

      {/* Student Answer Canvas */}
      <StudentAnswerCanvas
        currentQuestion={item}
        currentSubmission={normalizedSubmission}
        maxMarks={item.max_score}
        showCorrectAnswers={true}
      />

      {/* Lecturer Feedback / Mark Notes */}
      <FeedbackCallout item={item} />
    </article>
  );
}

const WEAK_TOPIC_THRESHOLD_PCT = 60;

function ImproveTopicsCard({ breakdowns }: { breakdowns: QuestionBreakdown[] }) {
  const weak = useMemo(() => {
    const totals = new Map<string, { score: number; max: number }>();
    for (const item of breakdowns) {
      const tag = item.topic_tag?.trim();
      if (!tag || !item.max_score) continue;
      const entry = totals.get(tag) ?? { score: 0, max: 0 };
      entry.score += item.score ?? 0;
      entry.max += item.max_score;
      totals.set(tag, entry);
    }
    return Array.from(totals, ([topic, { score, max }]) => ({
      topic,
      pct: (score / max) * 100,
    }))
      .filter((t) => t.pct < WEAK_TOPIC_THRESHOLD_PCT)
      .sort((a, b) => a.pct - b.pct);
  }, [breakdowns]);

  if (weak.length === 0) return null;

  return (
    <Card className="rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs w-full min-w-0 transition-all duration-200 ease-linear">
      <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/40">
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" /> Recommended Revision Topics
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Topics scored below {WEAK_TOPIC_THRESHOLD_PCT}%. Open the AI tutor to master these areas:
        </p>
        <div className="flex flex-wrap gap-2">
          {weak.map((t) => (
            <Button key={t.topic} asChild variant="outline" size="sm" className="h-7 text-xs rounded-lg">
              <Link href={`/student/study/tutor?topic=${encodeURIComponent(t.topic)}`}>
                {t.topic} ({Math.round(t.pct)}%)
              </Link>
            </Button>
          ))}
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs rounded-lg">
            <Link href="/student/study">Study Planner</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
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
        score,
        total,
        pct: total > 0 ? Math.round((score / total) * 100) : 0,
      };
    });
  }, [breakdowns]);

  return (
    <Card className="rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs w-full min-w-0 transition-all duration-200 ease-linear">
      <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/40">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Layers className="size-3.5" /> Section Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {groups.map((group) => (
          <div key={group.name} className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="font-semibold text-foreground truncate mr-2">
                {group.name}
              </span>
              <span className="tabular-nums font-mono text-muted-foreground shrink-0">
                {group.score} / {group.total} ({group.pct}%)
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  group.pct >= 50
                    ? "bg-emerald-600 dark:bg-emerald-500"
                    : "bg-rose-500 dark:bg-rose-600",
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
    <article className="rounded-xl border border-border/60 bg-card p-4 space-y-3 w-full min-w-0 transition-all duration-200 ease-linear">
      <div className="flex items-start justify-between gap-2 border-b border-border/40 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-foreground">
            Question {index + 1}
          </span>
          <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
            {getQuestionTypeLabel(q.type || q.question_type)} • {q.marks}{" "}
            {q.marks === 1 ? "mark" : "marks"}
          </Badge>
          {requiresTable && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 font-medium bg-primary/5 text-primary border-primary/20 gap-1"
            >
              <TableIcon className="size-2.5" /> Table Required
            </Badge>
          )}
        </div>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground border">
          {sub?.is_skipped ? "Skipped" : "Submitted"}
        </span>
      </div>

      {questionText && (
        <div className="text-sm font-medium text-foreground">
          {renderRichMathText(questionText)}
        </div>
      )}

      {hasReferenceTable && (
        <div className="space-y-1.5 p-3 rounded-lg border border-border/60 bg-muted/20">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <TableIcon className="size-3 text-primary" /> Reference Table
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
    </article>
  );
}

const REVIEW_CATEGORY_LABELS: Record<string, string> = {
  recalculation: "Score recalculation",
  question_appeal: "Question / rubric appeal",
  technical: "Technical discrepancy",
  other: "Other clarification",
};

export default function ResultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AssessmentResultResponse | null>(null);
  const [attempt, setAttempt] = useState<any | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [assessment, setAssessment] = useState<any | null>(null);

  // Question Filter state: "all" | "incorrect" | "correct"
  const [questionFilter, setQuestionFilter] = useState<"all" | "attention" | "correct">("all");

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
    if (reviewNotes.trim().length < APPEAL_REASON_MIN_LENGTH) {
      toast.error(
        `Please provide at least ${APPEAL_REASON_MIN_LENGTH} characters detailing your review request.`,
      );
      return;
    }
    if (!result?.attempt_id || !result.course_id) {
      toast.error("This result cannot be appealed from here (missing attempt or course).");
      return;
    }

    setReviewSubmitting(true);
    try {
      const categoryLabel = REVIEW_CATEGORY_LABELS[reviewType] ?? reviewType;
      await appealApi.create({
        attempt_id: result.attempt_id,
        assessment_id: result.assessment_id,
        course_id: result.course_id,
        reason: `[${categoryLabel}] ${reviewNotes.trim()}`,
      });
      toast.success(
        "Your review request has been submitted. You will be notified of the outcome.",
      );
      setReviewDialogOpen(false);
      setReviewNotes("");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Failed to submit review request. Please try again.",
      );
    } finally {
      setReviewSubmitting(false);
    }
  };

  const scrollToQuestion = (questionNum: number) => {
    const el = document.getElementById(`question-${questionNum}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
      }, 1500);
    }
  };

  // Performance calculations
  const breakdownStats = useMemo(() => {
    if (!result?.breakdowns) {
      return {
        fullCount: 0,
        partialCount: 0,
        incorrectCount: 0,
        skippedCount: 0,
        attentionCount: 0,
      };
    }
    let full = 0;
    let partial = 0;
    let incorrect = 0;
    let skipped = 0;

    for (const b of result.breakdowns) {
      const score = b.awarded_score ?? b.score ?? 0;
      if (b.was_skipped) {
        skipped++;
      } else if (score >= b.max_score) {
        full++;
      } else if (score > 0) {
        partial++;
      } else {
        incorrect++;
      }
    }
    return {
      fullCount: full,
      partialCount: partial,
      incorrectCount: incorrect,
      skippedCount: skipped,
      attentionCount: partial + incorrect + skipped,
    };
  }, [result?.breakdowns]);

  // Filtered breakdowns
  const filteredBreakdowns = useMemo(() => {
    if (!result?.breakdowns) return [];
    if (questionFilter === "all") return result.breakdowns;
    if (questionFilter === "attention") {
      return result.breakdowns.filter((b) => {
        const score = b.awarded_score ?? b.score ?? 0;
        return b.was_skipped || score < b.max_score;
      });
    }
    if (questionFilter === "correct") {
      return result.breakdowns.filter((b) => {
        const score = b.awarded_score ?? b.score ?? 0;
        return !b.was_skipped && score >= b.max_score;
      });
    }
    return result.breakdowns;
  }, [result?.breakdowns, questionFilter]);

  if (loading) {
    return (
      <div className="space-y-4 w-full min-w-0 transition-all duration-200 ease-linear py-2">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // Awaiting release state
  if (!result && attempt) {
    const title = assessment?.title || "Assessment Submission";
    const isSubmitted =
      attempt.status?.toUpperCase() === "SUBMITTED" || !!attempt.submitted_at;
    const hasOpen = attempt.questions?.some((q: any) => isOpenEnded(q.type));

    return (
      <div className="space-y-4 w-full min-w-0 transition-all duration-200 ease-linear py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/student/results")}
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to Results
        </Button>

        <section className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 space-y-2">
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/5 text-primary text-[10px] font-semibold"
          >
            {getAssessmentTypeLabel(assessment?.assessment_type, title)}
          </Badge>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-2">
            <Clock className="size-3.5 text-primary" />
            Submitted: {fmtDate(attempt.submitted_at || attempt.started_at, true)} •{" "}
            {attempt.questions?.length || 0} questions
          </p>
        </section>

        <section className="flex gap-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 p-4">
          <Clock className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">
              Marks Awaiting Faculty Release
            </p>
            <p className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-300">
              {hasOpen && isSubmitted
                ? "This assessment contains subjective questions undergoing lecturer evaluation. You will be notified as soon as results are officially released."
                : "Your answers are securely recorded. Marks will become visible once the instructor finalizes grading."}
            </p>
          </div>
        </section>

        {attempt.questions?.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground px-0.5">
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

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/student/results")}
            className="h-8 text-xs rounded-lg"
          >
            Back to Results
          </Button>
          <Button
            size="sm"
            onClick={() => window.location.reload()}
            className="h-8 gap-1.5 text-xs rounded-lg"
          >
            <RefreshCw className="size-3.5" /> Refresh Status
          </Button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="py-16 text-center space-y-3 max-w-md mx-auto">
        <div className="size-12 bg-muted/60 rounded-xl flex items-center justify-center mx-auto text-muted-foreground">
          <Clock className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-foreground">
            Result Not Available
          </h2>
          <p className="text-xs text-muted-foreground">
            This attempt record could not be found or has not been published yet.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/student/results")}
          className="h-8 text-xs rounded-lg"
        >
          Return to Results
        </Button>
      </div>
    );
  }

  const pct = Math.round(result.percentage || 0);
  const title = result.assessment_title || "Assessment Result";
  const assessmentTypeLabel = getAssessmentTypeLabel(
    result.assessment_type,
    result.assessment_title,
  );

  return (
    <div className="result-container relative space-y-4 w-full min-w-0 transition-all duration-200 ease-linear pb-12">
      {/* ── Official Print Styles (Screen Clean & Print-Ready) ── */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: #0f172a !important;
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
          .result-container {
            max-width: 100% !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* ── Top Navigation & Actions Bar (Screen Only) ── */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2.5 pb-1 w-full min-w-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/student/results")}
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground -ml-1"
        >
          <ArrowLeft className="size-3.5" /> Back to Results
        </Button>

        <div className="flex items-center gap-2">
          {!result.is_group_result && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReviewDialogOpen(true)}
              className="h-8 gap-1.5 text-xs rounded-lg border-border/70 font-medium"
            >
              <MessageCircle className="size-3.5 text-primary" />
              Request Review
            </Button>
          )}

          {result.is_group_result && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                router.push(`/student/group-work/${result.assessment_id}`)
              }
              className="h-8 gap-1.5 text-xs rounded-lg border-border/70 font-medium"
            >
              <Users className="size-3.5 text-primary" />
              Group Workspace
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-8 gap-1.5 text-xs rounded-lg border-border/70 font-medium"
          >
            <Printer className="size-3.5" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* ── Integrity Notice (If applicable) ── */}
      {result.integrity_hold && (
        <section className="flex items-start gap-3 rounded-xl border border-rose-300/80 bg-rose-50 dark:bg-rose-950/30 p-3.5 w-full min-w-0 transition-all duration-200 ease-linear">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-rose-900 dark:text-rose-200">
              Provisional Result Notice
            </p>
            <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
              This score is currently undergoing routine faculty moderation. Final verified records will be confirmed upon completion.
            </p>
          </div>
        </section>
      )}

      {/* ── Executive Performance Summary Card ── */}
      <section className="rounded-xl border border-border/70 bg-card text-card-foreground p-4 sm:p-5 shadow-xs space-y-4 w-full min-w-0 transition-all duration-200 ease-linear">
        {/* Course & Assessment Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/40 pb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {result.course_code && (
              <span className="font-mono font-bold text-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                {result.course_code}
              </span>
            )}
            <span className="font-medium text-muted-foreground truncate max-w-xs sm:max-w-md lg:max-w-xl">
              {result.course_name || "Course Assessment"}
            </span>
            <Badge
              variant="outline"
              className="text-[10px] font-medium border-border/70 text-muted-foreground"
            >
              {assessmentTypeLabel}
            </Badge>
          </div>

          {/* Pass / Needs Review Badge */}
          {result.is_passing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-3.5" /> Passed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
              <XCircle className="size-3.5" /> Did Not Pass
            </span>
          )}
        </div>

        {/* Title and Key Performance Split */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full min-w-0">
          <div className="space-y-1.5 min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground leading-snug break-words">
              {title}
            </h1>

            {/* Context chips */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {result.submitted_at && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" />
                  Submitted: {fmtDate(result.submitted_at, false)}
                </span>
              )}
              {result.duration_minutes ? (
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="size-3.5 text-primary" />
                  {result.duration_minutes} Minutes
                </span>
              ) : null}
              {result.academic_year && (
                <span className="inline-flex items-center gap-1.5">
                  <GraduationCap className="size-3.5 text-primary" />
                  {result.academic_year}
                </span>
              )}
            </div>
          </div>

          {/* Score & Gauge Display */}
          <div className="flex items-center gap-4 bg-muted/20 md:bg-transparent p-3 md:p-0 rounded-lg shrink-0 self-start md:self-auto">
            <ScoreGauge pct={pct} isPassing={result.is_passing} />

            <div className="space-y-0.5">
              <div className="flex items-baseline gap-1.5 tabular-nums">
                <span className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono">
                  {result.total_score}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  / {result.max_score} Marks
                </span>
              </div>
              {result.letter_grade && (
                <p className="text-xs font-medium text-muted-foreground">
                  Grade Classification:{" "}
                  <span className="font-bold text-foreground">
                    {result.letter_grade}
                  </span>
                </p>
              )}
              {result.is_post_release_corrected && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  <ShieldCheck className="size-3" /> Moderation adjusted
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Question Count Metric Strip */}
        {result.breakdowns?.length > 0 && (
          <div className="pt-2 border-t border-border/40 grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full min-w-0">
            <div className="bg-muted/30 rounded-lg p-2.5 text-center sm:text-left transition-all duration-200 ease-linear">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground block">
                Total Questions
              </span>
              <span className="text-sm font-bold text-foreground tabular-nums">
                {result.breakdowns.length}
              </span>
            </div>
            <div className="bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-2.5 text-center sm:text-left transition-all duration-200 ease-linear">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400 block">
                Full Marks
              </span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {breakdownStats.fullCount}
              </span>
            </div>
            <div className="bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 rounded-lg p-2.5 text-center sm:text-left transition-all duration-200 ease-linear">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 block">
                Partial Marks
              </span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {breakdownStats.partialCount}
              </span>
            </div>
            <div className="bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 rounded-lg p-2.5 text-center sm:text-left transition-all duration-200 ease-linear">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-400 block">
                Needs Review
              </span>
              <span className="text-sm font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                {breakdownStats.incorrectCount + breakdownStats.skippedCount}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── Collaborative Group Summary (If applicable) ── */}
      {result.is_group_result && (
        <section className="rounded-xl border border-primary/20 bg-primary/[0.02] p-4 space-y-3 w-full min-w-0 transition-all duration-200 ease-linear">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                <Users className="size-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-foreground">
                  Collaborative Group Assessment
                </h2>
                <p className="text-xs text-muted-foreground">
                  Team:{" "}
                  <span className="font-semibold text-foreground">
                    {result.group_name || "Assigned Team"}
                  </span>
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                router.push(`/student/group-work/${result.assessment_id}`)
              }
              className="h-7.5 gap-1.5 text-xs rounded-lg"
            >
              <ExternalLink className="size-3.5" /> Open Group Workspace
            </Button>
          </div>

          {result.group_feedback && (
            <div className="rounded-lg border border-border/60 bg-card p-3 space-y-1">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-primary" /> Faculty Team Feedback
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {result.group_feedback}
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Sectional Breakdown & Study Focus (Two-Column Responsive Grid) ── */}
      {result.breakdowns?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full min-w-0 transition-all duration-200 ease-linear">
          <ScoreBreakdownCard breakdowns={result.breakdowns} />
          <ImproveTopicsCard breakdowns={result.breakdowns} />
        </div>
      )}

      {/* ── Itemized Question Navigator & Filter Strip ── */}
      {result.breakdowns?.length > 0 && (
        <section className="space-y-3 pt-1 w-full min-w-0 transition-all duration-200 ease-linear">
          {/* Header & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border/40 pb-2.5 w-full min-w-0">
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileText className="size-4 text-primary" /> Question Review & Feedback
              </h2>
              <p className="text-xs text-muted-foreground">
                Item responses, model solutions, and faculty assessment notes.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setQuestionFilter("all")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  questionFilter === "all"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All ({result.breakdowns.length})
              </button>
              {breakdownStats.attentionCount > 0 && (
                <button
                  type="button"
                  onClick={() => setQuestionFilter("attention")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                    questionFilter === "attention"
                      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Needs Attention ({breakdownStats.attentionCount})
                </button>
              )}
              <button
                type="button"
                onClick={() => setQuestionFilter("correct")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  questionFilter === "correct"
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Full Marks ({breakdownStats.fullCount})
              </button>
            </div>
          </div>

          {/* Quick Jump-to-Question Pills */}
          <div className="no-print flex flex-wrap items-center gap-1.5 pt-1 w-full min-w-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
              Jump to:
            </span>
            {result.breakdowns.map((item, idx) => {
              const score = item.awarded_score ?? item.score ?? 0;
              const isFull = !item.was_skipped && score >= item.max_score;
              const isPartial = !item.was_skipped && score > 0 && score < item.max_score;
              const isIncorrect = item.was_skipped || score === 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToQuestion(idx + 1)}
                  className={cn(
                    "size-7 rounded-md text-xs font-semibold font-mono flex items-center justify-center transition-all",
                    isFull &&
                      "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
                    isPartial &&
                      "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
                    isIncorrect &&
                      "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40",
                  )}
                  title={`Question ${idx + 1} (${score}/${item.max_score} marks)`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Filtered Question List */}
          <div className="space-y-3.5 pt-1 w-full min-w-0">
            {filteredBreakdowns.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                No questions found matching the selected filter.
              </div>
            ) : (
              filteredBreakdowns.map((item) => {
                const originalIndex = result.breakdowns.findIndex(
                  (b) => b.id === item.id,
                );
                return (
                  <QuestionCard
                    key={item.id}
                    item={item}
                    index={originalIndex >= 0 ? originalIndex : 0}
                  />
                );
              })
            )}
          </div>
        </section>
      )}

      {/* ── Formal Review / Appeal Modal Dialog ── */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-md rounded-xl border border-border bg-card text-card-foreground p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <MessageCircle className="size-4 text-primary" /> Request Mark Review / Appeal
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Submit a formal inquiry for &quot;
              <span className="font-semibold text-foreground">{title}</span>&quot;{" "}
              (Current Score: {result.total_score}/{result.max_score} Marks).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReviewSubmit} className="space-y-3.5 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Inquiry Category</Label>
              <Select value={reviewType} onValueChange={setReviewType}>
                <SelectTrigger className="h-9 text-xs rounded-lg border-border/70 bg-background font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-lg text-xs">
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
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  Reason & Justification <span className="text-destructive">*</span>
                </Label>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {reviewNotes.trim().length} / {APPEAL_REASON_MIN_LENGTH} min
                </span>
              </div>
              <Textarea
                placeholder="Explain the reason for your request and indicate any specific question numbers..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="min-h-[100px] text-xs rounded-lg bg-background border-border/70 font-medium leading-relaxed"
                required
              />
              <p className="text-[10px] text-muted-foreground">
                Minimum {APPEAL_REASON_MIN_LENGTH} characters required. Your request is assigned to an independent reviewer.
              </p>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReviewDialogOpen(false)}
                className="h-8 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={reviewSubmitting || reviewNotes.trim().length < APPEAL_REASON_MIN_LENGTH}
                className="h-8 text-xs font-medium rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground"
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
