// app/lecturer/grading/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Search,
  Users,
  RefreshCcw,
  Clock,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Scale,
  Loader2,
  User,
  Check,
  X,
  History,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Unlock,
  CheckCircle2,
  School,
  FolderOpen,
  Menu,
  ShieldAlert,
  Sparkles,
  Award,
  Lock,
  FileText,
  BookOpen,
  Send,
  Focus,
  Sliders,
  Flag,
  CheckSquare,
  Square,
  CheckCheck,
  AlignLeft,
  Activity,
  Filter,
  ArrowUpDown,
  Keyboard,
  Command,
  CornerDownLeft,
  Save,
  Eye,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  Table as TableIcon,
  HelpCircle,
  Hash,
} from "lucide-react";
import { ContextualExplainer } from "@/components/mindexa/common/contextual-explainer";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";
import { TableContextViewer } from "@/components/mindexa/common/table-context-viewer";

import { gradingApi } from "@/lib/api/grading";
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";
import { assessmentApi } from "@/lib/api/assessment";
import { attemptApi } from "@/lib/api/attempt";
import { submissionApi } from "@/lib/api/submission";
import { integrityApi } from "@/lib/api/integrity";
import { groupWorkApi } from "@/lib/api/group-work";
import { aiGradingApi } from "@/lib/api/ai-grading";
import { resultApi } from "@/lib/api/result";

import { Skeleton } from "@/components/ui/skeleton";
import { AIReviewPanel } from "@/components/mindexa/grading/ai-review-panel";
import { AIFeedbackEditor } from "@/components/mindexa/grading/ai-feedback-editor";
import { RubricGradingPanel } from "@/components/mindexa/grading/rubric-grading-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  GradingQueueItem,
  AttemptDetail,
  AttemptQuestion,
  SubmissionRecord,
  ClassStatRecord,
  AuditLog,
  AssessmentSummary,
  RubricScore,
  AiSuggestion,
  ReleaseQueueItem,
  getAiSuggestion,
  isAssessmentAiAllowed,
} from "./types";
import {
  isQuestionAutoGraded,
  normalizeQuestionType,
  getQuestionTypeLabel,
  isOpenEnded,
} from "@/lib/grading-utils";

function safeJson(value: unknown) {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Format Time Spent helper with fallback strategies.
 * Guarantees a meaningful duration is displayed rather than "N/A".
 */
function formatTimeSpent(attempt?: any, submission?: any): string {
  if (attempt?.time_taken_seconds && attempt.time_taken_seconds > 0) {
    const mins = Math.floor(attempt.time_taken_seconds / 60);
    const secs = attempt.time_taken_seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }
  if (attempt?.started_at && attempt?.submitted_at) {
    const start = new Date(attempt.started_at).getTime();
    const end = new Date(attempt.submitted_at).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      const diffSecs = Math.floor((end - start) / 1000);
      const mins = Math.floor(diffSecs / 60);
      const secs = diffSecs % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
  }
  if (submission?.time_spent_seconds && submission.time_spent_seconds > 0) {
    const mins = Math.floor(submission.time_spent_seconds / 60);
    const secs = submission.time_spent_seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }
  if (attempt?.duration_minutes && attempt.duration_minutes > 0) {
    return `${attempt.duration_minutes}m`;
  }
  return "Standard session";
}

function CaseStudyStudentAnswer({
  question,
  submission,
  maxMarks = 10,
}: {
  question: any;
  submission: any;
  maxMarks?: number;
}) {
  const subAny = submission as any;
  const rawAns =
    submission?.answer_text ??
    subAny?.student_answer ??
    (typeof subAny?.submitted_content === "string"
      ? subAny?.submitted_content
      : subAny?.submitted_content?.text ?? subAny?.submitted_content) ??
    (typeof submission === "string" ? submission : "");

  const parsed = safeJson(rawAns);
  const answerMap: Record<string, unknown> =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  const opts = question?.options || [];
  const prompts =
    opts.length > 0
      ? opts
      : Object.keys(answerMap).map((id, index) => ({
          id,
          text: `Sub-question ${index + 1}`,
          marks:
            Math.round(
              ((question?.marks || maxMarks || 10) /
                (Object.keys(answerMap).length || 1)) *
                10,
            ) / 10,
        }));

  const totalSubMarks = prompts.reduce(
    (sum: number, p: any) =>
      sum +
      (p.marks !== undefined && p.marks !== null
        ? Number(p.marks)
        : p.match_key !== undefined && p.match_key !== null
          ? Number(p.match_key)
          : p.match_value !== undefined && p.match_value !== null
            ? Number(p.match_value)
            : 0),
    0,
  );
  const promptCount = prompts.length || 1;
  const questionTotalMarks = question?.marks || maxMarks || 10;
  const rawAnsStr = typeof rawAns === "string" ? rawAns : "";

  if (prompts.length === 0 && (!rawAnsStr || rawAnsStr === "{}")) {
    return (
      <span className="italic text-muted-foreground/60 font-sans font-normal text-xs">
        No case study sub-questions or response recorded.
      </span>
    );
  }

  return (
    <div className="space-y-3 font-sans">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sub-Questions & Student Responses ({prompts.length} Sub-Questions)
        </p>
      </div>

      <div className="space-y-3">
        {prompts.map((prompt: any, index: number) => {
          const subMark =
            prompt.marks !== undefined && prompt.marks > 0
              ? prompt.marks
              : prompt.match_key !== undefined && prompt.match_key !== null
                ? prompt.match_key
                : prompt.match_value !== undefined &&
                    prompt.match_value !== null
                  ? prompt.match_value
                  : totalSubMarks > 0
                    ? prompt.marks
                    : Math.round((questionTotalMarks / promptCount) * 10) / 10;

          let subAnswerVal =
            answerMap[prompt.id] ??
            answerMap[String(prompt.id)] ??
            answerMap[index] ??
            answerMap[String(index)];

          if (subAnswerVal === undefined) {
            if (rawAnsStr && !rawAnsStr.trim().startsWith("{") && index === 0) {
              subAnswerVal = rawAnsStr;
            } else if (
              Object.keys(answerMap).length > 0 &&
              Object.values(answerMap)[index] !== undefined
            ) {
              subAnswerVal = Object.values(answerMap)[index];
            }
          }

          const promptText =
            prompt.text ||
            prompt.option_text ||
            prompt.content ||
            `Sub-question ${index + 1}`;

          return (
            <div
              key={prompt.id || index}
              className="rounded-xl border border-border/60 bg-muted/10 p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                  <span className="size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-mono font-medium">
                    {index + 1}
                  </span>
                  Sub-question {index + 1}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-medium px-2 py-0 border-primary/30 text-primary bg-primary/5 font-mono"
                >
                  {subMark} {Number(subMark) === 1 ? "Mark" : "Marks"}
                </Badge>
              </div>

              <div className="text-xs font-medium text-foreground leading-relaxed">
                {renderRichMathText(promptText)}
              </div>

              <div className="p-3 rounded-lg bg-card border border-border/50 text-xs">
                <span className="text-[10px] font-semibold text-muted-foreground block mb-1.5">
                  Submitted Answer
                </span>
                {subAnswerVal !== undefined &&
                subAnswerVal !== null &&
                String(subAnswerVal).trim() !== "" ? (
                  <div className="text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap font-sans font-normal">
                    {renderRichMathText(String(subAnswerVal))}
                  </div>
                ) : (
                  <span className="italic text-muted-foreground/60 text-xs">
                    No response recorded for this sub-question.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManualOnlyLanguageBanner({
  language = "Kinyarwanda",
}: {
  language?: string;
}) {
  return (
    <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/25 text-amber-900 dark:text-amber-200 space-y-2">
      <div className="flex items-center gap-2 font-semibold text-xs">
        <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>Institutional Policy: Manual Grading Required</span>
      </div>
      <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/90 font-normal">
        Automated AI grading, score suggestions, and feedback drafts are disabled
        for <strong>{language}</strong> academic content under institutional
        safety policy. All evaluations for this assessment must be performed
        manually.
      </p>
    </div>
  );
}

// Universal constants
const DEFAULT_QUESTION_MAX_MARKS = 10;
const DEFAULT_ASSESSMENT_TOTAL_MARKS = 100;

function DrawerIconButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-2.5 rounded-xl transition-all relative flex flex-col items-center gap-1 group",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
      )}
      title={label}
    >
      <Icon className="size-4" />
      <span className="text-[9px] font-medium hidden md:inline">{label}</span>
      {active && (
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

function CollapsibleDrawerSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/50 bg-card rounded-2xl overflow-hidden shadow-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="p-3.5 pt-0 border-t border-border/30 animate-in fade-in duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Robust Student Answer Renderer with LaTeX KaTeX and TableContextViewer support.
 */
function SpeedGraderStudentAnswerCanvas({
  currentQuestion,
  currentSubmission,
  maxMarks,
}: {
  currentQuestion: any;
  currentSubmission: any;
  maxMarks: number;
}) {
  if (!currentSubmission || (currentSubmission as any).is_skipped) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-border/60 bg-muted/5 text-center text-xs text-muted-foreground italic">
        No response recorded for this question node.
      </div>
    );
  }

  const subType = (currentSubmission.answer_type || "").toUpperCase();
  const qType = normalizeQuestionType(
    currentQuestion?.type || currentQuestion?.question_type || "",
  );

  // Check structured table response
  const tableData = (() => {
    if ((currentSubmission as any)?.table_data)
      return (currentSubmission as any).table_data;
    if ((currentSubmission as any)?.answer_table)
      return (currentSubmission as any).answer_table;
    const text = currentSubmission.answer_text;
    if (
      typeof text === "string" &&
      (text.trim().startsWith("{") || text.trim().startsWith("["))
    ) {
      try {
        const parsed = JSON.parse(text);
        if (
          parsed &&
          (parsed.headers || parsed.rows || Array.isArray(parsed))
        ) {
          return parsed;
        }
      } catch {}
    }
    return null;
  })();

  if (tableData) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <TableIcon className="size-3.5" />
          <span>Structured Response Table</span>
        </div>
        <TableContextViewer data={tableData} />
      </div>
    );
  }

  // Ordering questions
  const isOrdering =
    subType === "ORDERED_LIST" ||
    qType === "ordering" ||
    qType === "ordered_list" ||
    qType === "orderedlist";
  if (isOrdering) {
    const orderedIds: string[] =
      (currentSubmission as any).ordered_option_ids ||
      (Array.isArray(currentSubmission.answer_text)
        ? currentSubmission.answer_text
        : []);
    if (!orderedIds || orderedIds.length === 0) {
      return (
        <span className="italic text-muted-foreground/60 text-xs">
          No ordering sequence submitted.
        </span>
      );
    }
    const opts = (currentQuestion as any)?.options || [];
    const expectedOpts = [...opts].sort(
      (a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0),
    );
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Student Submitted Sequence
        </p>
        {orderedIds.map((val: string, idx: number) => {
          const opt = opts.find(
            (o: any) => o.id === val || o.text === val || o.content === val,
          );
          const label = opt ? opt.content || opt.text || opt.option_text : val;
          const expected = expectedOpts[idx];
          const isCorrect =
            expected &&
            (expected.id === val ||
              (expected.content || expected.text) === label);

          return (
            <div
              key={val || idx}
              className={cn(
                "p-2.5 rounded-xl border flex items-center justify-between text-xs font-sans transition-colors",
                isCorrect
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-950 dark:text-emerald-200"
                  : "bg-amber-500/5 border-amber-500/20 text-amber-950 dark:text-amber-200",
              )}
            >
              <div className="flex items-center gap-2.5 font-medium">
                <span className="size-5 rounded-full bg-background border flex items-center justify-center text-[10px] font-mono font-medium shrink-0">
                  {idx + 1}
                </span>
                <span>{renderRichMathText(label)}</span>
              </div>
              {expected && (
                <span className="text-[10px] font-mono font-medium">
                  {isCorrect ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓ Correct
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      Expected: {expected.content || expected.text}
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Matching pairs
  const isMatching =
    subType === "MATCH_PAIRS" || qType === "matching" || qType === "match_pairs";
  if (isMatching) {
    const pairs = (currentSubmission as any).match_pairs_json || {};
    const keys = Object.keys(pairs);
    if (keys.length === 0) {
      return (
        <span className="italic text-muted-foreground/60 text-xs">
          No matches submitted.
        </span>
      );
    }
    return (
      <div className="space-y-2 text-xs">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Submitted Matches
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {keys.map((k) => (
            <div
              key={k}
              className="p-2.5 rounded-xl border bg-muted/20 flex items-center justify-between"
            >
              <span className="font-medium text-foreground">
                {renderRichMathText(k)}
              </span>
              <span className="text-primary font-medium">
                → {renderRichMathText(String(pairs[k]))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fill in blanks
  const isFillBlanks =
    subType === "FILL_BLANKS" ||
    qType === "fillblank" ||
    qType === "fillblanks" ||
    qType === "fill_blank";
  if (isFillBlanks) {
    const blanks = (currentSubmission as any).fill_blank_answers || {};
    const keys = Object.keys(blanks);
    if (keys.length === 0) {
      return (
        <span className="italic text-muted-foreground/60 text-xs">
          No fill-blank answers recorded.
        </span>
      );
    }
    return (
      <div className="space-y-2 text-xs">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Submitted Blanks
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {keys.map((k) => (
            <div
              key={k}
              className="p-2.5 rounded-xl border bg-muted/20 flex items-center justify-between"
            >
              <span className="font-medium text-muted-foreground">
                Blank {k}
              </span>
              <span className="font-mono font-medium text-foreground">
                {renderRichMathText(String(blanks[k]))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Multiple choice
  const isMcq =
    subType === "SINGLE_OPTION" ||
    subType === "MULTI_OPTION" ||
    qType === "mcq" ||
    qType === "singleoption" ||
    qType === "multiplechoice" ||
    qType === "multiple_choice" ||
    qType === "multiselect" ||
    qType === "checkbox";
  if (
    isMcq &&
    ((currentSubmission as any).selected_option_ids?.length ||
      subType === "SINGLE_OPTION" ||
      subType === "MULTI_OPTION")
  ) {
    const selected = (currentSubmission as any).selected_option_ids || [];
    const opts = (currentQuestion as any)?.options || [];
    if (selected.length === 0) {
      return (
        <span className="italic text-muted-foreground/60 text-xs">
          No option chosen.
        </span>
      );
    }
    return (
      <div className="space-y-2 text-xs">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Selected Option(s)
        </p>
        <div className="space-y-1.5">
          {selected.map((oid: string) => {
            const opt = opts.find((o: any) => o.id === oid);
            return (
              <div
                key={oid}
                className={cn(
                  "p-2.5 rounded-xl border flex items-center justify-between font-medium",
                  opt?.is_correct
                    ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-950 dark:text-emerald-200"
                    : "bg-card border-border/60",
                )}
              >
                <span>
                  {renderRichMathText(
                    opt ? opt.content || opt.text || opt.option_text : oid,
                  )}
                </span>
                {opt?.is_correct && (
                  <span className="text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ Correct
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Case Study
  const isCaseStudy =
    subType === "CASE_STUDY" ||
    qType === "casestudy" ||
    qType === "case_study";
  if (isCaseStudy) {
    return (
      <CaseStudyStudentAnswer
        question={currentQuestion}
        submission={currentSubmission}
        maxMarks={maxMarks}
      />
    );
  }

  // Text / Essay / Computational responses
  const subAny = currentSubmission as any;
  const textVal =
    currentSubmission.answer_text ||
    (typeof subAny.submitted_content === "string"
      ? subAny.submitted_content
      : subAny.submitted_content?.text) ||
    subAny.student_answer;

  if (!textVal || String(textVal).trim() === "") {
    return (
      <span className="italic text-muted-foreground/60 font-sans font-normal text-xs">
        No response recorded for this question node.
      </span>
    );
  }

  return (
    <div className="text-xs sm:text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap font-normal">
      {renderRichMathText(String(textVal))}
    </div>
  );
}

function LecturerGradingQueueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Primary data sets
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [classStats, setClassStats] = useState<ClassStatRecord[]>([]);
  const [data, setData] = useState<GradingQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number>(0);

  // Hierarchy selections
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<WorkspaceListItem | null>(null);
  const [selectedAssessment, setSelectedAssessment] =
    useState<AssessmentSummary | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassStatRecord | null>(
    null,
  );

  // Filters & sorting
  const [status, setStatus] = useState<string>("all");
  const [questionType, setQuestionType] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("priority_desc");

  // Selection & Bulk actions in Step D Main Queue
  const [selectedAttemptIds, setSelectedAttemptIds] = useState<string[]>([]);
  const [isBulkFlagging, setIsBulkFlagging] = useState(false);
  const [isBulkApplyingAi, setIsBulkApplyingAi] = useState(false);
  const [showBulkAiDialog, setShowBulkAiDialog] = useState(false);
  const [bulkAiConfidenceThreshold, setBulkAiConfidenceThreshold] =
    useState<number>(80);

  // Tab switcher in Step D: "queue" | "release"
  const [activeStepDView, setActiveStepDView] = useState<"queue" | "release">(
    "queue",
  );

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const PAGE_SIZE = 50;

  // Reassessment Confirmation Dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectType, setRejectType] = useState<"individual" | "group">(
    "individual",
  );
  const [rejectReason, setRejectReason] = useState("");
  const [rejectWindowDays, setRejectWindowDays] = useState("7");

  // Individual Grading Workspace State
  const [selectedStudent, setSelectedStudent] =
    useState<GradingQueueItem | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<AttemptDetail | null>(
    null,
  );
  const [activeSubmissions, setActiveSubmissions] = useState<
    SubmissionRecord[]
  >([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [overrideScore, setOverrideScore] = useState<string>("");
  const [finalFeedback, setFinalFeedback] = useState<string>("");
  const [aiFeedbackDraft, setAiFeedbackDraft] = useState<string>("");
  const [aiStrengths, setAiStrengths] = useState<string[]>([]);
  const [aiImprovements, setAiImprovements] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [rubricScores, setRubricScores] = useState<RubricScore[]>([]);
  const [reviewStartedAt, setReviewStartedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isGroupEditing, setIsGroupEditing] = useState(false);

  // SpeedGrader collapsible panel states
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isAiAccepted, setIsAiAccepted] = useState(false);
  const [showIntegrityLiftDialog, setShowIntegrityLiftDialog] = useState(false);
  const [filterUngradedOnly, setFilterUngradedOnly] = useState(false);
  const [bulkReleaseDialogOpen, setBulkReleaseDialogOpen] = useState(false);
  const [bulkReleaseAction, setBulkReleaseAction] = useState<{
    type: "selected" | "class_ready";
    count: number;
    className?: string;
    attemptIds: string[];
  } | null>(null);
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseQueue, setReleaseQueue] = useState<ReleaseQueueItem[]>([]);
  const [releaseQueueLoading, setReleaseQueueLoading] = useState(false);
  const [releaseQueueClassFullyGraded, setReleaseQueueClassFullyGraded] =
    useState(false);
  const [maxAttempts, setMaxAttempts] = useState<number>(3);
  const [passMark, setPassMark] = useState<number>(50);

  // Individual Reassessment options form state
  const [allowReassessment, setAllowReassessment] = useState(false);
  const [reassessmentWindow, setReassessmentWindow] = useState("7");

  // Group Grading State
  const [groupQueue, setGroupQueue] = useState<any[]>([]);
  const [groupQueueLoading, setGroupQueueLoading] = useState(false);
  const [selectedGroupSubmission, setSelectedGroupSubmission] = useState<
    any | null
  >(null);
  const [loadingGroupWorkspace, setLoadingGroupWorkspace] = useState(false);
  const [gradingGroup, setGradingGroup] = useState(false);
  const [groupScore, setGroupScore] = useState("");
  const [groupFeedback, setGroupFeedback] = useState("");
  const [groupGraderActiveQuestionIndex, setGroupGraderActiveQuestionIndex] =
    useState(0);
  const [isOverrideEnabled, setIsOverrideEnabled] = useState(false);
  const [memberScoreOverrides, setMemberScoreOverrides] = useState<
    Record<string, string>
  >({});
  const [reviewMode, setReviewMode] = useState<"focus" | "detailed">("focus");
  const [isQuestionNavOpen, setIsQuestionNavOpen] = useState(false);
  const [activeDrawerSection, setActiveDrawerSection] = useState<string | null>(
    null,
  );

  // Group Question-Level Grades Data Model
  const [groupQuestionScores, setGroupQuestionScores] = useState<
    Record<string, string>
  >({});
  const [groupQuestionFeedback, setGroupQuestionFeedback] = useState<
    Record<string, string>
  >({});

  // Autosave & Keyboard Shortcuts State
  const [autosaveStatus, setAutosaveStatus] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  const [lastAutosavedAt, setLastAutosavedAt] = useState<Date | null>(null);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const autosaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const groupAutosaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const [groupSearch, setGroupSearch] = useState("");
  const [groupStatusFilter, setGroupStatusFilter] = useState("all");
  const [groupSortBy, setGroupSortBy] = useState("name_asc");

  const filteredGroupQueue = useMemo(() => {
    return groupQueue
      .filter((item) => {
        if (groupSearch.trim()) {
          const q = groupSearch.toLowerCase();
          const matchesName = item.group_name?.toLowerCase().includes(q);
          const matchesMember = item.members?.some(
            (m: any) =>
              m.student_name?.toLowerCase().includes(q) ||
              m.student_id?.toLowerCase().includes(q),
          );
          if (!matchesName && !matchesMember) return false;
        }
        if (groupStatusFilter !== "all") {
          if (groupStatusFilter === "PENDING" && item.status === "GRADED")
            return false;
          if (groupStatusFilter === "GRADED" && item.status !== "GRADED")
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (groupSortBy === "name_asc") {
          return (a.group_name || "").localeCompare(b.group_name || "");
        }
        if (groupSortBy === "date_desc") {
          return (
            new Date(b.submitted_at || 0).getTime() -
            new Date(a.submitted_at || 0).getTime()
          );
        }
        if (groupSortBy === "score_desc") {
          return (b.calculated_score || 0) - (a.calculated_score || 0);
        }
        return 0;
      });
  }, [groupQueue, groupSearch, groupStatusFilter, groupSortBy]);

  const updateUrlParams = useCallback(
    (params: Record<string, string | null | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, val]) => {
        if (val === null || val === undefined) {
          sp.delete(key);
        } else {
          sp.set(key, val);
        }
      });
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const fetchWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      const res = await lecturerApi.getWorkspaces();
      const items = Array.isArray(res)
        ? res
        : (res as any)?.items || (res as any)?.workspaces || [];
      setWorkspaces(items);
    } catch {
      toast.error("Failed to load course workspaces");
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAssessments = useCallback(async (workspaceId: string) => {
    try {
      setLoading(true);
      const res = await assessmentApi.getAssessments({
        teaching_workspace_id: workspaceId,
      });
      const items = Array.isArray(res)
        ? res
        : (res as any)?.items || (res as any)?.assessments || [];
      setAssessments(items);
    } catch {
      toast.error("Failed to load assessments for this workspace");
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClasses = useCallback(
    async (assessmentId: string) => {
      try {
        setLoading(true);
        const res = await gradingApi.getAssessmentClassStats(assessmentId);
        const items = Array.isArray(res)
          ? res
          : res?.classes || res?.items || [];
        setClassStats(items);
      } catch {
        toast.error("Failed to load class sections statistics");
        setClassStats([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchQueue = useCallback(
    async (assessmentId: string, classId?: string, page: number = 1) => {
      try {
        setLoading(true);
        const params: any = {
          assessment_id: assessmentId,
          page: page,
          page_size: PAGE_SIZE,
        };
        if (classId) params.class_id = classId;
        const res = await gradingApi.getGradingQueue(params);
        const rawItems = Array.isArray(res) ? res : res?.items || [];
        const mappedItems: GradingQueueItem[] = rawItems.map((item: any) => ({
          ...item,
          score:
            item.override_score !== null && item.override_score !== undefined
              ? item.override_score
              : item.score,
          override_score: item.override_score,
          is_final: item.is_final || false,
          feedback: item.feedback,
          time_taken_seconds:
            item.time_taken_seconds ||
            item.time_spent_seconds ||
            item.duration_seconds,
          started_at: item.started_at,
          submitted_at: item.submitted_at || item.created_at,
          duration_minutes: item.duration_minutes,
        }));
        setData(mappedItems);
        setCurrentPage(page);
        const totalCount = res?.total !== undefined ? res.total : mappedItems.length;
        setTotal(totalCount);
        setHasMore(page * PAGE_SIZE < totalCount);
      } catch {
        toast.error("Failed to load submissions queue");
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchGroupQueue = useCallback(
    async (assessmentId: string, classId?: string) => {
      try {
        setGroupQueueLoading(true);
        const params: any = { assessment_id: assessmentId };
        if (classId) params.class_id = classId;
        const res = await gradingApi.getGroupGradingQueue(params);
        const rawItems = Array.isArray(res) ? res : res?.items || res?.groups || [];
        const mapped = (rawItems || []).map((item: any) => ({
          ...item,
          total_marks:
            item.assessment?.total_marks ||
            selectedAssessment?.total_marks ||
            DEFAULT_ASSESSMENT_TOTAL_MARKS,
        }));
        setGroupQueue(mapped);
      } catch {
        toast.error("Failed to load group submissions");
        setGroupQueue([]);
      } finally {
        setGroupQueueLoading(false);
      }
    },
    [selectedAssessment],
  );

  const fetchReleaseQueue = useCallback(
    async (assessmentId: string, classId?: string) => {
      if (!classId) return;
      try {
        setReleaseQueueLoading(true);
        const res = await resultApi.getReleaseQueue(assessmentId, classId);
        const rawItems = Array.isArray(res) ? res : res?.items || res?.results || [];
        setReleaseQueue(rawItems);
        setReleaseQueueClassFullyGraded(Boolean(res?.class_fully_graded));
        if (res?.max_attempts) setMaxAttempts(res.max_attempts);
        if (res?.pass_mark) setPassMark(res.pass_mark);
      } catch {
        toast.error("Failed to load release queue");
        setReleaseQueue([]);
      } finally {
        setReleaseQueueLoading(false);
      }
    },
    [],
  );

  const refreshClassContext = useCallback(async () => {
    if (!selectedAssessment) return;
    const classId = selectedClass?.class_id;
    await Promise.allSettled([
      fetchClasses(selectedAssessment.id),
      fetchQueue(selectedAssessment.id, classId),
      fetchReleaseQueue(selectedAssessment.id, classId),
    ]);
  }, [
    selectedAssessment,
    selectedClass,
    fetchClasses,
    fetchQueue,
    fetchReleaseQueue,
  ]);

  // Handle URL param restoration on load
  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const activeQuestionId =
    activeAttempt?.questions?.[activeQuestionIndex]?.id;
  const activeSubmission = activeSubmissions.find(
    (s) => s.question_id === activeQuestionId,
  );

  const handleSelectWorkspace = (ws: WorkspaceListItem) => {
    setSelectedWorkspace(ws);
    setSelectedAssessment(null);
    setSelectedClass(null);
    setSelectedStudent(null);
    setActiveAttempt(null);
    setSelectedGroupSubmission(null);
    setSelectedAttemptIds([]);
    updateUrlParams({
      workspaceId: ws.id,
      assessmentId: null,
      classId: null,
      attemptId: null,
    });
    fetchAssessments(ws.id);
  };

  const handleSelectAssessment = (asmt: AssessmentSummary) => {
    setSelectedAssessment(asmt);
    setSelectedClass(null);
    setSelectedStudent(null);
    setActiveAttempt(null);
    setSelectedGroupSubmission(null);
    setSelectedAttemptIds([]);
    updateUrlParams({
      assessmentId: asmt.id,
      classId: null,
      attemptId: null,
    });

    if (asmt.is_group_assessment) {
      fetchGroupQueue(asmt.id);
    } else {
      fetchClasses(asmt.id);
    }
  };

  const handleSelectClass = (c: ClassStatRecord) => {
    setSelectedClass(c);
    setSelectedStudent(null);
    setActiveAttempt(null);
    setSelectedAttemptIds([]);
    updateUrlParams({ classId: c.class_id, attemptId: null });
    if (selectedAssessment) {
      fetchQueue(selectedAssessment.id, c.class_id);
      fetchReleaseQueue(selectedAssessment.id, c.class_id);
    }
  };

  const handleBackToWorkspaces = () => {
    setSelectedWorkspace(null);
    setSelectedAssessment(null);
    setSelectedClass(null);
    setSelectedStudent(null);
    setActiveAttempt(null);
    setSelectedGroupSubmission(null);
    setSelectedAttemptIds([]);
    updateUrlParams({
      workspaceId: null,
      assessmentId: null,
      classId: null,
      attemptId: null,
    });
  };

  const handleBackToAssessments = () => {
    setSelectedAssessment(null);
    setSelectedClass(null);
    setSelectedStudent(null);
    setActiveAttempt(null);
    setSelectedGroupSubmission(null);
    setSelectedAttemptIds([]);
    updateUrlParams({
      assessmentId: null,
      classId: null,
      attemptId: null,
    });
    if (selectedWorkspace) {
      fetchAssessments(selectedWorkspace.id);
    }
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
    setSelectedStudent(null);
    setActiveAttempt(null);
    setSelectedGroupSubmission(null);
    setSelectedAttemptIds([]);
    updateUrlParams({ classId: null, attemptId: null });
    if (selectedAssessment) {
      fetchClasses(selectedAssessment.id);
    }
  };

  // SpeedGrader Opening Logic
  const handleOpenIndividualGrader = async (item: GradingQueueItem) => {
    try {
      setLoading(true);
      setSelectedStudent(item);
      updateUrlParams({ attemptId: item.attempt_id });

      const attempt = await attemptApi.getAttempt(item.attempt_id);
      setActiveAttempt(attempt);

      const subRes = await submissionApi.getSubmissionsForAttempt(item.attempt_id);
      setActiveSubmissions(subRes.submissions || []);

      if (attempt.questions && attempt.questions.length > 0) {
        const qIndex = attempt.questions.findIndex(
          (q: any) => q.id === item.question_id,
        );
        setActiveQuestionIndex(qIndex !== -1 ? qIndex : 0);
      } else {
        setActiveQuestionIndex(0);
      }

      setReviewStartedAt(new Date());
      setIsEditing(false);
      setIsAiAccepted(false);
    } catch {
      toast.error("Failed to initialize SpeedGrader workspace");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseIndividualWorkspace = () => {
    setSelectedStudent(null);
    setActiveAttempt(null);
    setActiveSubmissions([]);
    setOverrideScore("");
    setFinalFeedback("");
    updateUrlParams({ attemptId: null });
    refreshClassContext();
  };

  const handleOpenGroupGrader = async (groupSubmission: any) => {
    try {
      setLoadingGroupWorkspace(true);
      setSelectedGroupSubmission(groupSubmission);
      updateUrlParams({ attemptId: groupSubmission.id });

      setGroupScore(groupSubmission.score?.toString() || "");
      setGroupFeedback(groupSubmission.feedback || "");
      setGroupGraderActiveQuestionIndex(0);
      setIsGroupEditing(false);
    } catch {
      toast.error("Failed to load group workspace");
    } finally {
      setLoadingGroupWorkspace(false);
    }
  };

  const handleCloseGroupWorkspace = () => {
    setSelectedGroupSubmission(null);
    updateUrlParams({ attemptId: null });
    if (selectedAssessment) {
      fetchGroupQueue(selectedAssessment.id, selectedClass?.class_id);
    }
  };

  // Question navigation in SpeedGrader
  const handleSelectQuestion = (idx: number) => {
    setActiveQuestionIndex(idx);
    setIsEditing(false);
    setIsAiAccepted(false);
  };

  const handleJumpToNextUngraded = () => {
    if (!activeAttempt || !activeAttempt.questions || activeAttempt.questions.length === 0) return;
    const questions = activeAttempt.questions;
    const totalQ = questions.length;

    const isUngraded = (q: AttemptQuestion) => {
      if (isQuestionAutoGraded(q)) return false;
      const sub = activeSubmissions.find((s) => s.question_id === q.id);
      return !sub || !sub.is_final;
    };

    // Look forward from activeQuestionIndex + 1 to totalQ - 1
    for (let i = activeQuestionIndex + 1; i < totalQ; i++) {
      if (isUngraded(questions[i])) {
        handleSelectQuestion(i);
        toast.info(`Jumped to ungraded Question ${i + 1}`);
        return;
      }
    }

    // Wrap around from 0 to activeQuestionIndex - 1
    for (let i = 0; i < activeQuestionIndex; i++) {
      if (isUngraded(questions[i])) {
        handleSelectQuestion(i);
        toast.info(`Jumped to ungraded Question ${i + 1}`);
        return;
      }
    }

    toast.success("All manual questions for this attempt are graded!");
  };

  const handleGroupQuestionSelect = (idx: number) => {
    setGroupGraderActiveQuestionIndex(idx);
    setIsGroupEditing(false);
  };

  // Sync current question fields
  useEffect(() => {
    if (activeSubmission && activeAttempt && activeQuestionId) {
      const q = activeAttempt.questions?.[activeQuestionIndex];
      const maxMarks = q?.marks || DEFAULT_QUESTION_MAX_MARKS;
      const isAuto = isQuestionAutoGraded(q);

      const val =
        activeSubmission.override_score !== null &&
        activeSubmission.override_score !== undefined
          ? activeSubmission.override_score.toString()
          : activeSubmission.score !== null &&
              activeSubmission.score !== undefined
            ? activeSubmission.score.toString()
            : "";
      setOverrideScore(val);
      setFinalFeedback(activeSubmission.feedback || "");
    }
  }, [activeSubmission, activeAttempt, activeQuestionId, activeQuestionIndex]);

  // Debounced Autosave for Individual Grading
  const triggerDebouncedAutosave = useCallback(
    (scoreVal: string, feedbackVal: string, rubrics: RubricScore[]) => {
      if (!activeSubmission?.id || !selectedStudent || !activeAttempt) return;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

      setAutosaveStatus("saving");
      autosaveTimerRef.current = setTimeout(async () => {
        try {
          const currentQ = activeAttempt.questions?.[activeQuestionIndex];
          const maxMarks = currentQ?.marks || DEFAULT_QUESTION_MAX_MARKS;
          const numScore =
            scoreVal.trim() === "" ? undefined : parseFloat(scoreVal);

          const payload: any = {
            score: numScore,
            feedback: feedbackVal,
            is_final: false,
            accept_ai_suggestion: isAiAccepted,
            rubric_scores: rubrics.length > 0 ? rubrics : undefined,
          };

          await gradingApi.saveGrade(activeSubmission.id, payload);
          setAutosaveStatus("saved");
          setLastAutosavedAt(new Date());
        } catch {
          setAutosaveStatus("idle");
        }
      }, 1200);
    },
    [
      activeSubmission,
      selectedStudent,
      activeAttempt,
      activeQuestionIndex,
      isAiAccepted,
    ],
  );

  // Submit Grade
  const submitGrade = async (isFinal: boolean, acceptAi: boolean = false) => {
    if (!selectedStudent || !activeAttempt || !activeSubmission) return;

    try {
      if (isFinal) setIsSaving(true);
      else setIsSavingDraft(true);

      const currentQ = activeAttempt.questions?.[activeQuestionIndex];
      const maxMarks = currentQ?.marks || DEFAULT_QUESTION_MAX_MARKS;
      let finalScoreNum: number | undefined;

      if (acceptAi) {
        const aiSug = getAiSuggestion(activeSubmission);
        if (aiSug.hasSuggestion) finalScoreNum = aiSug.score!;
      } else if (overrideScore.trim() !== "") {
        finalScoreNum = parseFloat(overrideScore);
        if (
          !Number.isFinite(finalScoreNum) ||
          finalScoreNum < 0 ||
          finalScoreNum > maxMarks
        ) {
          toast.error(`Score must be between 0 and ${maxMarks}`);
          return;
        }
      }

      const payload: any = {
        score: finalScoreNum,
        feedback: finalFeedback,
        is_final: isFinal,
        accept_ai_suggestion: acceptAi,
        rubric_scores: rubricScores.length > 0 ? rubricScores : undefined,
      };

      await gradingApi.saveGrade(activeSubmission.id, payload);

      const subRes = await submissionApi.getSubmissionsForAttempt(activeAttempt.id);
      setActiveSubmissions(subRes.submissions || []);

      if (isFinal) {
        toast.success("Grade finalized successfully");
        setIsEditing(false);
      } else {
        toast.success("Draft saved");
      }
    } catch {
      toast.error("Failed to save evaluation");
    } finally {
      setIsSaving(false);
      setIsSavingDraft(false);
    }
  };

  const handleSaveAndNextIndividual = async () => {
    if (!activeAttempt || !activeAttempt.questions) return;
    await submitGrade(true, isAiAccepted);

    const totalQ = activeAttempt.questions.length;
    if (activeQuestionIndex < totalQ - 1) {
      handleSelectQuestion(activeQuestionIndex + 1);
    } else {
      // Auto-advance to next student in queue
      const currentIndex = groupedSubmissions.findIndex(
        (group) => group.some((item) => item.attempt_id === activeAttempt.id),
      );
      if (currentIndex !== -1 && currentIndex < groupedSubmissions.length - 1) {
        const nextGroup = groupedSubmissions[currentIndex + 1];
        const nextFirst = nextGroup[0];
        if (nextFirst) {
          toast.info(`Advancing to next student: ${nextFirst.student_name}`);
          handleOpenIndividualGrader(nextFirst);
        }
      } else {
        toast.success("Reached the end of the submissions queue for this section!");
        handleCloseIndividualWorkspace();
      }
    }
  };

  const submitGroupGrade = async (isFinal: boolean) => {
    if (!selectedGroupSubmission) return;

    try {
      setGradingGroup(true);
      const activeQ =
        selectedGroupSubmission.questions?.[groupGraderActiveQuestionIndex];
      const maxMarks = activeQ?.marks || DEFAULT_QUESTION_MAX_MARKS;
      const numScore = parseFloat(groupScore);

      if (isNaN(numScore) || numScore < 0 || numScore > maxMarks) {
        toast.error(`Score must be between 0 and ${maxMarks}`);
        return;
      }

      await groupWorkApi.gradeSubmission(
        selectedAssessment?.id || "",
        selectedGroupSubmission.id,
        {
          total_score: numScore,
          max_score: maxMarks,
          feedback: groupFeedback,
          is_final: isFinal,
        },
      );

      toast.success(isFinal ? "Group grade finalized" : "Group draft saved");
      setIsGroupEditing(false);
      if (selectedAssessment) {
        fetchGroupQueue(selectedAssessment.id, selectedClass?.class_id);
      }
    } catch {
      toast.error("Failed to save group grade");
    } finally {
      setGradingGroup(false);
    }
  };

  const handleSaveAndNext = async () => {
    if (!selectedGroupSubmission?.questions) return;
    await submitGroupGrade(true);

    const totalQ = selectedGroupSubmission.questions.length;
    if (groupGraderActiveQuestionIndex < totalQ - 1) {
      handleGroupQuestionSelect(groupGraderActiveQuestionIndex + 1);
    } else {
      toast.success("All questions scored for this group!");
      handleCloseGroupWorkspace();
    }
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const isIndividualOpen = Boolean(activeAttempt && selectedStudent);
    const isGroupOpen = Boolean(selectedGroupSubmission);

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;
      const isAlt = e.altKey;
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // 1. Help Modal: '?' / 'Shift+/' (when not typing) or Cmd+/
      if ((e.key === "?" && !isTyping) || (isMetaOrCtrl && e.key === "/")) {
        e.preventDefault();
        setShowShortcutsDialog((prev) => !prev);
        return;
      }

      // 2. Escape: Close workspace or close dialogs
      if (e.key === "Escape") {
        if (showShortcutsDialog) {
          setShowShortcutsDialog(false);
          return;
        }
        if (showBulkAiDialog) {
          setShowBulkAiDialog(false);
          return;
        }
        if (showIntegrityLiftDialog) {
          setShowIntegrityLiftDialog(false);
          return;
        }
        if (rejectDialogOpen) {
          setRejectDialogOpen(false);
          return;
        }
        if (isIndividualOpen) {
          handleCloseIndividualWorkspace();
        } else if (isGroupOpen) {
          handleCloseGroupWorkspace();
        }
        return;
      }

      if (!isIndividualOpen && !isGroupOpen) return;

      // 3. Finalize & Next: Cmd+Enter / Ctrl+Enter
      if (isMetaOrCtrl && e.key === "Enter") {
        e.preventDefault();
        if (isIndividualOpen) {
          handleSaveAndNextIndividual();
        } else if (isGroupOpen) {
          handleSaveAndNext();
        }
        return;
      }

      // 4. Save Draft manually: Cmd+S / Ctrl+S
      if (isMetaOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isIndividualOpen) {
          submitGrade(false, isAiAccepted);
        } else if (isGroupOpen) {
          submitGroupGrade(false);
        }
        return;
      }

      // 5. Navigate Questions:
      if (
        (isAlt &&
          (e.key === "ArrowRight" ||
            e.key === "ArrowDown" ||
            e.key.toLowerCase() === "n" ||
            e.key.toLowerCase() === "j")) ||
        (isMetaOrCtrl && isShift && e.key === "ArrowRight")
      ) {
        e.preventDefault();
        if (isIndividualOpen && activeAttempt?.questions) {
          const totalQ = activeAttempt.questions.length;
          if (activeQuestionIndex < totalQ - 1) {
            handleSelectQuestion(activeQuestionIndex + 1);
          }
        } else if (isGroupOpen && selectedGroupSubmission?.questions) {
          const totalQ = selectedGroupSubmission.questions.length;
          if (groupGraderActiveQuestionIndex < totalQ - 1) {
            handleGroupQuestionSelect(groupGraderActiveQuestionIndex + 1);
          }
        }
        return;
      }

      if (
        (isAlt &&
          (e.key === "ArrowLeft" ||
            e.key === "ArrowUp" ||
            e.key.toLowerCase() === "p" ||
            e.key.toLowerCase() === "k")) ||
        (isMetaOrCtrl && isShift && e.key === "ArrowLeft")
      ) {
        e.preventDefault();
        if (isIndividualOpen && activeAttempt?.questions) {
          if (activeQuestionIndex > 0) {
            handleSelectQuestion(activeQuestionIndex - 1);
          }
        } else if (isGroupOpen && selectedGroupSubmission?.questions) {
          if (groupGraderActiveQuestionIndex > 0) {
            handleGroupQuestionSelect(groupGraderActiveQuestionIndex - 1);
          }
        }
        return;
      }

      // 5b. Jump to Next Ungraded Question: Alt+U
      if (isAlt && e.key.toLowerCase() === "u") {
        e.preventDefault();
        if (isIndividualOpen) {
          handleJumpToNextUngraded();
        }
        return;
      }

      // 6. Accept AI Review: Alt+A
      if (
        (isAlt && e.key.toLowerCase() === "a") ||
        (isMetaOrCtrl && isShift && e.key.toLowerCase() === "a")
      ) {
        if (isIndividualOpen && activeSubmission) {
          const aiSug = getAiSuggestion(activeSubmission);
          if (aiSug.hasSuggestion) {
            e.preventDefault();
            const aiScore = aiSug.score!;
            const aiFb = aiSug.feedbackDraft || aiSug.rationale || "";
            setOverrideScore(aiScore.toString());
            setFinalFeedback(aiFb);
            setIsAiAccepted(true);
            setIsEditing(true);
            triggerDebouncedAutosave(aiScore.toString(), aiFb, rubricScores);
            toast.success("AI suggestion accepted!");
          }
        }
        return;
      }

      // 7. Toggle Flag: Alt+F
      if (isAlt && e.key.toLowerCase() === "f") {
        if (isIndividualOpen && selectedStudent) {
          e.preventDefault();
          handleToggleManualFlag();
        }
        return;
      }

      // 8. Toggle Left / Right sidebars
      if (isAlt && (e.key === "[" || e.key.toLowerCase() === "b")) {
        e.preventDefault();
        setIsLeftSidebarOpen((prev) => !prev);
        return;
      }
      if (isAlt && (e.key === "]" || e.key.toLowerCase() === "r")) {
        e.preventDefault();
        setIsRightSidebarOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAttempt,
    selectedStudent,
    selectedGroupSubmission,
    activeQuestionIndex,
    groupGraderActiveQuestionIndex,
    activeSubmission,
    isAiAccepted,
    rubricScores,
    showShortcutsDialog,
    showBulkAiDialog,
    showIntegrityLiftDialog,
    rejectDialogOpen,
    triggerDebouncedAutosave,
  ]);

  const handleToggleManualFlag = async () => {
    if (!selectedStudent) return;
    try {
      const nextFlag = !selectedStudent.is_flagged;
      await integrityApi.toggleFlag(selectedStudent.attempt_id, nextFlag);
      setSelectedStudent((prev) =>
        prev ? { ...prev, is_flagged: nextFlag } : null,
      );
      toast.success(nextFlag ? "Attempt flagged for senior review" : "Attempt unflagged");
    } catch {
      toast.error("Failed to toggle integrity flag");
    }
  };

  const handleLiftIntegrityHold = async () => {
    if (!activeAttempt?.id) return;
    try {
      setIsSaving(true);
      await integrityApi.liftHold(activeAttempt.id);
      toast.success("Security hold lifted. Result is now eligible for release.");
      const updated = await attemptApi.getAttempt(activeAttempt.id);
      setActiveAttempt(updated);
      setShowIntegrityLiftDialog(false);
    } catch {
      toast.error("Failed to lift integrity hold");
    } finally {
      setIsSaving(false);
    }
  };

  // Multi-select and Bulk operations in STEP D Main Queue
  const groupedSubmissions = useMemo(() => {
    const map = new Map<string, GradingQueueItem[]>();
    data.forEach((item) => {
      if (!map.has(item.attempt_id)) {
        map.set(item.attempt_id, []);
      }
      map.get(item.attempt_id)!.push(item);
    });

    const groups = Array.from(map.values()).filter((group) => {
      const first = group[0];
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = first.student_name?.toLowerCase().includes(q);
        const matchesStudentId = first.student_id?.toLowerCase().includes(q);
        if (!matchesName && !matchesStudentId) return false;
      }
      if (status !== "all") {
        const matchesStatus = group.some((i) => i.status === status);
        if (!matchesStatus) return false;
      }
      if (questionType !== "all") {
        const matchesType = group.some((i) => i.question_type === questionType);
        if (!matchesType) return false;
      }
      return true;
    });

    // Sort order logic
    groups.sort((a, b) => {
      const aFirst = a[0];
      const bFirst = b[0];

      if (sortBy === "priority_desc") {
        const aFlagged = a.some((i) => i.is_flagged) ? 1 : 0;
        const bFlagged = b.some((i) => i.is_flagged) ? 1 : 0;
        if (aFlagged !== bFlagged) return bFlagged - aFlagged;

        const aRisk = Math.max(...a.map((i) => (i as any).integrity_risk_score || 0));
        const bRisk = Math.max(...b.map((i) => (i as any).integrity_risk_score || 0));
        if ((aRisk >= 50 ? 1 : 0) !== (bRisk >= 50 ? 1 : 0)) {
          return (bRisk >= 50 ? 1 : 0) - (aRisk >= 50 ? 1 : 0);
        }

        const aDone = a.every(
          (i) => i.status === "COMPLETED" || i.status === "RELEASED",
        )
          ? 1
          : 0;
        const bDone = b.every(
          (i) => i.status === "COMPLETED" || i.status === "RELEASED",
        )
          ? 1
          : 0;
        if (aDone !== bDone) return aDone - bDone;

        const aTime = new Date(
          aFirst.submitted_at || (aFirst as any).created_at || 0,
        ).getTime();
        const bTime = new Date(
          bFirst.submitted_at || (bFirst as any).created_at || 0,
        ).getTime();
        return aTime - bTime;
      }

      if (sortBy === "risk_desc") {
        const aRisk = Math.max(...a.map((i) => (i as any).integrity_risk_score || 0));
        const bRisk = Math.max(...b.map((i) => (i as any).integrity_risk_score || 0));
        return bRisk - aRisk;
      }

      if (sortBy === "date_asc") {
        return (
          new Date(aFirst.submitted_at || (aFirst as any).created_at || 0).getTime() -
          new Date(bFirst.submitted_at || (bFirst as any).created_at || 0).getTime()
        );
      }

      if (sortBy === "date_desc") {
        return (
          new Date(bFirst.submitted_at || (bFirst as any).created_at || 0).getTime() -
          new Date(aFirst.submitted_at || (aFirst as any).created_at || 0).getTime()
        );
      }

      if (sortBy === "name_asc") {
        return (aFirst.student_name || "").localeCompare(bFirst.student_name || "");
      }

      return 0;
    });

    return groups;
  }, [data, search, status, questionType, sortBy]);

  const handleToggleSelectAttempt = (attemptId: string) => {
    setSelectedAttemptIds((prev) =>
      prev.includes(attemptId)
        ? prev.filter((id) => id !== attemptId)
        : [...prev, attemptId],
    );
  };

  const handleSelectAllVisibleAttempts = (checked: boolean) => {
    if (checked) {
      const visibleIds = groupedSubmissions.map((g) => g[0].attempt_id);
      setSelectedAttemptIds(visibleIds);
    } else {
      setSelectedAttemptIds([]);
    }
  };

  const handleBulkFlag = async (flag: boolean) => {
    if (selectedAttemptIds.length === 0) return;
    try {
      setIsBulkFlagging(true);
      await Promise.all(
        selectedAttemptIds.map((id) => integrityApi.toggleFlag(id, flag)),
      );
      toast.success(
        flag
          ? `Flagged ${selectedAttemptIds.length} attempt(s)`
          : `Unflagged ${selectedAttemptIds.length} attempt(s)`,
      );
      setData((prev) =>
        prev.map((item) =>
          selectedAttemptIds.includes(item.attempt_id)
            ? { ...item, is_flagged: flag }
            : item,
        ),
      );
    } catch {
      toast.error("Failed to perform bulk flag operation");
    } finally {
      setIsBulkFlagging(false);
    }
  };

  const handleBulkAcceptAiSuggestions = async (minConfidence: number) => {
    if (selectedAttemptIds.length === 0) return;
    try {
      setIsBulkApplyingAi(true);
      let appliedCount = 0;

      for (const attemptId of selectedAttemptIds) {
        const attemptItems = data.filter((d) => d.attempt_id === attemptId);
        for (const item of attemptItems) {
          const aiSug = getAiSuggestion(item);
          if (
            aiSug.hasSuggestion &&
            (aiSug.confidence === null || aiSug.confidence >= minConfidence)
          ) {
            await gradingApi.saveGrade(item.id, {
              score: aiSug.score!,
              feedback: aiSug.feedbackDraft || aiSug.rationale || "",
              is_final: true,
              accept_ai_suggestion: true,
            });
            appliedCount++;
          }
        }
      }

      toast.success(`Successfully finalized AI evaluations across ${appliedCount} question(s)`);
      setShowBulkAiDialog(false);
      setSelectedAttemptIds([]);
      refreshClassContext();
    } catch {
      toast.error("Failed to apply bulk AI evaluations");
    } finally {
      setIsBulkApplyingAi(false);
    }
  };

  const requestBulkReleaseSelected = () => {
    if (!selectedAssessment || selectedAttemptIds.length === 0) return;
    setBulkReleaseAction({
      type: "selected",
      count: selectedAttemptIds.length,
      attemptIds: [...selectedAttemptIds],
    });
    setBulkReleaseDialogOpen(true);
  };

  const requestReleaseClassReady = () => {
    if (!selectedAssessment || !selectedClass) return;
    const attemptIds = releasableResults
      .map((r) => r.attempt_id)
      .filter((id): id is string => Boolean(id));
    if (attemptIds.length === 0) return;
    setBulkReleaseAction({
      type: "class_ready",
      count: attemptIds.length,
      className: selectedClass.class_name,
      attemptIds,
    });
    setBulkReleaseDialogOpen(true);
  };

  const executeBulkRelease = async () => {
    if (!selectedAssessment || !bulkReleaseAction || !bulkReleaseAction.attemptIds || bulkReleaseAction.attemptIds.length === 0) return;
    try {
      setIsReleasing(true);
      const res = await resultApi.releaseResults(
        selectedAssessment.id,
        bulkReleaseAction.attemptIds,
        selectedClass?.class_id,
      );
      const count =
        res?.released_count ?? res?.published_count ?? bulkReleaseAction.attemptIds.length;
      let msg = `Successfully published results for ${count} student(s)`;
      if (res?.held_count > 0) {
        msg += ` (${res.held_count} held due to integrity flags)`;
      }
      if (res?.incomplete_count > 0) {
        msg += ` (${res.incomplete_count} skipped - incomplete grading)`;
      }
      toast.success(msg);
      setSelectedAttemptIds([]);
      refreshClassContext();
    } catch {
      toast.error("Failed to publish results");
    } finally {
      setIsReleasing(false);
      setBulkReleaseDialogOpen(false);
      setBulkReleaseAction(null);
    }
  };

  // Submissions filter handlers
  const handleSearchChange = (v: string) => setSearch(v);
  const handleStatusChange = (v: string) => setStatus(v);
  const handleQuestionTypeChange = (v: string) => setQuestionType(v);
  const handleSortByChange = (v: string) => setSortBy(v);
  const handleGroupSearchChange = (v: string) => setGroupSearch(v);

  // Statistics calculation for Step D
  const classAnalytics = useMemo(() => {
    if (!selectedClass)
      return {
        enrolled: 0,
        submitted: 0,
        graded: 0,
        pending: 0,
        flagged: 0,
        avgPercentage: null,
        avgScore: null,
        passRate: null,
        lowestScore: null,
        highestScore: null,
        completionPct: 0,
      };

    const enrolled = selectedClass.total_students || 0;
    const submitted = selectedClass.submitted_count || 0;
    const graded = selectedClass.reviewed_count || 0;
    const pending = selectedClass.pending_review_count || 0;
    const flagged = data.filter((d) => d.is_flagged).length;

    const scoredItems = releaseQueue.filter(
      (r) => r.total_score !== null && r.total_score !== undefined,
    );
    const avgPercentage =
      scoredItems.length > 0
        ? Math.round(
            scoredItems.reduce((sum, r) => sum + (r.percentage || 0), 0) /
              scoredItems.length,
          )
        : null;

    const avgScore =
      scoredItems.length > 0
        ? Math.round(
            (scoredItems.reduce((sum, r) => sum + (r.total_score || 0), 0) /
              scoredItems.length) *
              10,
          ) / 10
        : null;

    const passingCount = scoredItems.filter((r) => r.is_passing).length;
    const passRate =
      scoredItems.length > 0
        ? Math.round((passingCount / scoredItems.length) * 100)
        : null;

    const scores = scoredItems.map((r) => r.total_score || 0);
    const lowestScore = scores.length > 0 ? Math.min(...scores) : null;
    const highestScore = scores.length > 0 ? Math.max(...scores) : null;
    const completionPct =
      submitted > 0 ? Math.round((graded / submitted) * 100) : 0;

    return {
      enrolled,
      submitted,
      graded,
      pending,
      flagged,
      avgPercentage,
      avgScore,
      passRate,
      lowestScore,
      highestScore,
      completionPct,
    };
  }, [selectedClass, data, releaseQueue]);

  const releasableResults = useMemo(() => {
    return releaseQueue.filter(
      (r) => r.can_release || r.status === "PENDING_RELEASE",
    );
  }, [releaseQueue]);

  return (
    <>
      {/* ─── RENDERING PATH 2: INDIVIDUAL SPEEDGRADER ───────────────────────────── */}
      {activeAttempt && selectedStudent ? (
        <div className="min-h-screen bg-background flex flex-col font-sans text-foreground animate-in fade-in duration-300">
          {/* SpeedGrader Header */}
          <div className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCloseIndividualWorkspace}
                className="h-8 px-3 border border-border/60 rounded-xl hover:bg-muted/50 transition-colors text-xs font-medium shrink-0"
              >
                <X className="size-3.5 mr-1.5" /> Close Workspace
              </Button>
              <div className="h-4 w-px bg-border/40 shrink-0" />
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-foreground leading-tight truncate flex items-center gap-2">
                  <span>Grading: {selectedStudent.student_name}</span>
                  {selectedStudent.is_flagged && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium border-rose-500/30 bg-rose-500/5 text-rose-600 px-1.5 py-0"
                    >
                      <Flag className="size-2.5 mr-1 text-rose-500" /> Flagged
                    </Badge>
                  )}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5 font-normal truncate">
                  {selectedStudent.assessment_title} • Attempt #
                  {activeAttempt.attempt_number}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Autosave Status Indicator */}
              {autosaveStatus === "saving" ? (
                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-medium animate-pulse">
                  <Loader2 className="size-3 animate-spin text-amber-500" />
                  <span>Saving draft...</span>
                </div>
              ) : autosaveStatus === "saved" ? (
                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-medium">
                  <CheckCircle2 className="size-3 text-emerald-500" />
                  <span>Draft saved</span>
                </div>
              ) : null}

              {/* Time Spent Pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/30 border border-border/50 rounded-xl text-xs font-normal">
                <Clock className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground hidden sm:inline">
                  Spent:
                </span>
                <span className="font-mono font-medium text-foreground">
                  {formatTimeSpent(activeAttempt, activeSubmission)}
                </span>
              </div>

              {/* Layout Sidebar Toggles */}
              <div className="flex items-center gap-1 border border-border/60 rounded-xl p-0.5 bg-muted/10">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                  className={cn(
                    "h-7 px-2 text-xs font-medium rounded-lg",
                    isLeftSidebarOpen ? "bg-card text-foreground shadow-2xs" : "text-muted-foreground",
                  )}
                  title={isLeftSidebarOpen ? "Collapse Questions List (Alt+[)" : "Expand Questions List (Alt+[)"}
                >
                  {isLeftSidebarOpen ? (
                    <PanelLeftClose className="size-3.5" />
                  ) : (
                    <PanelLeftOpen className="size-3.5" />
                  )}
                  <span className="hidden lg:inline ml-1">Questions</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                  className={cn(
                    "h-7 px-2 text-xs font-medium rounded-lg",
                    isRightSidebarOpen ? "bg-card text-foreground shadow-2xs" : "text-muted-foreground",
                  )}
                  title={isRightSidebarOpen ? "Collapse AI & Review Panel (Alt+])" : "Expand AI & Review Panel (Alt+])"}
                >
                  {isRightSidebarOpen ? (
                    <PanelRightClose className="size-3.5" />
                  ) : (
                    <PanelRightOpen className="size-3.5" />
                  )}
                  <span className="hidden lg:inline ml-1">Review</span>
                </Button>
              </div>

              {/* Focus Mode Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (isLeftSidebarOpen || isRightSidebarOpen) {
                    setIsLeftSidebarOpen(false);
                    setIsRightSidebarOpen(false);
                  } else {
                    setIsLeftSidebarOpen(true);
                    setIsRightSidebarOpen(true);
                  }
                }}
                className="h-8 px-2.5 border border-border/60 rounded-xl hover:bg-muted/50 text-xs font-medium flex items-center gap-1.5"
                title="Toggle Distraction-Free Canvas Mode"
              >
                {!isLeftSidebarOpen && !isRightSidebarOpen ? (
                  <Minimize2 className="size-3.5 text-primary" />
                ) : (
                  <Maximize2 className="size-3.5 text-muted-foreground" />
                )}
                <span className="hidden sm:inline">
                  {!isLeftSidebarOpen && !isRightSidebarOpen ? "Exit Focus" : "Focus"}
                </span>
              </Button>

              {/* Keyboard Shortcuts Trigger Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShortcutsDialog(true)}
                className="h-8 px-2.5 border border-border/60 rounded-xl hover:bg-muted/50 text-xs font-medium flex items-center gap-1.5"
                title="View Keyboard Shortcuts (press ? or ⌘/)"
              >
                <Keyboard className="size-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Shortcuts</span>
                <kbd className="hidden md:inline-block px-1 py-0.2 text-[9px] font-mono bg-muted border rounded text-muted-foreground">
                  ?
                </kbd>
              </Button>
            </div>
          </div>

          {/* 3-Pane Collapsible Workspace Canvas */}
          <div className="flex-1 flex overflow-hidden h-[calc(100vh-65px)]">
            {/* Left Sidebar - Question Navigation */}
            {isLeftSidebarOpen ? (
              <div className="w-64 border-r border-border/50 bg-muted/5 flex flex-col shrink-0 animate-in slide-in-from-left duration-200">
                <div className="p-3 border-b border-border/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Questions ({activeAttempt.questions?.length || 0})
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 rounded-lg text-muted-foreground hover:text-foreground"
                      onClick={() => setIsLeftSidebarOpen(false)}
                      title="Collapse list (Alt+[)"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                  </div>

                  {/* Jump to Next Ungraded Shortcut Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleJumpToNextUngraded}
                    className="w-full h-7 px-2 text-[11px] font-medium rounded-lg border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 flex items-center justify-between"
                    title="Jump to Next Ungraded Question (Alt+U)"
                  >
                    <span className="flex items-center gap-1">
                      <Sparkles className="size-3 text-amber-600" /> Next Ungraded
                    </span>
                    <kbd className="px-1 text-[9px] font-mono bg-background border rounded text-muted-foreground">
                      Alt+U
                    </kbd>
                  </Button>

                  {/* Filter Pill: All vs Ungraded */}
                  {(() => {
                    const totalQ = activeAttempt.questions?.length || 0;
                    const ungradedCount =
                      activeAttempt.questions?.filter((q) => {
                        if (isQuestionAutoGraded(q)) return false;
                        const sub = activeSubmissions.find(
                          (s: SubmissionRecord) => s.question_id === q.id,
                        );
                        return !sub || !sub.is_final;
                      }).length || 0;

                    return (
                      <div className="flex items-center p-0.5 bg-muted/50 rounded-lg border border-border/40 text-[10px]">
                        <button
                          onClick={() => setFilterUngradedOnly(false)}
                          className={cn(
                            "flex-1 py-1 text-center font-medium rounded-md transition-colors",
                            !filterUngradedOnly
                              ? "bg-background text-foreground shadow-2xs font-semibold"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          All ({totalQ})
                        </button>
                        <button
                          onClick={() => setFilterUngradedOnly(true)}
                          className={cn(
                            "flex-1 py-1 text-center font-medium rounded-md transition-colors",
                            filterUngradedOnly
                              ? "bg-background text-foreground shadow-2xs font-semibold"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          Ungraded ({ungradedCount})
                        </button>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                  {(() => {
                    const items = (activeAttempt.questions || [])
                      .map((q: AttemptQuestion, idx: number) => ({ q, idx }))
                      .filter(({ q }) => {
                        if (!filterUngradedOnly) return true;
                        if (isQuestionAutoGraded(q)) return false;
                        const sub = activeSubmissions.find(
                          (s: SubmissionRecord) => s.question_id === q.id,
                        );
                        return !sub || !sub.is_final;
                      });

                    if (items.length === 0) {
                      return (
                        <div className="p-4 text-center text-xs text-muted-foreground italic">
                          No questions matching filter.
                        </div>
                      );
                    }

                    return items.map(({ q, idx }) => {
                      const sub = activeSubmissions.find(
                        (s: SubmissionRecord) => s.question_id === q.id,
                      );
                      const isAuto = isQuestionAutoGraded(q);
                      return (
                        <button
                          key={q.id}
                          onClick={() => handleSelectQuestion(idx)}
                          className={cn(
                            "w-full p-2.5 rounded-xl border text-left text-xs transition-all relative flex items-center justify-between",
                            activeQuestionIndex === idx
                              ? "border-primary/60 bg-primary/5 text-primary font-medium shadow-2xs"
                              : "border-border/40 bg-card text-foreground hover:bg-muted/20",
                          )}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-semibold truncate">
                              Q{idx + 1}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate font-normal">
                              {q.type?.replace(/_/g, " ") || "Essay"} •{" "}
                              {q.marks} pts
                            </div>
                          </div>
                          <div>
                            {isAuto ? (
                              <Badge
                                variant="secondary"
                                className="text-[8px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 px-1 py-0 shadow-none font-mono"
                              >
                                Auto
                              </Badge>
                            ) : sub?.is_final ? (
                              <Badge className="text-[8px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 px-1 py-0 shadow-none font-mono">
                                Graded
                              </Badge>
                            ) : sub && !sub.is_final ? (
                              <Badge className="text-[8px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 px-1 py-0 shadow-none font-mono">
                                Draft
                              </Badge>
                            ) : (
                              <Badge className="text-[8px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 px-1 py-0 shadow-none font-mono">
                                Pending
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsLeftSidebarOpen(true)}
                className="w-9 border-r border-border/50 bg-muted/5 flex flex-col items-center pt-3 hover:bg-muted/15 transition-colors"
                title="Expand Questions Navigation (Alt+[)"
              >
                <Menu className="size-4 text-muted-foreground mb-3" />
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground [writing-mode:vertical-lr] select-none">
                  Questions
                </div>
              </button>
            )}

            {/* Center Pane - Main Workspace */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50 flex flex-col">
              {(() => {
                const currentQuestion =
                  activeAttempt.questions?.[activeQuestionIndex];
                const isAutoGraded = isQuestionAutoGraded(currentQuestion);
                const maxMarks =
                  currentQuestion?.marks || DEFAULT_QUESTION_MAX_MARKS;
                const currentSubmission = activeSubmissions.find(
                  (s: any) => s.question_id === currentQuestion?.id,
                );

                return (
                  <div className="max-w-4xl mx-auto w-full space-y-5">
                    {/* Question Prompt Card */}
                    <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                            Question Prompt
                          </span>
                          {isAutoGraded && (
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[9px] font-medium py-0.5 px-1.5 flex items-center gap-1">
                              <Award className="size-3" /> System Auto-Graded
                            </Badge>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-medium font-mono"
                        >
                          Q{activeQuestionIndex + 1} ({maxMarks} pts)
                        </Badge>
                      </div>

                      {/* Case scenario context */}
                      {(currentQuestion?.caseStudyContext ||
                        (currentQuestion as any)?.case_study_context) && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/30 p-3.5 space-y-1.5 text-xs leading-relaxed">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                            <BookOpen className="size-3.5" /> Case Scenario
                            Context
                          </p>
                          <div className="text-xs leading-relaxed text-amber-950 dark:text-amber-100 font-normal">
                            {renderRichMathText(
                              currentQuestion?.caseStudyContext ||
                                (currentQuestion as any)?.case_study_context,
                            )}
                          </div>
                        </div>
                      )}

                      {/* Question Stem Text with LaTeX KaTeX */}
                      <div className="text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap font-normal">
                        {renderRichMathText(
                          currentQuestion?.text ||
                            currentQuestion?.content ||
                            "",
                        )}
                      </div>

                      {/* Structured Table Context in Question */}
                      {(currentQuestion?.question_table_context ||
                        (currentQuestion as any)?.questionTableContext) && (
                        <div className="pt-2">
                          <TableContextViewer
                            data={
                              currentQuestion.question_table_context ||
                              (currentQuestion as any).questionTableContext
                            }
                          />
                        </div>
                      )}

                      {/* Question diagram illustration */}
                      {(currentQuestion?.imageUrl ||
                        (currentQuestion as any)?.image_url) && (
                        <div className="p-1 border border-border/40 rounded-xl bg-muted/5 inline-block relative max-w-full overflow-hidden mt-2">
                          <Image
                            src={
                              currentQuestion?.imageUrl ||
                              (currentQuestion as any)?.image_url ||
                              ""
                            }
                            alt={
                              (currentQuestion as any)?.image_alt_text ||
                              "Question diagram / illustration"
                            }
                            width={480}
                            height={270}
                            className="max-h-[240px] rounded-lg object-contain w-auto h-auto"
                            priority={activeQuestionIndex === 0}
                          />
                        </div>
                      )}
                    </div>

                    {/* Student Answer Canvas */}
                    <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                          Student Answer
                        </span>
                        {currentSubmission?.answer_type === "FILE" &&
                          currentSubmission?.file_url && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] font-medium flex items-center gap-1"
                            >
                              <FileText className="size-3" /> File Attachment
                            </Badge>
                          )}
                      </div>

                      {currentSubmission?.answer_type === "FILE" &&
                        currentSubmission?.file_url && (
                          <div className="p-3.5 rounded-xl border border-primary/10 bg-primary/[0.02] flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="size-4 text-primary shrink-0" />
                              <div className="min-w-0 font-medium">
                                <p className="text-xs font-medium text-foreground truncate max-w-xs">
                                  {currentSubmission.file_url
                                    .split("/")
                                    .pop() || "deliverable_file"}
                                </p>
                                <a
                                  href={currentSubmission.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] font-medium text-primary hover:underline"
                                >
                                  Download Deliverable File
                                </a>
                              </div>
                            </div>
                          </div>
                        )}

                      <div className="text-xs sm:text-sm font-sans leading-relaxed bg-muted/10 p-3.5 rounded-xl border border-border/40 max-h-[460px] overflow-y-auto">
                        <SpeedGraderStudentAnswerCanvas
                          currentQuestion={currentQuestion}
                          currentSubmission={currentSubmission}
                          maxMarks={maxMarks}
                        />
                      </div>
                    </div>

                    {/* Rubric Criteria Reference */}
                    {currentQuestion?.rubric && (
                      <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-2xs space-y-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Rubric Criteria Reference
                        </span>
                        <div className="space-y-3">
                          {currentQuestion.rubric.criteria.map((c: any) => (
                            <div
                              key={c.id}
                              className="space-y-1.5 text-xs border-b last:border-b-0 pb-2.5 last:pb-0"
                            >
                              <div className="flex items-center justify-between font-semibold">
                                <span>{renderRichMathText(c.title)}</span>
                                <span className="text-primary font-mono text-xs">
                                  {c.max_marks} pts
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-normal font-normal">
                                {renderRichMathText(c.description)}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                                {c.levels?.map((lvl: any) => (
                                  <div
                                    key={lvl.id}
                                    className="p-2.5 border border-border/40 rounded-xl bg-muted/5 text-[11px] leading-normal space-y-0.5"
                                  >
                                    <div className="font-medium flex justify-between">
                                      <span>
                                        {renderRichMathText(lvl.title)}
                                      </span>
                                      <span className="text-primary font-mono">
                                        {lvl.marks} pts
                                      </span>
                                    </div>
                                    <p className="text-muted-foreground/90 font-normal">
                                      {renderRichMathText(lvl.description)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lecturer Evaluation & Decision Card */}
                    {isAutoGraded ? (
                      <div className="border border-border/50 bg-muted/10 rounded-2xl p-5 shadow-2xs space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="size-4 text-emerald-500" />
                          <span>Auto-Graded Question</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed font-normal">
                          This question is scored automatically based on predefined deterministic rules.
                        </p>
                        <div className="p-3 bg-card border rounded-xl flex justify-between items-center text-xs">
                          <span className="font-medium text-muted-foreground">
                            Recorded Score
                          </span>
                          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {currentSubmission?.score !== null &&
                            currentSubmission?.score !== undefined
                              ? `${currentSubmission.score} / ${maxMarks} pts`
                              : `Pending / ${maxMarks} pts`}
                          </span>
                        </div>
                      </div>
                    ) : currentSubmission ? (
                      <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-2xs space-y-4">
                        <div className="flex items-center justify-between border-b border-border/30 pb-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                            Lecturer Decision
                          </span>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="individual-score-input"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Final Score (max {maxMarks} pts)
                            </Label>
                            <Input
                              id="individual-score-input"
                              type="number"
                              min={0}
                              max={maxMarks}
                              step="any"
                              placeholder="Enter score..."
                              value={overrideScore}
                              disabled={!isEditing}
                              onChange={(e) => {
                                const val = e.target.value;
                                setOverrideScore(val);
                                setIsAiAccepted(false);
                                setIsEditing(true);
                                triggerDebouncedAutosave(
                                  val,
                                  finalFeedback,
                                  rubricScores,
                                );
                              }}
                              className="h-9 text-xs rounded-lg font-mono font-medium w-full bg-background"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label
                              htmlFor="individual-feedback-input"
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Feedback Comments
                            </Label>
                            <Textarea
                              id="individual-feedback-input"
                              placeholder="Provide feedback comments..."
                              value={finalFeedback}
                              disabled={!isEditing}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFinalFeedback(val);
                                setIsAiAccepted(false);
                                setIsEditing(true);
                                triggerDebouncedAutosave(
                                  overrideScore,
                                  val,
                                  rubricScores,
                                );
                              }}
                              className="min-h-[80px] text-xs rounded-lg w-full font-normal bg-background"
                            />
                            <span className="text-[10px] text-muted-foreground block italic">
                              * This feedback will be shown to the student upon release.
                            </span>
                          </div>

                          <div className="border-t border-border/30 pt-3 flex flex-col gap-2.5">
                            {!isEditing ? (
                              <div className="space-y-2">
                                {(() => {
                                  const aiSug =
                                    getAiSuggestion(currentSubmission);
                                  return aiSug.hasSuggestion ? (
                                    <div className="flex flex-col gap-2">
                                      <Button
                                        onClick={() => {
                                          const aiScore = aiSug.score!;
                                          const aiFb =
                                            aiSug.feedbackDraft ||
                                            aiSug.rationale ||
                                            "";
                                          setOverrideScore(aiScore.toString());
                                          setFinalFeedback(aiFb);
                                          setIsAiAccepted(true);
                                          setIsEditing(true);
                                          triggerDebouncedAutosave(
                                            aiScore.toString(),
                                            aiFb,
                                            rubricScores,
                                          );
                                          toast.success(
                                            "AI suggestion applied. Review and finalize or modify.",
                                          );
                                        }}
                                        disabled={isSaving}
                                        className="w-full h-9 text-xs font-medium rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5 shadow-2xs"
                                      >
                                        <CheckCircle2 className="size-3.5" />
                                        <span>Accept AI Suggestion</span>
                                      </Button>
                                      <div className="grid grid-cols-2 gap-2.5">
                                        <Button
                                          variant="outline"
                                          onClick={() => {
                                            setIsEditing(true);
                                            setIsAiAccepted(false);
                                          }}
                                          disabled={isSaving}
                                          className="h-8 text-xs font-medium rounded-xl border-border/80 text-foreground hover:bg-muted/50"
                                        >
                                          Modify Review
                                        </Button>
                                        <Button
                                          variant="outline"
                                          onClick={() => {
                                            setOverrideScore("");
                                            setFinalFeedback("");
                                            setIsEditing(true);
                                            setIsAiAccepted(false);
                                          }}
                                          disabled={isSaving}
                                          className="h-8 text-xs font-medium rounded-xl border-red-500/20 text-red-600 hover:bg-red-500/5"
                                        >
                                          Reject AI Review
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      onClick={() => {
                                        setIsEditing(true);
                                        setIsAiAccepted(false);
                                      }}
                                      disabled={isSaving}
                                      className="w-full h-9 text-xs font-medium rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5 shadow-2xs"
                                    >
                                      Enter Manual Grade
                                    </Button>
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isSaving || isSavingDraft}
                                    onClick={() =>
                                      submitGrade(false, isAiAccepted)
                                    }
                                    className="h-8 text-xs font-medium rounded-xl border-border/80 text-foreground hover:bg-muted/50 flex items-center justify-center gap-1.5"
                                  >
                                    {isSavingDraft ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <Save className="size-3" />
                                    )}
                                    Save Draft (⌘S)
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isSaving || isSavingDraft}
                                    onClick={() => setIsEditing(false)}
                                    className="h-8 text-xs font-medium rounded-xl border-border/80 text-foreground hover:bg-muted/50"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                                <Button
                                  onClick={() => handleSaveAndNextIndividual()}
                                  disabled={isSaving || isSavingDraft}
                                  className="w-full h-9 text-xs font-medium rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5 shadow-2xs"
                                >
                                  {isSaving ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="size-3.5" />
                                  )}
                                  Finalize Grade & Next (⌘Enter)
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            {/* Right Sidebar - Collapsible AI/Rubric Context */}
            {isRightSidebarOpen ? (
              <div className="w-80 border-l border-border/50 bg-muted/5 p-3.5 space-y-3.5 overflow-y-auto shrink-0 animate-in slide-in-from-right duration-200">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" /> AI Review &
                    Audit
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => setIsRightSidebarOpen(false)}
                    title="Collapse review panel (Alt+])"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>

                {!isAssessmentAiAllowed(selectedAssessment) ? (
                  <ManualOnlyLanguageBanner
                    language={
                      selectedAssessment?.language ||
                      (selectedAssessment as any)?.language_code ||
                      "Kinyarwanda"
                    }
                  />
                ) : !isQuestionAutoGraded(
                    activeAttempt.questions?.[activeQuestionIndex],
                  ) && activeSubmission ? (
                  <div className="space-y-3.5">
                    {!getAiSuggestion(activeSubmission).hasSuggestion &&
                    activeAttempt.status === "IN_PROGRESS" ? (
                      <div className="p-4 border rounded-xl bg-card space-y-2 flex flex-col items-center justify-center text-center">
                        <Sparkles className="size-6 text-primary animate-pulse" />
                        <p className="text-xs font-semibold text-foreground">
                          AI Evaluation in Progress
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-normal font-normal">
                          AI is analyzing submission response and generating rubric draft.
                        </p>
                      </div>
                    ) : (
                      <>
                        <AIReviewPanel
                          queueItemId={selectedStudent?.id}
                          responseId={activeSubmission.id}
                          maxScore={
                            activeAttempt.questions?.[activeQuestionIndex]
                              ?.marks || DEFAULT_QUESTION_MAX_MARKS
                          }
                          onSuggestionApplied={(score, feedback) => {
                            setOverrideScore(score.toString());
                            const fb = feedback || "";
                            if (feedback) setFinalFeedback(fb);
                            setIsAiAccepted(true);
                            setIsEditing(true);
                            triggerDebouncedAutosave(
                              score.toString(),
                              fb || finalFeedback,
                              rubricScores,
                            );
                          }}
                          onSuggestionLoaded={(
                            draft,
                            strengths,
                            improvements,
                            suggestions,
                          ) => {
                            setAiFeedbackDraft(draft);
                            setAiStrengths(strengths);
                            setAiImprovements(improvements);
                            setAiSuggestions(suggestions);
                          }}
                        />

                        <AIFeedbackEditor
                          responseId={activeSubmission.id}
                          initialDraft={aiFeedbackDraft || undefined}
                          initialStrengths={aiStrengths}
                          initialImprovements={aiImprovements}
                          initialSuggestions={aiSuggestions}
                          onDraftApplied={(text) => {
                            setFinalFeedback(text);
                            setIsAiAccepted(true);
                            setIsEditing(true);
                            triggerDebouncedAutosave(
                              overrideScore,
                              text,
                              rubricScores,
                            );
                          }}
                        />
                      </>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-dashed border-border/60 text-center text-xs text-muted-foreground italic leading-normal">
                    No AI evaluation panel for deterministic auto-graded questions.
                  </div>
                )}

                <CollapsibleDrawerSection
                  title="Integrity Flags"
                  icon={ShieldAlert}
                  defaultOpen={true}
                >
                  <div className="space-y-3 leading-normal">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 border border-border/40 rounded-xl bg-card space-y-0.5">
                        <div className="text-[9px] uppercase font-medium text-muted-foreground">
                          Tab Switches
                        </div>
                        <div className="text-sm font-semibold text-foreground font-mono">
                          {activeAttempt.tab_switch_count || 0}
                        </div>
                      </div>
                      <div className="p-2.5 border border-border/40 rounded-xl bg-card space-y-0.5">
                        <div className="text-[9px] uppercase font-medium text-muted-foreground">
                          FS Exits
                        </div>
                        <div className="text-sm font-semibold text-foreground font-mono">
                          {activeAttempt.fullscreen_exit_count || 0}
                        </div>
                      </div>
                      <div className="p-2.5 border border-border/40 rounded-xl bg-card space-y-0.5">
                        <div className="text-[9px] uppercase font-medium text-muted-foreground">
                          Copy Events
                        </div>
                        <div className="text-sm font-semibold text-foreground font-mono">
                          {activeAttempt.copy_attempt_count || 0}
                        </div>
                      </div>
                      <div className="p-2.5 border border-border/40 rounded-xl bg-card space-y-0.5">
                        <div className="text-[9px] uppercase font-medium text-muted-foreground">
                          Drops
                        </div>
                        <div className="text-sm font-semibold text-foreground font-mono">
                          {activeAttempt.reconnect_count || 0}
                        </div>
                      </div>
                    </div>

                    {activeAttempt.integrity_hold && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col gap-2 text-xs text-red-700 dark:text-red-400">
                        <div className="flex gap-2">
                          <Lock className="size-4 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold">Security Hold Active</p>
                            <p className="text-[11px] mt-0.5 leading-normal font-normal">
                              {activeAttempt.integrity_hold_reason ||
                                "Placed on security hold."}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-[11px] border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400 hover:bg-red-500/10 rounded-lg font-medium"
                          onClick={() => setShowIntegrityLiftDialog(true)}
                          disabled={isSaving}
                        >
                          <Unlock className="size-3 mr-1.5" /> Lift Security Hold
                        </Button>
                      </div>
                    )}

                    <div className="pt-2 border-t border-border/30 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">
                        Manual Review Flag
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-7 text-xs font-medium rounded-lg",
                          selectedStudent?.is_flagged
                            ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                            : "border-border/60",
                        )}
                        onClick={handleToggleManualFlag}
                        disabled={isSaving}
                      >
                        {selectedStudent?.is_flagged ? "Unflag" : "Flag Attempt"}
                      </Button>
                    </div>
                  </div>
                </CollapsibleDrawerSection>
              </div>
            ) : (
              <div className="w-9 border-l border-border/50 bg-muted/5 flex flex-col items-center py-3 gap-3 shrink-0">
                <DrawerIconButton
                  icon={Sparkles}
                  label="Review"
                  active={false}
                  onClick={() => setIsRightSidebarOpen(true)}
                />
                <DrawerIconButton
                  icon={ShieldAlert}
                  label="Integrity"
                  active={false}
                  onClick={() => setIsRightSidebarOpen(true)}
                />
              </div>
            )}
          </div>
        </div>
      ) : /* ─── RENDERING PATH 1: GROUP SPEEDGRADER ───────────────────── */
      selectedGroupSubmission ? (
        <div className="min-h-screen bg-background flex flex-col font-sans text-foreground animate-in fade-in duration-300">
          {/* Sticky Group SpeedGrader Header */}
          <div className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCloseGroupWorkspace}
                className="h-8 px-3 border border-border/60 rounded-xl hover:bg-muted/50 transition-colors text-xs font-medium shrink-0"
              >
                <X className="size-3.5 mr-1.5" /> Close Workspace
              </Button>
              <div className="h-4 w-px bg-border/40 shrink-0" />
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-foreground leading-tight truncate flex items-center gap-2">
                  <span>Group: {selectedGroupSubmission.group_name}</span>
                  <Badge
                    variant="outline"
                    className="text-[9px] font-medium bg-indigo-500/5 text-indigo-600 border-indigo-500/20"
                  >
                    {selectedGroupSubmission.members?.length || 0} Members
                  </Badge>
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5 font-normal truncate">
                  {selectedAssessment?.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {/* Time Spent Pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/30 border border-border/50 rounded-xl text-xs font-normal">
                <Clock className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground hidden sm:inline">
                  Spent:
                </span>
                <span className="font-mono font-medium text-foreground">
                  {formatTimeSpent(selectedGroupSubmission)}
                </span>
              </div>

              {/* Keyboard Shortcuts Trigger Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShortcutsDialog(true)}
                className="h-8 px-2.5 border border-border/60 rounded-xl hover:bg-muted/50 text-xs font-medium flex items-center gap-1.5"
                title="View Keyboard Shortcuts (press ? or ⌘/)"
              >
                <Keyboard className="size-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Shortcuts</span>
                <kbd className="hidden md:inline-block px-1 py-0.2 text-[9px] font-mono bg-muted border rounded text-muted-foreground">
                  ?
                </kbd>
              </Button>
            </div>
          </div>

          {/* Group Question Navigation Bar */}
          <div className="border-b border-border/30 bg-muted/5 px-6 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsQuestionNavOpen(!isQuestionNavOpen)}
                className="h-7 text-xs font-medium rounded-lg border-border/60 bg-background"
              >
                <Menu className="size-3.5 mr-1.5" /> Questions
              </Button>
              <span className="text-xs font-normal text-muted-foreground">
                Question {groupGraderActiveQuestionIndex + 1} of{" "}
                {selectedGroupSubmission.questions?.length || 1}
              </span>
            </div>
          </div>

          {isQuestionNavOpen && (
            <div className="px-6 py-3 bg-card border-b border-border/30 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 animate-in slide-in-from-top duration-150">
              {selectedGroupSubmission.questions?.map(
                (q: any, idx: number) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      handleGroupQuestionSelect(idx);
                      setIsQuestionNavOpen(false);
                    }}
                    className={cn(
                      "p-2 rounded-lg border text-left text-xs transition-all relative",
                      groupGraderActiveQuestionIndex === idx
                        ? "border-primary/60 bg-primary/5 text-primary font-medium"
                        : "border-border/40 bg-background text-foreground hover:bg-muted/20",
                    )}
                  >
                    <div className="font-medium">Q{idx + 1}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {q.marks || 0} pts
                    </div>
                  </button>
                ),
              )}
            </div>
          )}

          {/* Group Workspace Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50">
            {(() => {
              const activeQ =
                selectedGroupSubmission.questions?.[
                  groupGraderActiveQuestionIndex
                ];
              const activeAns = selectedGroupSubmission.answers?.find(
                (ans: any) => ans.question_id === activeQ?.id,
              );
              const maxMarks = activeQ?.marks || DEFAULT_QUESTION_MAX_MARKS;

              return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start max-w-7xl mx-auto">
                  {/* Left Side: Prompt & Student Group Answer */}
                  <div className="lg:col-span-2 space-y-5">
                    {/* Prompt Card */}
                    <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                          Question Prompt
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono font-medium"
                        >
                          Q{groupGraderActiveQuestionIndex + 1} ({maxMarks} pts)
                        </Badge>
                      </div>

                      {/* Case scenario context */}
                      {(activeQ?.caseStudyContext ||
                        (activeQ as any)?.case_study_context) && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/30 p-3.5 space-y-1 text-xs leading-relaxed">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1">
                            <BookOpen className="size-3.5" /> Case Scenario Context
                          </p>
                          <div className="text-xs leading-relaxed text-amber-950 dark:text-amber-100 font-normal">
                            {renderRichMathText(
                              activeQ?.caseStudyContext ||
                                (activeQ as any)?.case_study_context,
                            )}
                          </div>
                        </div>
                      )}

                      <div className="text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap font-normal">
                        {renderRichMathText(
                          activeQ?.text || activeQ?.content || "",
                        )}
                      </div>

                      {(activeQ?.question_table_context ||
                        (activeQ as any)?.questionTableContext) && (
                        <div className="pt-2">
                          <TableContextViewer
                            data={
                              activeQ.question_table_context ||
                              (activeQ as any).questionTableContext
                            }
                          />
                        </div>
                      )}
                    </div>

                    {/* Group Answer Card */}
                    <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                          Group Submission Answer
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm font-sans leading-relaxed bg-muted/10 p-3.5 rounded-xl border border-border/40 max-h-[460px] overflow-y-auto">
                        <SpeedGraderStudentAnswerCanvas
                          currentQuestion={activeQ}
                          currentSubmission={activeAns}
                          maxMarks={maxMarks}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Group Evaluation Card */}
                  <div className="space-y-5">
                    <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-2xs space-y-4">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary block border-b border-border/30 pb-2">
                        Group Evaluation
                      </span>

                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="group-score-input"
                            className="text-xs font-medium text-muted-foreground"
                          >
                            Score (max {maxMarks} pts)
                          </Label>
                          <Input
                            id="group-score-input"
                            type="number"
                            min={0}
                            max={maxMarks}
                            step="any"
                            placeholder="Enter group score..."
                            value={groupScore}
                            onChange={(e) => setGroupScore(e.target.value)}
                            className="h-9 text-xs rounded-lg font-mono font-medium bg-background"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label
                            htmlFor="group-feedback-input"
                            className="text-xs font-medium text-muted-foreground"
                          >
                            Group Feedback
                          </Label>
                          <Textarea
                            id="group-feedback-input"
                            placeholder="Feedback for all group members..."
                            value={groupFeedback}
                            onChange={(e) => setGroupFeedback(e.target.value)}
                            className="min-h-[80px] text-xs rounded-lg font-normal bg-background"
                          />
                        </div>

                        <div className="pt-2 border-t border-border/30 flex flex-col gap-2">
                          <Button
                            onClick={() => handleSaveAndNext()}
                            disabled={gradingGroup}
                            className="w-full h-9 text-xs font-medium rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5"
                          >
                            {gradingGroup ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3.5" />
                            )}
                            Save & Next Question (⌘Enter)
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* ─── RENDERING PATH 3: REVIEW QUEUE NAVIGATION HIERARCHY ────────────────── */
        <div
          data-tour="lecturer-grading"
          className="w-full space-y-4 p-1 md:p-3 animate-in fade-in duration-200 font-sans"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                Review & Grading Queue
                {data.some(
                  (item) =>
                    item.status === "PENDING" ||
                    item.status === "AI_SUGGESTED",
                ) && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 font-normal">
                Navigate workspaces, select assessments, review submissions, and
                publish verified grades.
              </p>
            </div>
          </div>

          {/* Breadcrumbs for Hierarchy Navigation */}
          {(selectedWorkspace || selectedAssessment || selectedClass) && (
            <div className="flex items-center gap-2 text-xs font-normal text-muted-foreground mb-2 flex-wrap">
              <button
                onClick={handleBackToWorkspaces}
                className="hover:text-primary transition-colors flex items-center gap-1 font-medium"
              >
                <School className="size-3.5 text-muted-foreground/70" /> Workspaces
              </button>

              {selectedWorkspace && (
                <>
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                  <button
                    onClick={handleBackToAssessments}
                    className="hover:text-primary transition-colors font-medium"
                  >
                    {selectedWorkspace.title}
                  </button>
                </>
              )}

              {selectedAssessment && (
                <>
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                  <button
                    onClick={
                      selectedAssessment.is_group_assessment
                        ? undefined
                        : handleBackToClasses
                    }
                    className={cn(
                      "font-medium",
                      !selectedAssessment.is_group_assessment &&
                        "hover:text-primary transition-colors",
                    )}
                  >
                    {selectedAssessment.title}
                    {selectedAssessment.is_group_assessment && (
                      <Badge
                        variant="outline"
                        className="text-[9px] font-medium bg-indigo-500/5 text-indigo-600 border-indigo-500/20 ml-2"
                      >
                        <Users className="size-2.5 mr-1" /> Group Work
                      </Badge>
                    )}
                  </button>
                </>
              )}

              {selectedClass && (
                <>
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                  <span className="text-foreground font-semibold">
                    {selectedClass.class_name}
                  </span>
                </>
              )}
            </div>
          )}

          {/* STEP A: WORKSPACES LIST */}
          {!selectedWorkspace ? (
            <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs animate-in fade-in duration-300">
              <Table>
                <TableHeader className="bg-muted/15 border-b border-border/40">
                  <TableRow className="h-10 hover:bg-transparent border-none">
                    <TableHead className="text-[11px] font-medium px-6 text-muted-foreground uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <School className="size-3.5 text-muted-foreground/70" />{" "}
                        Institution
                      </span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <FolderOpen className="size-3.5 text-muted-foreground/70" />{" "}
                        Teaching Workspace
                      </span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Users className="size-3.5 text-muted-foreground/70" />{" "}
                        Class Section
                      </span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <User className="size-3.5 text-muted-foreground/70" />{" "}
                        Students
                      </span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <TrendingUp className="size-3.5 text-muted-foreground/70" />{" "}
                        Avg Perf.
                      </span>
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-medium pr-6 text-muted-foreground uppercase tracking-wider">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspaces.map((ws: WorkspaceListItem) => (
                    <TableRow
                      onClick={() => handleSelectWorkspace(ws)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectWorkspace(ws);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Select workspace ${ws.title}`}
                      key={ws.id}
                      className="group hover:bg-primary/[0.02] focus-visible:bg-primary/[0.03] focus-visible:outline-none h-13 border-border/20 transition-colors cursor-pointer"
                    >
                      <TableCell className="px-6 py-2.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-medium bg-primary/5 text-primary border-primary/20"
                        >
                          {ws.institution_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                          {ws.title}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-muted-foreground font-normal">
                        {ws.class_name}
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <span className="text-xs font-mono font-medium text-foreground/80 flex items-center justify-center gap-1">
                          <Users className="size-3 opacity-50" />{" "}
                          {ws.student_count}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-mono font-medium text-foreground/80">
                            {ws.performance_avg}%
                          </span>
                          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${ws.performance_avg}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-6 py-2.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {workspaces.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-44 text-center text-xs text-muted-foreground font-normal"
                      >
                        <div className="flex flex-col items-center justify-center gap-2">
                          <School className="size-8 opacity-20" />
                          <p>No active workspaces found for your account.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : /* STEP B: ASSESSMENTS LIST */
          !selectedAssessment ? (
            <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs animate-in fade-in duration-300">
              <Table>
                <TableHeader className="bg-muted/15 border-b border-border/40">
                  <TableRow className="h-10 hover:bg-transparent border-none">
                    <TableHead className="text-[11px] font-medium px-6 text-muted-foreground uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Filter className="size-3.5 text-muted-foreground/70" />{" "}
                        Type
                      </span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <FileText className="size-3.5 text-muted-foreground/70" />{" "}
                        Assessment Title
                      </span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <Award className="size-3.5 text-muted-foreground/70" />{" "}
                        Total Marks
                      </span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <Sparkles className="size-3.5 text-muted-foreground/70" />{" "}
                        Grading Mode
                      </span>
                    </TableHead>
                    <TableHead className="text-right text-[11px] font-medium pr-6 text-muted-foreground uppercase tracking-wider">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((asmt: AssessmentSummary) => (
                    <TableRow
                      onClick={() => handleSelectAssessment(asmt)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectAssessment(asmt);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Select assessment ${asmt.title}`}
                      key={asmt.id}
                      className="group hover:bg-primary/[0.02] focus-visible:bg-primary/[0.03] focus-visible:outline-none h-13 border-border/20 transition-colors cursor-pointer"
                    >
                      <TableCell className="px-6 py-2.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-medium bg-indigo-500/5 text-indigo-600 border-indigo-500/20"
                        >
                          {asmt.assessment_type.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                          {asmt.title}
                        </span>
                        {asmt.is_group_assessment && (
                          <Badge
                            variant="outline"
                            className="text-[9px] font-medium bg-indigo-500/5 text-indigo-600 border-indigo-500/20 ml-2"
                          >
                            <Users className="size-2.5 mr-1" /> Group Work
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <span className="text-xs font-mono font-medium text-foreground/80">
                          {asmt.total_marks} Pts
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <Badge
                          variant="outline"
                          className="text-[9px] font-medium bg-muted/10 text-muted-foreground border-border/50"
                        >
                          {asmt.grading_mode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6 py-2.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {assessments.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-44 text-center text-xs text-muted-foreground font-normal"
                      >
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FolderOpen className="size-8 opacity-20" />
                          <p>No assessments found in this workspace.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : /* STEP C (GROUP WORK QUEUE) */
          selectedAssessment.is_group_assessment ? (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border border-border/50 bg-card/30 rounded-2xl backdrop-blur-xs">
                <div className="flex items-center gap-2.5 flex-1 min-w-[240px] flex-wrap">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search groups or members..."
                      value={groupSearch}
                      onChange={(e) => handleGroupSearchChange(e.target.value)}
                      className="pl-8 pr-8 h-8 text-xs rounded-lg bg-background"
                    />
                    {groupSearch && (
                      <button
                        type="button"
                        onClick={() => handleGroupSearchChange("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-normal">
                  {filteredGroupQueue.length} groups submitted
                </div>
              </div>

              <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs">
                <Table>
                  <TableHeader className="bg-muted/15 border-b border-border/40">
                    <TableRow className="h-10 hover:bg-transparent border-none">
                      <TableHead className="text-[11px] font-medium px-6 text-muted-foreground uppercase tracking-wider">
                        Group Name
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Members
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Score
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Status
                      </TableHead>
                      <TableHead className="text-right text-[11px] font-medium pr-6 text-muted-foreground uppercase tracking-wider">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroupQueue.map((item) => (
                      <TableRow
                        key={item.id}
                        onClick={() => handleOpenGroupGrader(item)}
                        className="group hover:bg-primary/[0.02] h-13 border-border/20 cursor-pointer"
                      >
                        <TableCell className="px-6 py-2.5 font-medium text-xs text-foreground group-hover:text-primary">
                          {item.group_name}
                        </TableCell>
                        <TableCell className="py-2.5 text-xs text-muted-foreground">
                          {item.members?.map((m: any) => m.student_name).join(", ") ||
                            "No members"}
                        </TableCell>
                        <TableCell className="py-2.5 text-center font-mono text-xs">
                          {item.score !== null && item.score !== undefined
                            ? `${item.score} / ${item.total_marks}`
                            : "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] font-medium",
                              item.status === "GRADED"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-600 border-amber-500/20",
                            )}
                          >
                            {item.status || "PENDING"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-2.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs font-medium text-primary hover:bg-primary/10"
                          >
                            Open Grader
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredGroupQueue.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-36 text-center text-xs text-muted-foreground font-normal"
                        >
                          No group submissions match your filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : /* STEP C (INDIVIDUAL SECTIONS OVERVIEW) */
          !selectedClass ? (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Aggregated Class Overview Card */}
              {(() => {
                const statsList = Array.isArray(classStats) ? classStats : [];
                const totalEnrolled = statsList.reduce(
                  (a, b) => a + (b.total_students || 0),
                  0,
                );
                const totalSubmitted = statsList.reduce(
                  (a, b) => a + (b.submitted_count || 0),
                  0,
                );
                const totalReviewed = statsList.reduce(
                  (a, b) => a + (b.reviewed_count || 0),
                  0,
                );
                const totalPending = statsList.reduce(
                  (a, b) => a + (b.pending_review_count || 0),
                  0,
                );
                const totalReleased = statsList.reduce(
                  (a, b) => a + (b.released_count || 0),
                  0,
                );
                const progressPercent =
                  totalSubmitted > 0
                    ? Math.round((totalReviewed / totalSubmitted) * 100)
                    : 0;

                return (
                  <div className="p-4 border border-border/50 bg-card/40 rounded-2xl backdrop-blur-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <School className="size-4 text-primary" />
                        <span className="text-xs font-semibold text-foreground">
                          {selectedAssessment.title} — Class Sections Performance
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono font-medium bg-primary/5 text-primary border-primary/20"
                        >
                          {statsList.length} Section
                          {statsList.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      <div className="text-xs font-normal text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>
                          <strong className="text-foreground font-medium">
                            {totalReviewed}
                          </strong>{" "}
                          / {totalSubmitted} graded ({progressPercent}%)
                        </span>
                        <span>•</span>
                        <span>
                          <strong className="text-amber-600 dark:text-amber-400 font-medium">
                            {totalPending}
                          </strong>{" "}
                          pending
                        </span>
                        <span>•</span>
                        <span>
                          <strong className="text-indigo-600 dark:text-indigo-400 font-medium">
                            {totalReleased}
                          </strong>{" "}
                          released
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{
                          width: `${
                            totalSubmitted > 0
                              ? (totalReviewed / totalSubmitted) * 100
                              : 0
                          }%`,
                        }}
                      />
                      <div
                        className="h-full bg-amber-500 transition-all duration-300"
                        style={{
                          width: `${
                            totalSubmitted > 0
                              ? (totalPending / totalSubmitted) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Class Sections Table */}
              <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs">
                <Table>
                  <TableHeader className="bg-muted/15 border-b border-border/40">
                    <TableRow className="h-10 hover:bg-transparent border-none">
                      <TableHead className="text-[11px] font-medium px-6 text-muted-foreground uppercase tracking-wider">
                        Class Name
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Submissions
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Reviewed
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Pending
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Released
                      </TableHead>
                      <TableHead className="text-right text-[11px] font-medium pr-6 text-muted-foreground uppercase tracking-wider">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(classStats) ? classStats : []).map((c: ClassStatRecord) => (
                      <TableRow
                        onClick={() => handleSelectClass(c)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelectClass(c);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Select class section ${c.class_name}`}
                        key={c.class_id}
                        className="group hover:bg-primary/[0.02] focus-visible:bg-primary/[0.03] focus-visible:outline-none h-13 border-border/20 transition-colors cursor-pointer"
                      >
                        <TableCell className="px-6 py-2.5 font-medium text-xs text-foreground group-hover:text-primary">
                          {c.class_name}
                        </TableCell>
                        <TableCell className="py-2.5 text-center text-xs font-mono font-medium text-foreground/80">
                          {c.submitted_count} / {c.total_students}
                        </TableCell>
                        <TableCell className="py-2.5 text-center text-xs font-mono font-medium text-emerald-600">
                          {c.reviewed_count}
                        </TableCell>
                        <TableCell className="py-2.5 text-center text-xs font-mono font-medium text-amber-600">
                          {c.pending_review_count}
                        </TableCell>
                        <TableCell className="py-2.5 text-center text-xs font-mono font-medium text-indigo-500">
                          {c.released_count}
                        </TableCell>
                        <TableCell className="text-right pr-6 py-2.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <ChevronRight className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            /* STEP D: CLASS SECTION WORKSPACE (QUEUE & EMBEDDED RELEASE TABS) */
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Live Performance Card */}
              <div className="p-4 border border-border/50 bg-card/40 rounded-2xl backdrop-blur-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Activity className="size-4 text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">
                        {selectedClass.class_name} Section Dashboard
                      </h2>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-medium font-mono",
                          classAnalytics.pending === 0 &&
                            classAnalytics.submitted > 0
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20",
                        )}
                      >
                        {classAnalytics.pending === 0 &&
                        classAnalytics.submitted > 0
                          ? "Grading Complete"
                          : `${classAnalytics.pending} Pending`}
                      </Badge>
                    </div>
                    <p className="text-xs font-normal text-muted-foreground mt-0.5">
                      <strong className="text-foreground font-medium">
                        {classAnalytics.graded}/{classAnalytics.submitted} graded
                      </strong>
                      {" · "}
                      <strong
                        className={
                          classAnalytics.pending > 0
                            ? "text-amber-600 dark:text-amber-400 font-medium"
                            : "text-muted-foreground font-medium"
                        }
                      >
                        {classAnalytics.pending} pending
                      </strong>
                      {" · "}
                      <strong
                        className={
                          classAnalytics.flagged > 0
                            ? "text-rose-600 dark:text-rose-400 font-medium"
                            : "text-muted-foreground font-medium"
                        }
                      >
                        {classAnalytics.flagged} flagged
                      </strong>
                      {classAnalytics.avgPercentage !== null && (
                        <>
                          {" · "}
                          <strong className="text-primary font-medium">
                            avg {classAnalytics.avgPercentage}% (
                            {classAnalytics.avgScore}/
                            {selectedAssessment.total_marks} pts)
                          </strong>
                        </>
                      )}
                    </p>
                  </div>

                  {/* View Tab Switcher: Submissions Queue vs Release Queue */}
                  <Tabs
                    value={activeStepDView}
                    onValueChange={(v) =>
                      setActiveStepDView(v as "queue" | "release")
                    }
                  >
                    <TabsList className="h-8 p-0.5">
                      <TabsTrigger
                        value="queue"
                        className="h-7 px-3 text-xs font-medium gap-1"
                      >
                        <FileText className="size-3" /> Submissions Queue
                      </TabsTrigger>
                      <TabsTrigger
                        value="release"
                        className="h-7 px-3 text-xs font-medium gap-1"
                      >
                        <Unlock className="size-3" /> Release Queue
                        {releasableResults.length > 0 && (
                          <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 text-[9px] font-mono font-medium">
                            {releasableResults.length}
                          </span>
                        )}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${classAnalytics.completionPct}%` }}
                  />
                  <div
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{
                      width: `${
                        classAnalytics.submitted > 0
                          ? (classAnalytics.pending /
                              classAnalytics.submitted) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/30 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-card border border-border/40">
                    <span className="text-muted-foreground text-[11px] font-normal">
                      Submissions
                    </span>
                    <span className="font-mono font-medium text-foreground">
                      {classAnalytics.submitted} / {classAnalytics.enrolled}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-card border border-border/40">
                    <span className="text-muted-foreground text-[11px] font-normal">
                      Pass Rate
                    </span>
                    <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                      {classAnalytics.passRate !== null
                        ? `${classAnalytics.passRate}%`
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-card border border-border/40">
                    <span className="text-muted-foreground text-[11px] font-normal">
                      Score Range
                    </span>
                    <span className="font-mono font-medium text-foreground">
                      {classAnalytics.lowestScore !== null &&
                      classAnalytics.highestScore !== null
                        ? `${classAnalytics.lowestScore} - ${classAnalytics.highestScore}`
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-card border border-border/40">
                    <span className="text-muted-foreground text-[11px] font-normal">
                      Ready to Publish
                    </span>
                    <span
                      className={cn(
                        "font-mono font-medium",
                        releasableResults.length > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-foreground",
                      )}
                    >
                      {releasableResults.length} / {classAnalytics.submitted}
                    </span>
                  </div>
                </div>
              </div>

              {/* VIEW TAB 1: SUBMISSIONS QUEUE */}
              {activeStepDView === "queue" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Filters & Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border border-border/50 bg-card/30 rounded-2xl backdrop-blur-xs">
                    <div className="flex items-center gap-2.5 flex-1 min-w-[240px] flex-wrap">
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search students..."
                          value={search}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          className="pl-8 pr-8 h-8 text-xs rounded-lg bg-background"
                        />
                        {search && (
                          <button
                            type="button"
                            onClick={() => handleSearchChange("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>

                      <Select value={status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="w-38 h-8 text-xs rounded-lg">
                          <span className="flex items-center gap-1.5 truncate">
                            <Activity className="size-3 text-muted-foreground" />
                            <SelectValue placeholder="Status" />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Submissions</SelectItem>
                          <SelectItem value="PENDING">Awaiting Review</SelectItem>
                          <SelectItem value="AI_SUGGESTED">
                            AI Suggestions Ready
                          </SelectItem>
                          <SelectItem value="COMPLETED">Graded</SelectItem>
                          <SelectItem value="PENDING_RELEASE">
                            Ready to Release
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={questionType}
                        onValueChange={handleQuestionTypeChange}
                      >
                        <SelectTrigger className="w-34 h-8 text-xs rounded-lg">
                          <span className="flex items-center gap-1.5 truncate">
                            <Filter className="size-3 text-muted-foreground" />
                            <SelectValue placeholder="Type" />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="ESSAY">Essay</SelectItem>
                          <SelectItem value="SHORT_ANSWER">
                            Short Answer
                          </SelectItem>
                          <SelectItem value="CASE_STUDY">Case Study</SelectItem>
                          <SelectItem value="COMPUTATIONAL">
                            Computational
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={sortBy}
                        onValueChange={handleSortByChange}
                      >
                        <SelectTrigger className="w-48 h-8 text-xs rounded-lg font-medium">
                          <span className="flex items-center gap-1.5 truncate">
                            <ArrowUpDown className="size-3 text-muted-foreground" />
                            <SelectValue placeholder="Sort Order" />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="priority_desc">
                            Priority (Flagged & Oldest)
                          </SelectItem>
                          <SelectItem value="date_asc">Oldest First</SelectItem>
                          <SelectItem value="date_desc">Newest First</SelectItem>
                          <SelectItem value="risk_desc">Integrity Risk</SelectItem>
                          <SelectItem value="name_asc">
                            Student Name (A-Z)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="text-xs text-muted-foreground font-normal">
                      Showing {groupedSubmissions.length} attempts
                    </div>
                  </div>

                  {/* Bulk Actions Toolbar */}
                  {selectedAttemptIds.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4 bg-primary/5 border border-primary/20 rounded-2xl animate-in slide-in-from-top duration-200">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5">
                          {selectedAttemptIds.length} Selected
                        </Badge>
                        <span className="text-xs font-medium text-foreground">
                          Attempt{selectedAttemptIds.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBulkFlagging}
                          onClick={() => handleBulkFlag(true)}
                          className="h-7 text-xs font-medium rounded-lg border-rose-500/30 text-rose-600 hover:bg-rose-500/10 gap-1.5"
                        >
                          <Flag className="size-3 text-rose-500" /> Bulk Flag
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBulkFlagging}
                          onClick={() => handleBulkFlag(false)}
                          className="h-7 text-xs font-medium rounded-lg border-border/80 text-foreground hover:bg-muted/50 gap-1.5"
                        >
                          <Check className="size-3 text-muted-foreground" /> Bulk
                          Unflag
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowBulkAiDialog(true)}
                          className="h-7 text-xs font-medium rounded-lg border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 gap-1.5"
                        >
                          <Sparkles className="size-3 text-primary" /> Accept AI
                          Suggestions...
                        </Button>
                        <Button
                          size="sm"
                          disabled={isReleasing}
                          onClick={requestBulkReleaseSelected}
                          className="h-7 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        >
                          <Send className="size-3" /> Release Selected
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedAttemptIds([])}
                          className="h-7 text-xs font-normal text-muted-foreground hover:text-foreground"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Submissions Table */}
                  <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs">
                    <Table>
                      <TableHeader className="bg-muted/15 border-b border-border/40">
                        <TableRow className="h-10 hover:bg-transparent border-none">
                          <TableHead className="w-10 px-4 text-center">
                            <Checkbox
                              checked={
                                groupedSubmissions.length > 0 &&
                                groupedSubmissions.every((g) =>
                                  selectedAttemptIds.includes(g[0].attempt_id),
                                )
                              }
                              onCheckedChange={(checked) =>
                                handleSelectAllVisibleAttempts(Boolean(checked))
                              }
                              aria-label="Select all visible attempts"
                            />
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Student Name
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Progress & Review
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                            Integrity
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                            Submitted
                          </TableHead>
                          <TableHead className="text-right text-[11px] font-medium pr-6 text-muted-foreground uppercase tracking-wider">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedSubmissions.map((group) => {
                          const first = group[0];
                          const isSelected = selectedAttemptIds.includes(
                            first.attempt_id,
                          );
                          const totalQ = group.length;
                          const gradedQ = group.filter(
                            (i) => i.is_final,
                          ).length;
                          const hasAiSuggestion = group.some(
                            (i) => getAiSuggestion(i).hasSuggestion,
                          );
                          const isFlagged = group.some((i) => i.is_flagged);
                          const riskScore = Math.max(
                            ...group.map(
                              (i) => (i as any).integrity_risk_score || 0,
                            ),
                          );

                          return (
                            <TableRow
                              key={first.attempt_id}
                              className={cn(
                                "group h-13 border-border/20 transition-colors cursor-pointer",
                                isSelected && "bg-primary/[0.03]",
                                isFlagged && "bg-rose-500/[0.02]",
                              )}
                              onClick={() => handleOpenIndividualGrader(first)}
                            >
                              <TableCell
                                className="px-4 py-2.5 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() =>
                                    handleToggleSelectAttempt(first.attempt_id)
                                  }
                                  aria-label={`Select attempt by ${first.student_name}`}
                                />
                              </TableCell>
                              <TableCell className="py-2.5">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                                      {first.student_name}
                                    </span>
                                    {isFlagged && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] font-medium border-rose-500/30 bg-rose-500/5 text-rose-600 px-1 py-0"
                                      >
                                        Flagged
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-mono text-muted-foreground block">
                                    ID: {first.student_id?.slice(0, 10)}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-medium text-foreground">
                                    {gradedQ} / {totalQ}
                                  </span>
                                  {hasAiSuggestion && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] font-medium border-indigo-500/20 bg-indigo-500/5 text-indigo-600 flex items-center gap-1"
                                    >
                                      <Sparkles className="size-2.5" /> AI Ready
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5 text-center">
                                {riskScore >= 50 ? (
                                  <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/20 text-[9px] font-mono font-medium">
                                    {riskScore}% Risk
                                  </Badge>
                                ) : (
                                  <span className="text-xs font-mono text-muted-foreground">
                                    {riskScore}%
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 text-center text-xs text-muted-foreground font-normal">
                                {first.submitted_at
                                  ? formatDistanceToNow(
                                      new Date(first.submitted_at),
                                      { addSuffix: true },
                                    )
                                  : "Recently"}
                              </TableCell>
                              <TableCell className="text-right pr-6 py-2.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg"
                                >
                                  SpeedGrader →
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {groupedSubmissions.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="h-36 text-center text-xs text-muted-foreground font-normal"
                            >
                              No submissions found matching criteria.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>

                    {/* Pagination Controls */}
                    {total > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border/40 text-xs text-muted-foreground bg-muted/5">
                        <div className="font-medium">
                          Showing{" "}
                          <span className="font-mono text-foreground font-semibold">
                            {groupedSubmissions.length > 0
                              ? (currentPage - 1) * PAGE_SIZE + 1
                              : 0}
                          </span>{" "}
                          to{" "}
                          <span className="font-mono text-foreground font-semibold">
                            {Math.min(currentPage * PAGE_SIZE, total)}
                          </span>{" "}
                          of <span className="font-mono text-foreground font-semibold">{total}</span> total submissions
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage <= 1 || loading}
                            onClick={() => {
                              if (selectedAssessment) {
                                fetchQueue(
                                  selectedAssessment.id,
                                  selectedClass?.class_id,
                                  currentPage - 1,
                                );
                              }
                            }}
                            className="h-7 px-2.5 rounded-lg border-border/60 text-xs font-medium gap-1"
                          >
                            <ChevronLeft className="size-3.5" /> Prev
                          </Button>
                          <span className="px-1.5 font-mono text-xs font-medium text-foreground">
                            Page {currentPage} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!hasMore || currentPage >= Math.ceil(total / PAGE_SIZE) || loading}
                            onClick={() => {
                              if (selectedAssessment) {
                                fetchQueue(
                                  selectedAssessment.id,
                                  selectedClass?.class_id,
                                  currentPage + 1,
                                );
                              }
                            }}
                            className="h-7 px-2.5 rounded-lg border-border/60 text-xs font-medium gap-1"
                          >
                            Next <ChevronRight className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* VIEW TAB 2: UNIFIED RELEASE QUEUE */}
              {activeStepDView === "release" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {/* Release Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border border-border/50 bg-card/30 rounded-2xl backdrop-blur-xs">
                    <div className="flex items-center gap-2">
                      <Unlock className="size-4 text-emerald-500" />
                      <span className="text-xs font-medium text-foreground">
                        {releaseQueueClassFullyGraded
                          ? "All submissions in this section are fully graded and ready for release."
                          : "Grading is currently in progress for some students in this section."}
                      </span>
                    </div>
                    {releasableResults.length > 0 && (
                      <Button
                        size="sm"
                        disabled={isReleasing}
                        onClick={requestReleaseClassReady}
                        className="h-8 text-xs font-medium rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs gap-1.5"
                      >
                        {isReleasing ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCheck className="size-3.5" />
                        )}
                        Publish All Ready ({releasableResults.length})
                      </Button>
                    )}
                  </div>

                  <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs">
                    <Table>
                      <TableHeader className="bg-muted/15 border-b border-border/40">
                        <TableRow className="h-10 hover:bg-transparent border-none">
                          <TableHead className="text-[11px] font-medium px-6 text-muted-foreground uppercase tracking-wider">
                            Student Name
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                            Total Score
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                            Percentage
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                            Grade
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                            Status
                          </TableHead>
                          <TableHead className="text-right text-[11px] font-medium pr-6 text-muted-foreground uppercase tracking-wider">
                            Action
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {releaseQueue.map((item) => {
                          const isReleased =
                            item.is_released || item.status === "RELEASED";
                          const isHold =
                            item.integrity_hold || item.status === "INTEGRITY_HOLD";
                          const isReady =
                            (item.can_release || item.status === "PENDING_RELEASE") &&
                            !isReleased &&
                            !isHold;

                          return (
                            <TableRow
                              key={item.student_id}
                              className="h-13 border-border/20"
                            >
                              <TableCell className="px-6 py-2.5 font-medium text-xs text-foreground">
                                {item.student_name}
                              </TableCell>
                              <TableCell className="py-2.5 text-center font-mono text-xs">
                                {item.total_score !== null &&
                                item.total_score !== undefined
                                  ? `${item.total_score} / ${selectedAssessment.total_marks}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="py-2.5 text-center font-mono text-xs">
                                {item.percentage !== null &&
                                item.percentage !== undefined
                                  ? `${item.percentage}%`
                                  : "—"}
                              </TableCell>
                              <TableCell className="py-2.5 text-center font-mono text-xs font-semibold">
                                {item.letter_grade || "—"}
                              </TableCell>
                              <TableCell className="py-2.5 text-center">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] font-medium",
                                    isReleased
                                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                      : isHold
                                      ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                      : isReady
                                      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                      : "bg-muted/50 text-muted-foreground border-border/40",
                                  )}
                                >
                                  {isReleased
                                    ? "RELEASED"
                                    : isHold
                                    ? "INTEGRITY HOLD"
                                    : isReady
                                    ? "PENDING RELEASE"
                                    : item.status?.replace(/_/g, " ") || "INCOMPLETE"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right pr-6 py-2.5">
                                {isReady && (
                                  <Button
                                    size="sm"
                                    disabled={isReleasing}
                                    onClick={async () => {
                                      if (!item.attempt_id) return;
                                      try {
                                        await resultApi.releaseResults(
                                          selectedAssessment.id,
                                          [item.attempt_id],
                                          selectedClass.class_id,
                                        );
                                        toast.success("Result published successfully");
                                        refreshClassContext();
                                      } catch {
                                        toast.error("Failed to publish result");
                                      }
                                    }}
                                    className="h-7 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                                  >
                                    Publish
                                  </Button>
                                )}
                                {isReleased && (
                                  <span className="text-xs text-emerald-600 font-medium inline-flex items-center gap-1">
                                    <CheckCircle2 className="size-3 text-emerald-500" /> Published
                                  </span>
                                )}
                                {isHold && (
                                  <span className="text-xs text-rose-500 font-medium inline-flex items-center gap-1">
                                    <ShieldAlert className="size-3 text-rose-500" /> Hold Active
                                  </span>
                                )}
                                {!isReady && !isReleased && !isHold && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {item.graded_question_count !== undefined &&
                                    item.total_question_count !== undefined
                                      ? `${item.graded_question_count}/${item.total_question_count} Graded`
                                      : "—"}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {releaseQueue.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="h-36 text-center text-xs text-muted-foreground font-normal"
                            >
                              No results found for this section.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── UNIVERSAL GLOBAL MODALS (ACCESSIBLE FROM ALL PATHS) ───────────────── */}

      {/* Keyboard Shortcuts Modal */}
      <Dialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog}>
        <DialogContent className="max-w-lg bg-background border border-border/60 rounded-2xl shadow-2xl p-6 text-left col-span-full font-sans">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Keyboard className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  SpeedGrader Keyboard Shortcuts
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-normal">
                  High-throughput keyboard shortcuts for rapid essay evaluation and navigation.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            {/* Category 1: Evaluation Actions */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-primary" /> Evaluation &
                Grading
              </h4>
              <div className="rounded-xl border border-border/50 divide-y divide-border/30 bg-muted/5 overflow-hidden">
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Finalize Grade & Auto-Advance
                  </span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      ⌘ / Ctrl
                    </kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      Enter
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Save Draft (Autosave active)
                  </span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      ⌘ / Ctrl
                    </kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      S
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Accept AI Suggestion
                  </span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      Alt
                    </kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      A
                    </kbd>
                  </div>
                </div>
              </div>
            </div>

            {/* Category 2: Navigation & Panels */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ChevronRight className="size-3.5 text-primary" /> Navigation &
                Panels
              </h4>
              <div className="rounded-xl border border-border/50 divide-y divide-border/30 bg-muted/5 overflow-hidden">
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Next Question
                  </span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      Alt
                    </kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      →
                    </kbd>
                    <span className="text-muted-foreground text-[10px]">
                      or
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      Alt + N
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Previous Question
                  </span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      Alt
                    </kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      ←
                    </kbd>
                    <span className="text-muted-foreground text-[10px]">
                      or
                    </span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                      Alt + P
                    </kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Jump to Next Ungraded Question
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                    Alt + U
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Toggle Question Sidebar
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                    Alt + [
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Toggle AI Review Sidebar
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                    Alt + ]
                  </kbd>
                </div>
              </div>
            </div>

            {/* Category 3: Workspace & Integrity */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldAlert className="size-3.5 text-primary" /> Workspace &
                Flags
              </h4>
              <div className="rounded-xl border border-border/50 divide-y divide-border/30 bg-muted/5 overflow-hidden">
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Toggle Manual Flag
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                    Alt + F
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Close Workspace / Dismiss Modal
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                    Esc
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5 px-3">
                  <span className="font-medium text-foreground">
                    Show / Hide Shortcuts Guide
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px] font-medium">
                    ?
                  </kbd>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 flex justify-end border-t border-border/30 pt-3">
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowShortcutsDialog(false)}
              className="text-xs rounded-xl h-8 font-medium"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Accept AI Suggestions Dialog */}
      <Dialog open={showBulkAiDialog} onOpenChange={setShowBulkAiDialog}>
        <DialogContent className="max-w-md bg-background border border-border/60 rounded-2xl shadow-2xl p-6 text-left col-span-full font-sans">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  Batch Accept AI Suggestions
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-normal">
                  Automatically finalize AI-generated grades across{" "}
                  {selectedAttemptIds.length} selected student attempt(s).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 my-3 text-xs">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Minimum AI Confidence Threshold
              </Label>
              <Select
                value={bulkAiConfidenceThreshold.toString()}
                onValueChange={(val) =>
                  setBulkAiConfidenceThreshold(parseInt(val))
                }
              >
                <SelectTrigger className="h-9 text-xs rounded-lg font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">High Confidence Only (≥ 90%)</SelectItem>
                  <SelectItem value="80">
                    Medium-High Confidence (≥ 80%)
                  </SelectItem>
                  <SelectItem value="70">
                    Moderate Confidence (≥ 70%)
                  </SelectItem>
                  <SelectItem value="0">
                    All Available Suggestions (Any Confidence)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground italic leading-relaxed font-normal">
                Only questions meeting or exceeding this threshold will be finalized.
                Unmatched questions remain open for manual lecturer review.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4 flex justify-end gap-2 border-t border-border/30 pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={isBulkApplyingAi}
              onClick={() => setShowBulkAiDialog(false)}
              className="text-xs rounded-xl h-8 font-medium"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={isBulkApplyingAi}
              onClick={() =>
                handleBulkAcceptAiSuggestions(bulkAiConfidenceThreshold)
              }
              className="text-xs rounded-xl h-8 font-medium bg-primary text-primary-foreground flex items-center gap-1.5"
            >
              {isBulkApplyingAi ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCheck className="size-3.5" />
              )}
              Confirm & Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lift Integrity Hold Dialog */}
      <Dialog
        open={showIntegrityLiftDialog}
        onOpenChange={setShowIntegrityLiftDialog}
      >
        <DialogContent className="max-w-md bg-background border border-border/60 rounded-2xl shadow-2xl p-6 text-left col-span-full font-sans">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Unlock className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  Lift Security Hold
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-normal">
                  Lifting this hold will re-enable grade release for this student attempt.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <p className="text-xs text-muted-foreground my-2 font-normal leading-relaxed">
            Are you sure you want to lift the integrity hold on this submission?
            The student&apos;s score will become eligible for immediate publishing.
          </p>

          <DialogFooter className="mt-4 flex justify-end gap-2 border-t border-border/30 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowIntegrityLiftDialog(false)}
              className="text-xs rounded-xl h-8 font-medium"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleLiftIntegrityHold}
              disabled={isSaving}
              className="text-xs rounded-xl h-8 font-medium bg-primary text-primary-foreground"
            >
              Confirm Lift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog before Bulk Release */}
      <Dialog open={bulkReleaseDialogOpen} onOpenChange={setBulkReleaseDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Unlock className="size-5 text-emerald-600" />
              Confirm Official Marks Release
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              {bulkReleaseAction?.type === "class_ready" ? (
                <>
                  You are about to release official assessment marks for{" "}
                  <strong className="text-foreground">{bulkReleaseAction.count} ready student(s)</strong> in{" "}
                  <strong className="text-foreground">{bulkReleaseAction.className || "this class section"}</strong>.
                  Students will immediately be able to view their final scores, breakdowns, and diagnostic feedback.
                </>
              ) : (
                <>
                  You are about to release official assessment marks for{" "}
                  <strong className="text-foreground">{bulkReleaseAction?.count || selectedAttemptIds.length} selected student(s)</strong>.
                  Students will immediately be able to view their final scores, breakdowns, and diagnostic feedback.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Institutional Assessment Guard</p>
              <p className="text-[11px] leading-normal text-muted-foreground">
                Submissions with active integrity holds will remain safeguarded and unreleased. Incomplete submissions will be safely skipped.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={isReleasing}
              onClick={() => {
                setBulkReleaseDialogOpen(false);
                setBulkReleaseAction(null);
              }}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isReleasing}
              onClick={executeBulkRelease}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
            >
              {isReleasing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Confirm & Release Marks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function LecturerGradingQueue() {
  return (
    <React.Suspense
      fallback={
        <div className="p-8 space-y-6 font-sans">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-7 w-64 rounded-xl" />
              <Skeleton className="h-4 w-96 rounded-xl" />
            </div>
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
          <div className="h-96 rounded-xl border border-border/40 p-4 space-y-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      }
    >
      <LecturerGradingQueueContent />
    </React.Suspense>
  );
}
