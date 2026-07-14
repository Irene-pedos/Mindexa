// app/lecturer/grading/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

import {
  Search,
  BrainCircuit,
  Users,
  RefreshCcw,
  Clock,
  ChevronRight,
  ChevronLeft,
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
} from "lucide-react";

import { gradingApi } from "@/lib/api/grading";
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";
import { assessmentApi } from "@/lib/api/assessment";
import { attemptApi } from "@/lib/api/attempt";
import { submissionApi } from "@/lib/api/submission";
import { integrityApi } from "@/lib/api/integrity";
import { groupWorkApi } from "@/lib/api/group-work";
import { aiGradingApi } from "@/lib/api/ai-grading";

import { Skeleton } from "@/components/ui/interfaces-skeleton";
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
} from "./types";

// Unify magic-number fallbacks as file-level constants
const DEFAULT_QUESTION_MAX_MARKS = 10;
const DEFAULT_ASSESSMENT_TOTAL_MARKS = 100;

export function isQuestionAutoGraded(q?: {
  type: string;
  question_type?: string;
  grading_mode?: string;
}) {
  if (!q) return false;
  if (q.grading_mode) {
    return q.grading_mode.toUpperCase() === "AUTO";
  }
  const t = (q.type || q.question_type || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return [
    "mcq",
    "truefalse",
    "true_definition",
    "true_false",
    "matching",
    "fillblank",
    "fillblanks",
    "ordering",
  ].includes(t);
}

export function safeFormatDistanceToNow(dateInput: any) {
  if (!dateInput) return "N/A";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "N/A";
  return formatDistanceToNow(date, { addSuffix: true });
}

const CollapsibleDrawerSection = ({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/40 rounded-xl overflow-hidden bg-background">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-primary" />}
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>
      {isOpen && (
        <div className="p-3 border-t border-border/40 bg-muted/5 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
};

const DrawerIconButton = ({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-2 rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-1 w-10 h-10 hover:bg-muted/50 relative group",
        active
          ? "bg-primary/10 text-primary border border-primary/20"
          : "text-muted-foreground",
      )}
      title={label}
    >
      <Icon className="size-4" />
      <span className="absolute right-12 scale-0 group-hover:scale-100 transition-all duration-150 origin-right bg-popover text-popover-foreground border shadow-md text-[10px] font-bold py-1 px-2 rounded-lg z-50 whitespace-nowrap">
        {label}
      </span>
    </button>
  );
};

export default function LecturerGradingQueue() {
  const [data, setData] = useState<GradingQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [questionType, setQuestionType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date_asc");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);

  // Metadata
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);

  // Hierarchy Navigation State
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<WorkspaceListItem | null>(null);
  const [selectedAssessment, setSelectedAssessment] =
    useState<AssessmentSummary | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassStatRecord | null>(
    null,
  );
  const [classStats, setClassStats] = useState<ClassStatRecord[]>([]);

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
  const [rubricScores, setRubricScores] = useState<RubricScore[]>([]);
  const [reviewStartedAt, setReviewStartedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isGroupEditing, setIsGroupEditing] = useState(false);
  const [reviewTab, setReviewTab] = useState<
    "question" | "integrity" | "reassessment" | "audit"
  >("question");
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

  // Fetch initial metadata
  const fetchMetadata = async () => {
    try {
      const [asmtRes, wsRes] = await Promise.all([
        assessmentApi.getAssessments({ status: "PUBLISHED" }),
        lecturerApi.getWorkspaces(),
      ]);
      setAssessments(asmtRes.items || []);
      setWorkspaces(wsRes || []);
    } catch (error: unknown) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  // Fetch individual student submissions queue
  const fetchSubmissions = useCallback(async () => {
    if (!selectedAssessment || !selectedClass) return;
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> = {
        page_size: PAGE_SIZE,
        page: currentPage,
        sort_by: sortBy,
        assessment_id: selectedAssessment.id,
        class_section_id: selectedClass.class_id,
      };
      if (questionType !== "all") params.question_type = questionType;
      if (status !== "all") params.status = status;
      if (debouncedSearch) params.q = debouncedSearch;

      const response = await gradingApi.getGradingQueue(params);
      setData(response.items || []);
      setTotal(response.total || 0);
      setHasMore((response.items?.length ?? 0) === PAGE_SIZE);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Queue trace failure",
      );
    } finally {
      setLoading(false);
    }
  }, [
    selectedAssessment,
    selectedClass,
    questionType,
    status,
    sortBy,
    debouncedSearch,
    currentPage,
  ]);

  useEffect(() => {
    if (
      selectedAssessment &&
      !selectedAssessment.is_group_assessment &&
      selectedClass
    ) {
      fetchSubmissions();
    }
  }, [selectedAssessment, selectedClass, fetchSubmissions, currentPage]);

  // Fetch group grading queue
  const fetchGroupQueue = useCallback(async (asmtId: string) => {
    setGroupQueueLoading(true);
    try {
      const res = await gradingApi.getGroupGradingQueue({
        assessment_id: asmtId,
      });
      setGroupQueue(res.items || []);
    } catch (error: unknown) {
      console.error("Failed to fetch group queue", error);
      toast.error("Failed to load group grading queue");
    } finally {
      setGroupQueueLoading(false);
    }
  }, []);

  // Fetch class details list
  const fetchClassStats = async (asmtId: string) => {
    setLoading(true);
    try {
      const res = await gradingApi.getAssessmentClassStats(asmtId);
      setClassStats(res.classes || []);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to fetch class stats",
      );
    } finally {
      setLoading(false);
    }
  };

  // Open individual submission
  const handleOpenReview = async (item: GradingQueueItem) => {
    setLoading(true);
    try {
      const attemptRes = await attemptApi.getAttempt(item.attempt_id);
      const subRes = await submissionApi.getSubmissionsForAttempt(
        item.attempt_id,
      );

      setActiveAttempt(attemptRes);
      setActiveSubmissions(subRes.submissions || []);
      setSelectedStudent(item);

      // Find question index matching queue item (Issue 23: warn if missing mismatch)
      const idx = attemptRes.questions?.findIndex(
        (q: any) => q.id === item.question_id,
      );
      if (idx !== undefined && idx < 0) {
        toast.warning(
          "The selected question was not found in this attempt's active structure. Falling back to the first question.",
        );
        setActiveQuestionIndex(0);
      } else {
        setActiveQuestionIndex(idx >= 0 ? idx : 0);
      }

      setAllowReassessment(false);
      setReviewStartedAt(new Date());
    } catch (error: unknown) {
      toast.error("Failed to retrieve attempt submissions");
    } finally {
      setLoading(false);
    }
  };

  // Open group submission
  const openGroupSubmission = async (submissionId: string) => {
    setLoadingGroupWorkspace(true);
    try {
      const res = await groupWorkApi.getSubmissionWorkspace(submissionId);
      setSelectedGroupSubmission(res);
      setGroupGraderActiveQuestionIndex(0);

      // Load per-question grading data model (try localStorage first, fallback to workspace answers)
      const stored = localStorage.getItem(`group_grades_${submissionId}`);
      let scores: Record<string, string> = {};
      let feedbacks: Record<string, string> = {};

      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          scores = parsed.scores || {};
          feedbacks = parsed.feedback || {};
        } catch (e) {
          console.error("Failed to parse stored group grades", e);
        }
      }

      // Merge backend workspace answers details if not already in local storage
      res.answers?.forEach((ans: any) => {
        const ansDict = ans.answer_content || {};
        if (!scores[ans.question_id]) {
          if (ansDict.score !== undefined && ansDict.score !== null) {
            scores[ans.question_id] = ansDict.score.toString();
          } else if (
            ansDict.auto_grade_score !== undefined &&
            ansDict.auto_grade_score !== null
          ) {
            scores[ans.question_id] = ansDict.auto_grade_score.toString();
          } else if (
            ansDict.ai_suggested_score !== undefined &&
            ansDict.ai_suggested_score !== null
          ) {
            scores[ans.question_id] = ansDict.ai_suggested_score.toString();
          }
        }
        if (!feedbacks[ans.question_id] && ansDict.feedback) {
          feedbacks[ans.question_id] = ansDict.feedback;
        }
      });

      setGroupQuestionScores(scores);
      setGroupQuestionFeedback(feedbacks);

      const firstQ = res.questions?.[0];
      if (firstQ) {
        setGroupScore(scores[firstQ.id] || "");
        setGroupFeedback(feedbacks[firstQ.id] || "");
      } else {
        setGroupScore("");
        setGroupFeedback("");
      }

      // Member overrides
      const overrides: Record<string, string> = {};
      const hasOverrides =
        res.member_overrides && Object.keys(res.member_overrides).length > 0;
      setIsOverrideEnabled(hasOverrides);
      if (hasOverrides) {
        Object.entries(res.member_overrides).forEach(([k, v]: any) => {
          overrides[k] = v.toString();
        });
      }
      setMemberScoreOverrides(overrides);
    } catch (error: unknown) {
      toast.error("Failed to load group workspace");
    } finally {
      setLoadingGroupWorkspace(false);
    }
  };

  const handleSelectQuestion = (idx: number) => {
    setActiveQuestionIndex(idx);
    setOverrideScore("");
    setFinalFeedback("");
    setRubricScores([]);
    setReviewStartedAt(new Date());
    setIsEditing(false);
  };

  const activeQuestionId = activeAttempt?.questions?.[activeQuestionIndex]?.id;
  const activeSubmission = activeSubmissions.find(
    (s) => s.question_id === activeQuestionId,
  );

  // Load audit logs
  const fetchResponseLogs = async (responseId: string) => {
    setAuditLoading(true);
    try {
      const logs = await submissionApi.getSubmissionLogs(responseId);
      setAuditLogs(logs || []);
    } catch (error: unknown) {
      console.error("Failed to fetch audit logs", error);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubmission) {
      setOverrideScore(
        activeSubmission.override_score !== null &&
          activeSubmission.override_score !== undefined
          ? activeSubmission.override_score.toString()
          : activeSubmission.score !== null &&
              activeSubmission.score !== undefined
            ? activeSubmission.score.toString()
            : "",
      );
      setFinalFeedback(activeSubmission.feedback || "");
    } else {
      setOverrideScore("");
      setFinalFeedback("");
    }
    setIsEditing(false);
    if (activeSubmission?.id) {
      fetchResponseLogs(activeSubmission.id);
    }
  }, [activeSubmission]);

  // Save manual / accept AI grade for individual student
  const submitGrade = async (
    isFinal: boolean,
    acceptAi: boolean,
    overrideScoreVal?: number,
    overrideFeedbackVal?: string,
  ) => {
    if (!selectedStudent || !activeAttempt || !activeSubmission) return;
    const scoreText =
      overrideScoreVal !== undefined
        ? overrideScoreVal.toString()
        : overrideScore;

    // Boundary safety rail: Apply score bounds check [0, maxMarks] to both manual and AI-accepted scores
    const parsedScore = parseFloat(scoreText);
    if (Number.isFinite(parsedScore)) {
      const maxMarks =
        activeAttempt.questions?.[activeQuestionIndex]?.marks ||
        DEFAULT_QUESTION_MAX_MARKS;
      if (parsedScore < 0 || parsedScore > maxMarks) {
        toast.error(`Score must be between 0 and ${maxMarks} points`);
        setIsSaving(false);
        return;
      }
    } else if (isFinal && !acceptAi) {
      toast.error("Score required for finalization");
      return;
    }

    setIsSaving(true);
    try {
      const duration = reviewStartedAt
        ? Math.floor((new Date().getTime() - reviewStartedAt.getTime()) / 1000)
        : 0;
      const payload: Record<string, string | number | boolean | RubricScore[]> =
        {
          accept_ai_suggestion: acceptAi,
          is_final: isFinal,
          review_started_at: reviewStartedAt?.toISOString() || "",
          review_duration_seconds: duration,
          rubric_scores: rubricScores,
        };

      if (!acceptAi) {
        if (Number.isFinite(parsedScore)) {
          payload.override_score = parsedScore;
        }
        payload.feedback =
          overrideFeedbackVal !== undefined
            ? overrideFeedbackVal
            : finalFeedback;
      }

      await gradingApi.saveGrade(activeSubmission.id, payload);
      toast.success(
        isFinal
          ? "Grade finalized successfully"
          : "Draft grade saved successfully",
      );

      // Reload attempt submissions
      const subRes = await submissionApi.getSubmissionsForAttempt(
        activeAttempt.id,
      );
      setActiveSubmissions(subRes.submissions || []);

      if (isFinal) {
        // Auto-navigate to next pending manual question
        const nextPendingIdx = activeAttempt.questions.findIndex((q: any, idx: number) => {
          if (idx <= activeQuestionIndex) return false;
          if (isQuestionAutoGraded(q)) return false;
          const sub = subRes.submissions?.find((s: any) => s.question_id === q.id);
          return !sub || !sub.is_final;
        });

        if (nextPendingIdx >= 0) {
          handleSelectQuestion(nextPendingIdx);
        } else {
          setActiveAttempt(null);
          setSelectedStudent(null);
          fetchSubmissions();
        }
      }
    } catch (error: unknown) {
      toast.error("Failed to save grade");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndNextIndividual = async () => {
    await submitGrade(true, false);
  };

  // Reassessment rejection modal triggers
  const triggerRejectIndividual = () => {
    setRejectType("individual");
    setRejectReason("");
    setRejectWindowDays(reassessmentWindow);
    setRejectDialogOpen(true);
  };

  const triggerRejectSubmission = () => {
    setRejectType("group");
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  // Confirmed Reassessment logic execution
  const confirmRejectIndividual = async () => {
    if (!activeAttempt) return;
    setIsSaving(true);
    setRejectDialogOpen(false);
    try {
      await attemptApi.grantReassessment(activeAttempt.id, {
        window_days: parseInt(rejectWindowDays),
        reason: rejectReason,
      });
      toast.success(
        "Submission rejected. Reassessment window has been opened.",
      );
      setActiveAttempt(null);
      setSelectedStudent(null);
      fetchSubmissions();
    } catch (err) {
      toast.error("Failed to trigger reassessment");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmRejectSubmission = async () => {
    if (!selectedGroupSubmission || !selectedAssessment) return;
    setGradingGroup(true);
    setRejectDialogOpen(false);
    try {
      await groupWorkApi.assignReassessment(
        selectedAssessment.id,
        selectedGroupSubmission.submission_id,
      );
      toast.success("Group submission rejected. Re-grading queue updated.");

      const currentIndex = groupQueue.findIndex(
        (item) => item.id === selectedGroupSubmission.submission_id,
      );
      setSelectedGroupSubmission(null);
      if (currentIndex >= 0 && currentIndex < groupQueue.length - 1) {
        openGroupSubmission(groupQueue[currentIndex + 1].id);
      } else {
        fetchGroupQueue(selectedAssessment.id);
      }
    } catch (error: unknown) {
      toast.error("Failed to reject and reopen group workspace");
    } finally {
      setGradingGroup(false);
    }
  };

  // Save manual / accept AI grade for Group Work (accumulates question-level scores/feedback)
  const submitGroupGrade = async (
    isFinal: boolean,
    overrideScoreVal?: number,
    overrideFeedbackVal?: string,
  ) => {
    if (!selectedGroupSubmission || !selectedAssessment) return;

    // 1. Commit active question inputs to state maps first
    const activeQ =
      selectedGroupSubmission.questions[groupGraderActiveQuestionIndex];
    const finalScores = { ...groupQuestionScores };
    const finalFeedbackMap = { ...groupQuestionFeedback };
    if (activeQ) {
      finalScores[activeQ.id] =
        overrideScoreVal !== undefined
          ? overrideScoreVal.toString()
          : groupScore;
      finalFeedbackMap[activeQ.id] =
        overrideFeedbackVal !== undefined ? overrideFeedbackVal : groupFeedback;
      setGroupQuestionScores(finalScores);
      setGroupQuestionFeedback(finalFeedbackMap);
    }

    // 2. Sum up overall score
    let totalScore = 0;
    let allQuestionsGraded = true;
    selectedGroupSubmission.questions.forEach((q: any) => {
      if (isQuestionAutoGraded(q)) {
        const scoreStr = finalScores[q.id];
        totalScore += scoreStr ? parseFloat(scoreStr) : 0;
      } else {
        const scoreStr = finalScores[q.id];
        if (scoreStr === undefined || scoreStr === "") {
          allQuestionsGraded = false;
        } else {
          totalScore += parseFloat(scoreStr);
        }
      }
    });

    if (isFinal && !allQuestionsGraded) {
      toast.warning(
        "Some questions have not been evaluated. Proceeding with currently saved scores.",
      );
    }

    const maxMarks =
      selectedGroupSubmission.assessment?.total_marks ||
      DEFAULT_ASSESSMENT_TOTAL_MARKS;
    if (totalScore < 0 || totalScore > maxMarks) {
      toast.error(
        `Total calculated score (${totalScore}) must be between 0 and ${maxMarks} points`,
      );
      return;
    }

    // 3. Consolidate question-level feedback comments
    const feedbackParts: string[] = [];
    selectedGroupSubmission.questions.forEach((q: any, idx: number) => {
      const fb = finalFeedbackMap[q.id];
      if (fb && fb.trim().length > 0) {
        feedbackParts.push(`Q${idx + 1}: ${fb.trim()}`);
      }
    });
    const consolidatedFeedback = feedbackParts.join("\n\n");

    const overridesPayload: Record<string, number> = {};
    if (isOverrideEnabled) {
      let isInvalid = false;
      Object.entries(memberScoreOverrides).forEach(([k, v]) => {
        const s = parseFloat(v);
        if (isNaN(s) || s < 0 || s > maxMarks) {
          toast.error(`Invalid score override value for member ${k}`);
          isInvalid = true;
        } else {
          overridesPayload[k] = s;
        }
      });
      if (isInvalid) return;
    }

    setGradingGroup(true);
    try {
      await groupWorkApi.gradeSubmission(
        selectedAssessment.id,
        selectedGroupSubmission.submission_id,
        {
          total_score: totalScore,
          max_score: maxMarks,
          feedback: consolidatedFeedback || "Grading completed.",
          member_overrides: isOverrideEnabled ? overridesPayload : undefined,
          is_final: isFinal,
        },
      );
      toast.success(
        isFinal ? "Group grade finalized!" : "Draft group grade saved.",
      );

      if (isFinal) {
        localStorage.removeItem(
          `group_grades_${selectedGroupSubmission.submission_id}`,
        );
      }

      const updatedWorkspace = await groupWorkApi.getSubmissionWorkspace(
        selectedGroupSubmission.submission_id,
      );
      setSelectedGroupSubmission(updatedWorkspace);
    } catch (error: unknown) {
      toast.error("Failed to save group grade details");
    } finally {
      setGradingGroup(false);
    }
  };

  const handleSaveAndNext = async () => {
    await submitGroupGrade(true);
    // Fetch next submission in the queue and load it
    const currentIndex = groupQueue.findIndex(
      (item) => item.id === selectedGroupSubmission.submission_id,
    );
    if (currentIndex >= 0 && currentIndex < groupQueue.length - 1) {
      const nextSubmission = groupQueue[currentIndex + 1];
      openGroupSubmission(nextSubmission.id);
    } else {
      setSelectedGroupSubmission(null);
      if (selectedAssessment) {
        fetchGroupQueue(selectedAssessment.id);
      }
    }
  };

  const handleRubricChange = (scores: RubricScore[]) => {
    setRubricScores(scores);
    const total = scores.reduce((acc, curr) => acc + curr.score, 0);
    const totalStr = total.toString();
    setOverrideScore(totalStr);
  };

  const handleGrantReassessment = async () => {
    if (!activeAttempt) return;
    try {
      await attemptApi.grantReassessment(activeAttempt.id, {
        window_days: parseInt(reassessmentWindow),
      });
      toast.success(
        "Reassessment granted. Student is authorized for a new attempt.",
      );
    } catch (error: unknown) {
      toast.error("Failed to grant reassessment");
    }
  };

  const handleLiftIntegrityHold = async () => {
    if (!activeAttempt) return;
    if (
      !confirm(
        "Are you sure you want to lift the academic integrity hold on this attempt? This action is logged.",
      )
    )
      return;
    setIsSaving(true);
    try {
      await integrityApi.liftHold(activeAttempt.id);
      toast.success(
        "Integrity hold lifted. Student result is now eligible for release.",
      );
      const updated = await attemptApi.getAttempt(activeAttempt.id);
      setActiveAttempt(updated);
    } catch (error: unknown) {
      toast.error("Failed to lift integrity hold");
    } finally {
      setIsSaving(false);
    }
  };

  // Flag toggle updates state queue list locally immediately to keep table data in sync (Issue 16)
  const handleToggleManualFlag = async () => {
    if (!selectedStudent || !activeAttempt) return;
    setIsSaving(true);
    try {
      await integrityApi.toggleFlag(
        activeAttempt.id,
        !selectedStudent.is_flagged,
      );
      toast.success(
        selectedStudent.is_flagged
          ? "Student evaluation unflagged"
          : "Student evaluation flagged",
      );
      setSelectedStudent((prev) =>
        prev ? { ...prev, is_flagged: !prev.is_flagged } : null,
      );
      setData((prev) =>
        prev.map((item) =>
          item.id === selectedStudent.id
            ? { ...item, is_flagged: !selectedStudent.is_flagged }
            : item,
        ),
      );
    } catch (error: unknown) {
      toast.error("Failed to toggle evaluation flag");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToWorkspaces = () => {
    setSelectedWorkspace(null);
    setSelectedAssessment(null);
    setSelectedClass(null);
  };

  const handleBackToAssessments = () => {
    setSelectedAssessment(null);
    setSelectedClass(null);
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
  };

  // Group grading active question change helper (stores/loads scores and feedback dynamically)
  const handleGroupQuestionSelect = (idx: number) => {
    // 1. Commit active question values to state maps & localStorage if editing
    const currentQ =
      selectedGroupSubmission.questions[groupGraderActiveQuestionIndex];
    const updatedScores = { ...groupQuestionScores };
    const updatedFeedback = { ...groupQuestionFeedback };
    if (currentQ && isGroupEditing) {
      updatedScores[currentQ.id] = groupScore;
      updatedFeedback[currentQ.id] = groupFeedback;
      setGroupQuestionScores(updatedScores);
      setGroupQuestionFeedback(updatedFeedback);
      localStorage.setItem(
        `group_grades_${selectedGroupSubmission.submission_id}`,
        JSON.stringify({ scores: updatedScores, feedback: updatedFeedback }),
      );
    }

    // 2. Select new active index
    setGroupGraderActiveQuestionIndex(idx);
    setIsGroupEditing(false);

    // 3. Load values for the new active question
    const nextQ = selectedGroupSubmission.questions[idx];
    if (nextQ) {
      setGroupScore(updatedScores[nextQ.id] || "");
      setGroupFeedback(updatedFeedback[nextQ.id] || "");
    } else {
      setGroupScore("");
      setGroupFeedback("");
    }
  };

  // Dynamic calculated scores total summary for group work decision card
  const calculatedGroupTotalScore = useMemo(() => {
    if (!selectedGroupSubmission) return 0;
    let total = 0;
    selectedGroupSubmission.questions.forEach((q: any) => {
      const scoreStr = groupQuestionScores[q.id];
      if (scoreStr) {
        total += parseFloat(scoreStr);
      }
    });
    return total;
  }, [groupQuestionScores, selectedGroupSubmission]);

  // Loading indicator overlay screen for group workspace fetch
  if (loadingGroupWorkspace) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 space-y-4 font-sans text-foreground">
        <Loader2 className="size-10 text-primary animate-spin" />
        <div className="space-y-1.5 text-center">
          <p className="text-sm font-bold text-foreground animate-pulse">
            Loading Collaborative Group Workspace...
          </p>
          <p className="text-xs text-muted-foreground font-medium">
            Assembling member participation metrics and answers log.
          </p>
        </div>
      </div>
    );
  }

  // ─── RENDERING PATH 2: INDIVIDUAL SPEEDGRADER ─────────────────────────────
  if (activeAttempt) {
    const currentQuestion = activeAttempt.questions?.[activeQuestionIndex];
    const currentSubmission = activeSubmissions.find(
      (s) => s.question_id === currentQuestion?.id,
    );
    const isAutoGraded = isQuestionAutoGraded(currentQuestion);
    const maxMarks = currentQuestion?.marks || DEFAULT_QUESTION_MAX_MARKS;

    return (
      <div className="min-h-screen bg-background flex flex-col font-sans text-foreground animate-in fade-in duration-300">
        {/* SpeedGrader Header */}
        <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveAttempt(null);
                setSelectedStudent(null);
                fetchSubmissions();
              }}
              className="h-9 px-3 border border-border/60 rounded-xl hover:bg-muted/50 transition-colors"
            >
              <X className="size-4 mr-1.5" /> Close Workspace
            </Button>
            <div className="h-5 w-px bg-border/40" />
            <div>
              <h1 className="text-sm font-bold text-foreground leading-none">
                Grading Workspace: {selectedStudent?.student_name}
              </h1>
              <p className="text-xs text-muted-foreground mt-1 font-medium">
                {selectedStudent?.assessment_title} • Attempt #
                {activeAttempt.attempt_number}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 bg-muted/20 border border-border/50 rounded-xl p-1 px-3 h-9 text-xs font-semibold">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="size-3.5" /> Spent:{" "}
                {activeAttempt.time_taken_seconds
                  ? `${Math.floor(activeAttempt.time_taken_seconds / 60)}m ${activeAttempt.time_taken_seconds % 60}s`
                  : "N/A"}
              </span>
              <div className="h-4 w-px bg-border/20" />
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    activeAttempt.integrity_risk_score > 70
                      ? "bg-red-500"
                      : activeAttempt.integrity_risk_score > 30
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                  )}
                />
                <span className="text-foreground/80">
                  Integrity Risk: {activeAttempt.integrity_risk_score || 0}%
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs font-semibold border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 rounded-lg shadow-sm"
              onClick={async () => {
                const openQs = activeAttempt.questions.filter(
                  (q: AttemptQuestion) => !isQuestionAutoGraded(q),
                );
                const ungraded = openQs.filter((q: AttemptQuestion) => {
                  const sub = activeSubmissions.find(
                    (s: SubmissionRecord) => s.question_id === q.id,
                  );
                  return !sub || !sub.is_final;
                });
                if (ungraded.length > 0) {
                  toast.error(
                    `Cannot finalize. ${ungraded.length} manually graded questions are not finalized yet.`,
                  );
                } else {
                  toast.success("All validations passed! Ready for release.");
                }
              }}
            >
              Verify Marks
            </Button>
          </div>
        </div>

        {/* Sub-Header / Top Navigation bar */}
        <div className="border-b bg-background/50 backdrop-blur-sm">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold rounded-lg bg-background"
                onClick={() => setIsQuestionNavOpen(!isQuestionNavOpen)}
              >
                <Menu className="size-3.5 mr-1.5" /> Questions
              </Button>
              <span className="text-xs font-medium text-muted-foreground">
                Question {activeQuestionIndex + 1} of{" "}
                {activeAttempt.questions?.length || 0} • {maxMarks} pts max
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setReviewMode(
                    reviewMode === "focus" ? "detailed" : "focus",
                  )
                }
                className="h-8 text-xs font-semibold hover:bg-muted/50 rounded-lg text-primary flex items-center gap-1.5"
              >
                <Eye className="size-3.5" />{" "}
                {reviewMode === "detailed"
                  ? "Standard View"
                  : "Detailed Context"}
              </Button>
            </div>
          </div>

          {isQuestionNavOpen && (
            <div className="px-6 py-4 bg-background border-t border-border/10 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 animate-in slide-in-from-top duration-200">
              {activeAttempt.questions?.map(
                (q: AttemptQuestion, idx: number) => {
                  const sub = activeSubmissions.find(
                    (s) => s.question_id === q.id,
                  );
                  const isAuto = isQuestionAutoGraded(q);
                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        handleSelectQuestion(idx);
                        setIsQuestionNavOpen(false);
                      }}
                      className={cn(
                        "p-2.5 rounded-lg border text-left text-xs transition-all relative group",
                        activeQuestionIndex === idx
                          ? "border-primary bg-primary/[0.02] text-primary font-bold shadow-sm"
                          : "border-border/60 bg-background text-foreground hover:bg-muted/10",
                      )}
                    >
                      <div className="font-bold mb-0.5">Q{idx + 1}</div>
                      <div className="text-[10px] text-muted-foreground/80 truncate">
                        {q.marks || 0} pts
                      </div>
                      {isAuto && (
                        <span
                          className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-500"
                          title="Auto-Graded"
                        />
                      )}
                      {!isAuto && sub?.is_final && (
                        <span
                          className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-500"
                          title="Finalized"
                        />
                      )}
                      {!isAuto && sub && !sub.is_final && (
                        <span
                          className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-indigo-500"
                          title="Reviewed"
                        />
                      )}
                    </button>
                  );
                },
              )}
            </div>
          )}
        </div>

        {/* Bento Grid workspace */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 bg-background/50">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start max-w-7xl mx-auto">
              {/* Left Side (2 cols) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Bento Item 1: Prompt */}
                <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-sm space-y-3 transition-all duration-300 hover:shadow-md hover:border-border">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                        Question Prompt
                      </span>
                      {isAutoGraded && (
                        <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[9px] font-bold uppercase py-0.5 px-1.5 flex items-center gap-1">
                          <Award className="size-3" /> System Auto-Graded
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold">
                      Q{activeQuestionIndex + 1} Prompt
                    </Badge>
                  </div>
                  <div className="text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap font-medium">
                    {currentQuestion?.text || currentQuestion?.content}
                  </div>
                </div>

                {/* Bento Item 2: Answer */}
                <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-sm space-y-3 transition-all duration-300 hover:shadow-md hover:border-border">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                      Student Answer
                    </span>
                    {currentSubmission?.answer_type === "FILE" &&
                      currentSubmission?.file_url && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] font-bold flex items-center gap-1"
                        >
                          <FileText className="size-3" /> File Attachment
                        </Badge>
                      )}
                  </div>
                  {currentSubmission?.answer_type === "FILE" &&
                    currentSubmission?.file_url && (
                      <div className="p-4 rounded-xl border border-primary/10 bg-primary/[0.02] flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="size-5 text-primary shrink-0" />
                          <div className="min-w-0 font-medium">
                            <p className="text-xs font-semibold text-foreground truncate max-w-[200px] md:max-w-xs">
                              {currentSubmission.file_url.split("/").pop() ||
                                "deliverable_file"}
                            </p>
                            <a
                              href={currentSubmission.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-semibold text-primary hover:underline"
                            >
                              Download Deliverable File
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  <div className="text-xs sm:text-sm font-mono leading-relaxed whitespace-pre-wrap text-foreground/90 max-h-[400px] overflow-y-auto bg-muted/10 p-3.5 rounded-xl border border-border/40 font-medium">
                    {currentSubmission?.answer_text || (
                      <span className="italic text-muted-foreground/60 font-sans font-medium">
                        No response recorded for this question node.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side (1 col) */}
              <div className="lg:col-span-1 space-y-6">
                {/* Bento Item 3: AI Review Assistant */}
                {!isAutoGraded && currentSubmission && (
                  <div className="space-y-4">
                    <AIReviewPanel
                      queueItemId={selectedStudent?.id}
                      responseId={currentSubmission.id}
                      maxScore={maxMarks}
                      onSuggestionApplied={(score) => {
                        setOverrideScore(score.toString());
                        setIsEditing(true);
                      }}
                    />

                    <AIFeedbackEditor
                      responseId={currentSubmission.id}
                      initialDraft={
                        currentSubmission.ai_feedback_draft || undefined
                      }
                      onDraftApplied={(text) => {
                        setFinalFeedback(text);
                        setIsEditing(true);
                      }}
                    />
                  </div>
                )}

                {/* Bento Item 4: Lecturer Decision (Compact Auto-Graded card or Decision Panel) */}
                {isAutoGraded ? (
                  <div className="border border-border/50 bg-muted/10 rounded-2xl p-5 shadow-sm space-y-3 transition-all duration-300">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                      <CheckCircle2 className="size-4 text-emerald-500" />{" "}
                      Auto-Graded Question
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                      This question is automatically scored by the system based
                      on predefined deterministic rules. No AI evaluation or
                      manual grading actions are required.
                    </p>
                    <div className="p-3 bg-background border rounded-xl flex justify-between items-center text-xs font-medium">
                      <span className="font-semibold text-muted-foreground">
                        Recorded Score
                      </span>
                      <span className="font-mono font-bold text-emerald-600">
                        {currentSubmission?.score !== null &&
                        currentSubmission?.score !== undefined
                          ? `${currentSubmission.score} / ${maxMarks} pts`
                          : `Pending / ${maxMarks} pts`}
                      </span>
                    </div>
                  </div>
                ) : currentSubmission ? (
                  <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300 hover:shadow-md hover:border-border">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                        Lecturer Decision
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="individual-score-input"
                          className="text-xs font-semibold text-muted-foreground"
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
                          onChange={(e) => setOverrideScore(e.target.value)}
                          className="h-9 text-xs rounded-lg font-mono font-bold w-full bg-background"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="individual-feedback-input"
                          className="text-xs font-semibold text-muted-foreground"
                        >
                          Feedback Comments
                        </Label>
                        <Textarea
                          id="individual-feedback-input"
                          placeholder="Provide feedback comments..."
                          value={finalFeedback}
                          disabled={!isEditing}
                          onChange={(e) => setFinalFeedback(e.target.value)}
                          className="min-h-[80px] text-xs rounded-lg w-full font-medium bg-background"
                        />
                      </div>

                      <div className="border-t border-border/30 pt-4 flex flex-col gap-3">
                        {!isEditing ? (
                          <div className="space-y-2">
                            {currentSubmission.ai_suggested_score !== null &&
                            currentSubmission.ai_suggested_score !==
                              undefined ? (
                              <div className="flex flex-col gap-2">
                                <Button
                                  onClick={() => {
                                    const aiScore =
                                      currentSubmission.ai_suggested_score;
                                    const aiFb =
                                      currentSubmission.ai_feedback_draft || "";
                                    setOverrideScore(aiScore!.toString());
                                    setFinalFeedback(aiFb);
                                    setIsEditing(true);
                                    toast.success(
                                      "AI suggestion copied. Review the fields and finalize or modify.",
                                    );
                                  }}
                                  disabled={isSaving}
                                  className="w-full h-10 text-xs font-bold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                  <CheckCircle2 className="size-4" /> Accept AI
                                  Review
                                </Button>
                                <div className="grid grid-cols-2 gap-3">
                                  <Button
                                    variant="outline"
                                    onClick={() => setIsEditing(true)}
                                    disabled={isSaving}
                                    className="h-9 text-xs font-bold rounded-xl border-border/80 text-foreground hover:bg-muted/50"
                                  >
                                    Modify Review
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setOverrideScore("");
                                      setFinalFeedback("");
                                      setIsEditing(true);
                                    }}
                                    disabled={isSaving}
                                    className="h-9 text-xs font-bold rounded-xl border-red-500/20 text-red-600 hover:bg-red-500/5"
                                  >
                                    Reject AI Review
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                onClick={() => setIsEditing(true)}
                                disabled={isSaving}
                                className="w-full h-10 text-xs font-bold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5 shadow-sm"
                              >
                                Enter Manual Grade
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-3">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isSaving}
                                onClick={() => submitGrade(false, false)}
                                className="h-9 text-xs font-bold rounded-xl border-border/80 text-foreground hover:bg-muted/50"
                              >
                                Save Draft
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isSaving}
                                onClick={() => setIsEditing(false)}
                                className="h-9 text-xs font-bold rounded-xl border-border/80 text-foreground hover:bg-muted/50"
                              >
                                Cancel
                              </Button>
                            </div>
                            <Button
                              onClick={() => submitGrade(true, false)}
                              disabled={isSaving}
                              className="w-full h-10 text-xs font-bold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5 shadow-sm"
                            >
                              {isSaving ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="size-4" />
                              )}
                              Finalize Grade
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Individual Context Drawers */}
          {reviewMode === "detailed" && (
            <div className="w-80 border-l border-border/40 bg-muted/5 p-4 space-y-4 overflow-y-auto animate-in slide-in-from-right duration-300">
              {/* Question Details / Rubric */}
              <CollapsibleDrawerSection
                title="Question & Rubric"
                icon={Scale}
                defaultOpen={true}
              >
                {currentQuestion?.rubric ? (
                  <RubricGradingPanel
                    rubric={currentQuestion.rubric}
                    currentScores={rubricScores}
                    onScoresChange={handleRubricChange}
                  />
                ) : (
                  <div className="py-4 text-center text-xs text-muted-foreground/60 italic font-medium">
                    No explicit rubric criteria configured.
                  </div>
                )}
              </CollapsibleDrawerSection>

              {/* Integrity Incidents */}
              <CollapsibleDrawerSection
                title="Integrity Review"
                icon={ShieldAlert}
                defaultOpen={false}
              >
                <div className="space-y-4">
                  {activeAttempt.status === "AUTO_SUBMITTED" && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-red-700 text-xs">
                      <AlertTriangle className="size-4.5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Forced Auto-Submission</p>
                        <p className="text-[11px] mt-0.5 leading-relaxed">
                          Assessment expired or terminated by security
                          enforcement.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 border rounded-xl bg-background space-y-0.5">
                      <div className="text-[9px] uppercase font-bold text-muted-foreground">
                        Tab Switches
                      </div>
                      <div className="text-sm font-bold text-foreground">
                        {activeAttempt.tab_switch_count || 0}
                      </div>
                    </div>
                    <div className="p-2.5 border rounded-xl bg-background space-y-0.5">
                      <div className="text-[9px] uppercase font-bold text-muted-foreground">
                        FS Exits
                      </div>
                      <div className="text-sm font-bold text-foreground">
                        {activeAttempt.fullscreen_exit_count || 0}
                      </div>
                    </div>
                    <div className="p-2.5 border rounded-xl bg-background space-y-0.5">
                      <div className="text-[9px] uppercase font-bold text-muted-foreground">
                        Copys
                      </div>
                      <div className="text-sm font-bold text-foreground">
                        {activeAttempt.copy_attempt_count || 0}
                      </div>
                    </div>
                    <div className="p-2.5 border rounded-xl bg-background space-y-0.5">
                      <div className="text-[9px] uppercase font-bold text-muted-foreground">
                        Drops
                      </div>
                      <div className="text-sm font-bold text-foreground">
                        {activeAttempt.reconnect_count || 0}
                      </div>
                    </div>
                  </div>

                  {activeAttempt.integrity_hold && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col gap-2 text-xs text-red-700">
                      <div className="flex gap-2">
                        <Lock className="size-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Integrity Hold Active</p>
                          <p className="text-[11px] mt-0.5 leading-normal">
                            {activeAttempt.integrity_hold_reason ||
                              "Placed on security hold."}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 text-[11px] border-red-500/20 bg-red-500/5 text-red-700 hover:bg-red-500/10 rounded-lg"
                        onClick={handleLiftIntegrityHold}
                        disabled={isSaving}
                      >
                        <Unlock className="size-3 mr-1.5" /> Lift Security Hold
                      </Button>
                    </div>
                  )}

                  <div className="pt-2 border-t flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground/80">
                      Manual Review Flag
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn(
                        "h-8 text-xs font-semibold rounded-lg",
                        selectedStudent?.is_flagged
                          ? "border-amber-500/20 bg-amber-500/5 text-amber-700"
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

              {/* Reassessment */}
              <CollapsibleDrawerSection
                title="Reassessment Window"
                icon={RefreshCcw}
                defaultOpen={false}
              >
                <div className="space-y-3 text-xs leading-normal">
                  <p className="text-muted-foreground text-[11px]">
                    Authorize a new timing window. Preserves all historical
                    attempts and files.
                  </p>

                  <div className="flex items-center justify-between p-2.5 bg-muted/10 border rounded-xl">
                    <span className="font-bold">Enable Reassessment</span>
                    <input
                      type="checkbox"
                      checked={allowReassessment}
                      onChange={(e) => setAllowReassessment(e.target.checked)}
                      className="size-4 text-primary accent-primary rounded border cursor-pointer"
                    />
                  </div>

                  {allowReassessment && (
                    <div className="space-y-3 p-3 border rounded-xl bg-background animate-fade-in">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold text-muted-foreground">
                          Attempts Allowed
                        </Label>
                        <Input
                          type="number"
                          value={maxAttempts}
                          onChange={(e) =>
                            setMaxAttempts(parseInt(e.target.value))
                          }
                          className="h-8 text-xs font-mono font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold text-muted-foreground">
                          Pass Mark Requirement (%)
                        </Label>
                        <Input
                          type="number"
                          value={passMark}
                          onChange={(e) =>
                            setPassMark(parseInt(e.target.value))
                          }
                          className="h-8 text-xs font-mono font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold text-muted-foreground">
                          Window Length
                        </Label>
                        <Select
                          value={reassessmentWindow}
                          onValueChange={setReassessmentWindow}
                        >
                          <SelectTrigger className="h-8 text-xs bg-background">
                            <SelectValue placeholder="Days" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3 Days</SelectItem>
                            <SelectItem value="7">7 Days</SelectItem>
                            <SelectItem value="14">14 Days</SelectItem>
                            <SelectItem value="30">30 Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={handleGrantReassessment}
                        className="w-full h-8 text-[11px] font-bold mt-1"
                      >
                        Grant Reassessment
                      </Button>
                    </div>
                  )}
                </div>
              </CollapsibleDrawerSection>

              {/* Audit Logs */}
              <CollapsibleDrawerSection
                title="Audit Trail"
                icon={History}
                defaultOpen={false}
              >
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {auditLoading ? (
                    <div className="py-4 flex justify-center">
                      <Loader2 className="size-4 animate-spin text-primary" />
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground/60 italic font-medium">
                      No actions recorded.
                    </div>
                  ) : (
                    auditLogs.map((log: AuditLog) => (
                      <div
                        key={log.id}
                        className="p-2 border rounded-xl bg-background text-[11px] space-y-1"
                      >
                        <div className="flex justify-between items-center text-[9px] font-bold uppercase">
                          <span className="text-primary">
                            {log.change_type}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(log.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {log.new_value && (
                          <div className="font-semibold text-foreground/80 leading-normal">
                            Score:{" "}
                            {log.new_value.override_score ??
                              log.new_value.score ??
                              "N/A"}{" "}
                            pts
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CollapsibleDrawerSection>
            </div>
          )}
        </div>
      </div>
    );
  }
  // ─── RENDERING PATH 1: GROUP SPEEDGRADER (BENTO GRID) ─────────────────────
  if (selectedGroupSubmission) {
    const activeQ =
      selectedGroupSubmission.questions[groupGraderActiveQuestionIndex];
    const activeAns = selectedGroupSubmission.answers?.find(
      (ans: any) => ans.question_id === activeQ?.id,
    );
    const isAutoGraded = isQuestionAutoGraded(activeQ);
    const maxMarks = activeQ?.marks || DEFAULT_QUESTION_MAX_MARKS;
    const totalAssessmentMarks =
      selectedGroupSubmission.assessment?.total_marks ||
      DEFAULT_ASSESSMENT_TOTAL_MARKS;

    // Check graded status at individual question level (Issue 12)
    const questionScore = groupQuestionScores[activeQ?.id || ""];
    const isQuestionGraded =
      questionScore !== undefined && questionScore !== "";

    return (
      <div className="min-h-screen bg-background flex flex-col font-sans text-foreground animate-in fade-in duration-300">
        {/* Sticky SpeedGrader Header */}
        <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md px-6 py-4 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            {/* Cleaner Breadcrumbs */}
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>{selectedWorkspace?.title}</span>
              <ChevronRight className="size-3" />
              <span>{selectedAssessment?.title}</span>
              <ChevronRight className="size-3" />
              <span className="text-foreground font-semibold">
                {selectedGroupSubmission.group_name}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] font-bold bg-indigo-500/5 text-indigo-600 border-indigo-500/20 flex items-center gap-1"
              >
                <Users className="size-3" /> Group Work
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <h1 className="text-sm font-bold text-foreground">
                Group Workspace: {selectedGroupSubmission.group_name}
              </h1>
              <span className="text-xs text-muted-foreground">
                ({selectedGroupSubmission.members?.length || 0} Members)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Review Mode Toggle Switch */}
            <div className="flex items-center bg-muted/30 border border-border/40 p-0.5 rounded-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReviewMode("focus")}
                className={cn(
                  "h-7 px-3 text-[10px] font-bold uppercase rounded-md transition-all duration-200",
                  reviewMode === "focus"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                Focus Mode
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReviewMode("detailed")}
                className={cn(
                  "h-7 px-3 text-[10px] font-bold uppercase rounded-md transition-all duration-200",
                  reviewMode === "detailed"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                Detailed Mode
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedGroupSubmission(null)}
              className="h-9 px-3 border border-border/60 rounded-xl hover:bg-muted/50 transition-colors text-xs font-semibold"
            >
              <X className="size-4 mr-1.5" /> Close Workspace
            </Button>
          </div>
        </div>

        {/* Collapsible Question Navigation */}
        <div className="border-b bg-muted/5 border-border/20">
          <div className="px-6 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsQuestionNavOpen(!isQuestionNavOpen)}
                className="h-8 text-xs font-semibold rounded-lg border-border/40 bg-background"
              >
                <Menu className="size-3.5 mr-1.5" /> Questions
              </Button>
              <span className="text-xs font-medium text-muted-foreground">
                Question {groupGraderActiveQuestionIndex + 1} of{" "}
                {selectedGroupSubmission.questions.length} • {maxMarks} pts max
              </span>
            </div>
            {isQuestionGraded && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[9px] font-bold border flex items-center gap-1",
                  selectedGroupSubmission.status === "GRADED"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 animate-none"
                    : "bg-primary/5 text-primary border-primary/20",
                )}
              >
                <CheckCircle2 className="size-3" />{" "}
                {selectedGroupSubmission.status === "GRADED"
                  ? "Graded"
                  : "Reviewed"}
              </Badge>
            )}
          </div>

          {isQuestionNavOpen && (
            <div className="px-6 py-4 bg-background border-t border-border/10 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {selectedGroupSubmission.questions.map((q: any, idx: number) => {
                const hasAns = selectedGroupSubmission.answers?.some(
                  (a: any) => a.question_id === q.id,
                );
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      handleGroupQuestionSelect(idx);
                      setIsQuestionNavOpen(false);
                    }}
                    className={cn(
                      "p-2.5 rounded-lg border text-left text-xs transition-all relative group",
                      groupGraderActiveQuestionIndex === idx
                        ? "border-primary bg-primary/[0.02] text-primary"
                        : "border-border/60 bg-background text-foreground hover:bg-muted/10",
                    )}
                  >
                    <div className="font-bold mb-0.5">Q{idx + 1}</div>
                    <div className="text-[10px] text-muted-foreground/80 truncate">
                      {q.marks || 0} pts
                    </div>
                    {hasAns && (
                      <span
                        className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-500"
                        title="Submitted"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bento Grid layout */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 bg-background/50">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start max-w-7xl mx-auto">
              {/* Left Side (2 cols) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Bento Item 1: Prompt */}
                <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-sm space-y-3 transition-all duration-300 hover:shadow-md hover:border-border">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                        Question Prompt
                      </span>
                      {isAutoGraded && (
                        <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[9px] font-bold uppercase py-0.5 px-1.5 flex items-center gap-1">
                          <Award className="size-3" /> System Auto-Graded
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold">
                      Q{groupGraderActiveQuestionIndex + 1} Prompt
                    </Badge>
                  </div>
                  <div className="text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                    {activeQ?.text || activeQ?.content}
                  </div>
                </div>

                {/* Bento Item 2: Answer */}
                <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-sm space-y-3 transition-all duration-300 hover:shadow-md hover:border-border">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                      Collaborative Answer
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm font-mono leading-relaxed whitespace-pre-wrap text-foreground/90 max-h-[400px] overflow-y-auto bg-muted/10 p-3.5 rounded-xl border border-border/40">
                    {activeAns?.answer_text || (
                      <span className="italic text-muted-foreground/60 font-sans">
                        No collaborative response recorded for this question
                        node.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side (1 col) */}
              <div className="lg:col-span-1 space-y-6">
                {/* Bento Item 3: AI Review Assistant */}
                {activeAns?.id && (
                  <AIReviewPanel
                    responseId={activeAns.id}
                    maxScore={maxMarks}
                    onSuggestionApplied={(score) => {
                      setGroupScore(score.toString());
                      if (activeQ) {
                        const updated = {
                          ...groupQuestionScores,
                          [activeQ.id]: score.toString(),
                        };
                        setGroupQuestionScores(updated);
                        localStorage.setItem(
                          `group_grades_${selectedGroupSubmission.submission_id}`,
                          JSON.stringify({
                            scores: updated,
                            feedback: groupQuestionFeedback,
                          }),
                        );
                      }
                    }}
                  />
                )}

                {/* Bento Item 3.5: Rubric Support for Group Grading (Issue 15) */}
                {activeQ?.rubric && (
                  <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-sm space-y-3 transition-all duration-300 hover:shadow-md hover:border-border">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                        Rubric Alignment
                      </span>
                    </div>
                    <RubricGradingPanel
                      rubric={activeQ.rubric}
                      currentScores={rubricScores}
                      onScoresChange={(scores) => {
                        setRubricScores(scores);
                        const total = scores.reduce(
                          (acc, curr) => acc + curr.score,
                          0,
                        );
                        const totalStr = total.toString();
                        setGroupScore(totalStr);
                        if (activeQ) {
                          const updated = {
                            ...groupQuestionScores,
                            [activeQ.id]: totalStr,
                          };
                          setGroupQuestionScores(updated);
                          localStorage.setItem(
                            `group_grades_${selectedGroupSubmission.submission_id}`,
                            JSON.stringify({
                              scores: updated,
                              feedback: groupQuestionFeedback,
                            }),
                          );
                        }
                      }}
                    />
                  </div>
                )}

                {/* Bento Item 4: Lecturer Decision */}
                {isAutoGraded ? (
                  <div className="border border-border/50 bg-muted/10 rounded-2xl p-5 shadow-sm space-y-3 transition-all duration-300">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
                      <CheckCircle2 className="size-4 text-emerald-500" />{" "}
                      Auto-Graded Question
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                      This question is automatically scored by the system based
                      on predefined deterministic rules. No AI evaluation or
                      manual grading actions are required.
                    </p>
                    <div className="p-3 bg-background border rounded-xl flex justify-between items-center text-xs font-medium">
                      <span className="font-semibold text-muted-foreground">
                        Recorded Score
                      </span>
                      <span className="font-mono font-bold text-emerald-600">
                        {activeAns?.score !== null &&
                        activeAns?.score !== undefined
                          ? `${activeAns.score} / ${maxMarks} pts`
                          : `Pending / ${maxMarks} pts`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="border border-border/50 bg-card rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300 hover:shadow-md hover:border-border">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                        Lecturer Decision
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="group-score-input"
                          className="text-xs font-semibold text-muted-foreground"
                        >
                          Score for Q{groupGraderActiveQuestionIndex + 1} (max{" "}
                          {maxMarks} pts)
                        </Label>
                        <Input
                          id="group-score-input"
                          type="number"
                          min={0}
                          max={maxMarks}
                          step="any"
                          placeholder="Enter score..."
                          value={groupScore}
                          disabled={!isGroupEditing}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGroupScore(val);
                            if (activeQ) {
                              const updated = {
                                ...groupQuestionScores,
                                [activeQ.id]: val,
                              };
                              setGroupQuestionScores(updated);
                              localStorage.setItem(
                                `group_grades_${selectedGroupSubmission.submission_id}`,
                                JSON.stringify({
                                  scores: updated,
                                  feedback: groupQuestionFeedback,
                                }),
                              );
                            }
                          }}
                          className="h-9 text-xs rounded-lg font-mono font-bold w-full bg-background"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="group-feedback-input"
                          className="text-xs font-semibold text-muted-foreground"
                        >
                          Feedback Comments
                        </Label>
                        <Textarea
                          id="group-feedback-input"
                          placeholder="Provide group feedback comments..."
                          value={groupFeedback}
                          disabled={!isGroupEditing}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGroupFeedback(val);
                            if (activeQ) {
                              const updated = {
                                ...groupQuestionFeedback,
                                [activeQ.id]: val,
                              };
                              setGroupQuestionFeedback(updated);
                              localStorage.setItem(
                                `group_grades_${selectedGroupSubmission.submission_id}`,
                                JSON.stringify({
                                  scores: groupQuestionScores,
                                  feedback: updated,
                                }),
                              );
                            }
                          }}
                          className="min-h-[80px] text-xs rounded-lg w-full font-medium bg-background"
                        />
                      </div>

                      <div className="border-t border-border/30 pt-4 flex flex-col gap-3">
                        {!isGroupEditing ? (
                          <div className="space-y-2">
                            {activeAns?.answer_content?.ai_suggested_score !==
                              null &&
                            activeAns?.answer_content?.ai_suggested_score !==
                              undefined ? (
                              <div className="flex flex-col gap-2">
                                <Button
                                  onClick={() => {
                                    const aiScore =
                                      activeAns.answer_content
                                        .ai_suggested_score;
                                    const aiFb =
                                      activeAns.answer_content.ai_rationale ||
                                      "";
                                    setGroupScore(aiScore.toString());
                                    setGroupFeedback(aiFb);
                                    const updatedScores = {
                                      ...groupQuestionScores,
                                      [activeQ.id]: aiScore.toString(),
                                    };
                                    const updatedFeedback = {
                                      ...groupQuestionFeedback,
                                      [activeQ.id]: aiFb,
                                    };
                                    setGroupQuestionScores(updatedScores);
                                    setGroupQuestionFeedback(updatedFeedback);
                                    localStorage.setItem(
                                      `group_grades_${selectedGroupSubmission.submission_id}`,
                                      JSON.stringify({
                                        scores: updatedScores,
                                        feedback: updatedFeedback,
                                      }),
                                    );
                                    setIsGroupEditing(true);
                                    toast.success(
                                      "AI suggestion copied. Review the fields and finalize or modify.",
                                    );
                                  }}
                                  disabled={gradingGroup}
                                  className="w-full h-10 text-xs font-bold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                  <CheckCircle2 className="size-4" /> Accept AI
                                  Review
                                </Button>
                                <div className="grid grid-cols-2 gap-3">
                                  <Button
                                    variant="outline"
                                    onClick={() => setIsGroupEditing(true)}
                                    disabled={gradingGroup}
                                    className="h-9 text-xs font-bold rounded-xl border-border/80 text-foreground hover:bg-muted/50"
                                  >
                                    Modify Review
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      setGroupScore("");
                                      setGroupFeedback("");
                                      const updatedScores = {
                                        ...groupQuestionScores,
                                        [activeQ.id]: "",
                                      };
                                      const updatedFeedback = {
                                        ...groupQuestionFeedback,
                                        [activeQ.id]: "",
                                      };
                                      setGroupQuestionScores(updatedScores);
                                      setGroupQuestionFeedback(updatedFeedback);
                                      localStorage.setItem(
                                        `group_grades_${selectedGroupSubmission.submission_id}`,
                                        JSON.stringify({
                                          scores: updatedScores,
                                          feedback: updatedFeedback,
                                        }),
                                      );
                                      setIsGroupEditing(true);
                                    }}
                                    disabled={gradingGroup}
                                    className="h-9 text-xs font-bold rounded-xl border-red-500/20 text-red-600 hover:bg-red-500/5"
                                  >
                                    Reject AI Review
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                onClick={() => setIsGroupEditing(true)}
                                disabled={gradingGroup}
                                className="w-full h-10 text-xs font-bold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5 shadow-sm"
                              >
                                Enter Manual Grade
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-3">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={gradingGroup}
                                onClick={() => submitGroupGrade(false)}
                                className="h-9 text-xs font-bold rounded-xl border-border/80 text-foreground hover:bg-muted/50"
                              >
                                Save Draft
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={gradingGroup}
                                onClick={() => setIsGroupEditing(false)}
                                className="h-9 text-xs font-bold rounded-xl border-border/80 text-foreground hover:bg-muted/50"
                              >
                                Cancel
                              </Button>
                            </div>

                            <Button
                              onClick={handleSaveAndNext}
                              disabled={gradingGroup}
                              className="w-full h-10 text-xs font-bold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground flex items-center justify-center gap-1.5 shadow-sm"
                            >
                              {gradingGroup ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="size-4" />
                              )}
                              Finalize & Next Group
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Group Context Drawers */}
          {reviewMode === "detailed" ? (
            <div className="w-80 border-l border-border/40 bg-muted/5 p-4 space-y-4 overflow-y-auto animate-in slide-in-from-right duration-300">
              {/* Group Details */}
              <CollapsibleDrawerSection
                title="Group Details"
                icon={Users}
                defaultOpen={true}
              >
                <div className="space-y-3">
                  <div className="text-[10px] font-bold text-muted-foreground/85 border-b pb-1">
                    Members List ({selectedGroupSubmission.members?.length || 0}
                    )
                  </div>
                  <div className="space-y-1.5">
                    {selectedGroupSubmission.members?.map((m: any) => (
                      <div
                        key={m.student_id}
                        className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-background border border-border/10"
                      >
                        <span className="font-semibold text-foreground truncate max-w-[140px] flex items-center gap-1.5">
                          {m.student_name}
                          {m.is_leader && (
                            <Badge className="text-[8px] font-bold bg-amber-500/10 text-amber-600 border-amber-500/20 px-1 py-0">
                              Leader
                            </Badge>
                          )}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          ID: {m.student_id}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] font-bold text-muted-foreground/85 border-b pb-1 pt-2">
                    Contribution Metrics
                  </div>
                  <div className="space-y-3">
                    {selectedGroupSubmission.members?.map((m: any) => {
                      const activeQ =
                        selectedGroupSubmission.questions[
                          groupGraderActiveQuestionIndex
                        ];
                      const qEdits =
                        selectedGroupSubmission.activities?.filter(
                          (act: any) =>
                            act.student_id === m.student_id &&
                            act.question_id === activeQ.id,
                        ).length || 0;
                      const totalEdits = m.participation_count || 0;
                      return (
                        <div key={m.student_id} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-foreground truncate max-w-[140px]">
                              {m.student_name}
                            </span>
                            <span className="text-muted-foreground text-[10px] font-mono">
                              {totalEdits} edits
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (totalEdits /
                                      Math.max(
                                        1,
                                        selectedGroupSubmission.members.reduce(
                                          (sum: number, mem: any) =>
                                            sum +
                                            (mem.participation_count || 0),
                                          0,
                                        ),
                                      )) *
                                      105,
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="text-[9px] font-bold text-foreground text-right shrink-0 font-mono">
                              {qEdits} Q-edits
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CollapsibleDrawerSection>

              {/* Timeline */}
              <CollapsibleDrawerSection
                title="Approval Timeline"
                icon={Clock}
                defaultOpen={true}
              >
                <div className="relative pl-3 border-l border-border/40 space-y-3 py-1">
                  {selectedGroupSubmission.members?.map((m: any) => (
                    <div key={m.student_id} className="relative text-xs">
                      <div className="absolute -left-[18px] top-1 size-2 rounded-full bg-background border-2 border-primary" />
                      <div className="flex items-center justify-between font-semibold text-foreground">
                        <span>{m.student_name}</span>
                        <Badge
                          className={cn(
                            "text-[8px] font-bold uppercase tracking-wider py-0 h-4 border",
                            m.approval_status === "APPROVED"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : m.approval_status === "REJECTED"
                                ? "bg-red-500/10 text-red-600 border-red-500/20"
                                : "bg-zinc-500/10 text-zinc-600 border-zinc-500/20",
                          )}
                        >
                          {m.approval_status}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                        {m.approved_at
                          ? new Date(m.approved_at).toLocaleString()
                          : "Awaiting signature"}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleDrawerSection>

              {/* Activity Log */}
              <CollapsibleDrawerSection
                title="Activity Log"
                icon={History}
                defaultOpen={false}
              >
                <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                  {selectedGroupSubmission.activities?.length > 0 ? (
                    selectedGroupSubmission.activities.map(
                      (act: any, idx: number) => (
                        <div
                          key={idx}
                          className="text-xs p-2 bg-background border rounded-lg space-y-1 font-medium"
                        >
                          <div className="flex items-center justify-between font-bold text-foreground">
                            <span>{act.student_name}</span>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {safeFormatDistanceToNow(act.timestamp)}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                            {act.description}
                          </p>
                        </div>
                      ),
                    )
                  ) : (
                    <div className="text-center py-6 text-xs text-muted-foreground italic">
                      No contribution records found.
                    </div>
                  )}
                </div>
              </CollapsibleDrawerSection>
            </div>
          ) : (
            <div className="w-12 border-l border-border/40 bg-muted/10 flex flex-col items-center py-4 gap-4">
              <DrawerIconButton
                icon={Users}
                label="Group Details"
                active={activeDrawerSection === "members"}
                onClick={() =>
                  setActiveDrawerSection(
                    activeDrawerSection === "members" ? null : "members",
                  )
                }
              />
              <DrawerIconButton
                icon={Clock}
                label="Approval Timeline"
                active={activeDrawerSection === "timeline"}
                onClick={() =>
                  setActiveDrawerSection(
                    activeDrawerSection === "timeline" ? null : "timeline",
                  )
                }
              />
              <DrawerIconButton
                icon={History}
                label="Activity Log"
                active={activeDrawerSection === "activity"}
                onClick={() =>
                  setActiveDrawerSection(
                    activeDrawerSection === "activity" ? null : "activity",
                  )
                }
              />
            </div>
          )}
        </div>

        {/* Drawer slide-out panel for Focus Mode */}
        {reviewMode === "focus" && activeDrawerSection && (
          <div className="fixed inset-y-0 right-12 w-72 bg-background border-l border-border shadow-2xl z-[100] p-4 space-y-4 overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5 animate-pulse">
                {activeDrawerSection === "members" && (
                  <>
                    <Users className="size-4" /> Group Details
                  </>
                )}
                {activeDrawerSection === "timeline" && (
                  <>
                    <Clock className="size-4" /> Approval Timeline
                  </>
                )}
                {activeDrawerSection === "activity" && (
                  <>
                    <History className="size-4" /> Activity Log
                  </>
                )}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-full"
                onClick={() => setActiveDrawerSection(null)}
              >
                <X className="size-4" />
              </Button>
            </div>

            {activeDrawerSection === "members" && (
              <div className="space-y-4">
                <div className="text-[10px] font-bold text-muted-foreground/85 border-b pb-1">
                  Members List ({selectedGroupSubmission.members?.length || 0})
                </div>
                <div className="space-y-1.5">
                  {selectedGroupSubmission.members?.map((m: any) => (
                    <div
                      key={m.student_id}
                      className="flex items-center justify-between text-xs p-1.5 rounded-lg border bg-muted/5 font-semibold"
                    >
                      <span className="font-semibold text-foreground truncate max-w-[120px] flex items-center gap-1">
                        {m.student_name}
                        {m.is_leader && (
                          <span className="text-[8px] bg-amber-500/10 text-amber-600 border px-1 rounded">
                            L
                          </span>
                        )}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        ID: {m.student_id}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="text-[10px] font-bold text-muted-foreground/85 border-b pb-1 pt-2">
                  Participation Metrics
                </div>
                <div className="space-y-3">
                  {selectedGroupSubmission.members?.map((m: any) => {
                    const activeQ =
                      selectedGroupSubmission.questions[
                        groupGraderActiveQuestionIndex
                      ];
                    const qEdits =
                      selectedGroupSubmission.activities?.filter(
                        (act: any) =>
                          act.student_id === m.student_id &&
                          act.question_id === activeQ.id,
                      ).length || 0;
                    const totalEdits = m.participation_count || 0;
                    return (
                      <div key={m.student_id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground truncate max-w-[110px]">
                            {m.student_name}
                          </span>
                          <span className="text-muted-foreground text-[10px] font-mono">
                            {totalEdits} edits
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (totalEdits /
                                    Math.max(
                                      1,
                                      selectedGroupSubmission.members.reduce(
                                        (sum: number, mem: any) =>
                                          sum + (mem.participation_count || 0),
                                        0,
                                      ),
                                    )) *
                                    105,
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-[9px] font-bold text-foreground text-right shrink-0">
                            {qEdits} Q
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeDrawerSection === "timeline" && (
              <div className="relative pl-3 border-l border-border/40 space-y-3 py-1">
                {selectedGroupSubmission.members?.map((m: any) => (
                  <div
                    key={m.student_id}
                    className="relative text-xs font-semibold"
                  >
                    <div className="absolute -left-[18px] top-1 size-2 rounded-full bg-background border-2 border-primary" />
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span>{m.student_name}</span>
                      <Badge className="text-[8px] font-mono">
                        {m.approval_status}
                      </Badge>
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {m.approved_at
                        ? new Date(m.approved_at).toLocaleDateString()
                        : "Awaiting signature"}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeDrawerSection === "activity" && (
              <div className="space-y-2.5">
                {selectedGroupSubmission.activities?.map(
                  (act: any, idx: number) => (
                    <div
                      key={idx}
                      className="text-xs p-2 bg-muted/5 border rounded-lg font-medium"
                    >
                      <div className="font-bold text-foreground flex items-center justify-between mb-0.5">
                        <span>{act.student_name}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">
                          {safeFormatDistanceToNow(act.timestamp)}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {act.description}
                      </p>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {/* Reassessment Rejection Confirmation Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent className="max-w-md rounded-2xl border bg-background">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2 text-red-600">
                <AlertTriangle className="size-5" /> Confirm Submission
                Rejection
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Are you sure you want to reject this submission? This will
                invalidate the current work, update the queue status, and reopen
                the workspace for a new assessment attempt.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {rejectType === "individual" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Reassessment Window Duration (Days)
                  </Label>
                  <Select
                    value={rejectWindowDays}
                    onValueChange={setRejectWindowDays}
                  >
                    <SelectTrigger className="h-9 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 Days</SelectItem>
                      <SelectItem value="5">5 Days</SelectItem>
                      <SelectItem value="7">7 Days</SelectItem>
                      <SelectItem value="14">14 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Reason for Rejection / Internal Notes
                </Label>
                <Textarea
                  placeholder="Provide pedagogical feedback describing why this submission is rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="min-h-[90px] text-xs rounded-lg font-medium"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectDialogOpen(false)}
                className="text-xs font-semibold rounded-xl"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={
                  rejectType === "individual"
                    ? confirmRejectIndividual
                    : confirmRejectSubmission
                }
                className="text-xs font-bold rounded-xl"
              >
                Confirm & Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── RENDERING PATH 3: REVIEW QUEUE NAVIGATION HIERARCHY ──────────────────
  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      {/* Precision Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-100">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Review & Grading Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            Select course workspaces and assessments to review, grade, and finalize scores.
          </p>
        </div>
      </div>

      {/* Breadcrumbs for Hierarchy Navigation */}
      {(selectedWorkspace || selectedAssessment || selectedClass) && (
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-3">
          <button
            onClick={handleBackToWorkspaces}
            className="hover:text-primary transition-colors flex items-center gap-1 font-semibold"
          >
            <School className="size-3.5" /> Workspaces
          </button>

          {selectedWorkspace && (
            <>
              <ChevronRight className="size-3 text-muted-foreground/50" />
              <button
                onClick={handleBackToAssessments}
                className="hover:text-primary transition-colors font-semibold"
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
                  "font-semibold",
                  !selectedAssessment.is_group_assessment &&
                    "hover:text-primary transition-colors",
                )}
              >
                {selectedAssessment.title}
                {selectedAssessment.is_group_assessment && (
                  <Badge
                    variant="outline"
                    className="text-[9px] font-bold bg-indigo-500/5 text-indigo-600 border-indigo-500/20 ml-2 flex items-center gap-1"
                  >
                    <Users className="size-3" /> Group Work
                  </Badge>
                )}
              </button>
            </>
          )}

          {selectedClass && (
            <>
              <ChevronRight className="size-3 text-muted-foreground/50" />
              <span className="text-foreground font-bold">
                {selectedClass.class_name}
              </span>
            </>
          )}
        </div>
      )}

      {/* STEP A: WORKSPACES LIST */}
      {!selectedWorkspace ? (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
          <Table>
            <TableHeader className="bg-muted/15 border-b border-border/40">
              <TableRow className="h-10 hover:bg-transparent border-none">
                <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">
                  Institution
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Teaching Workspace
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Class Section
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  Students
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  Avg Perf.
                </TableHead>
                <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((ws: WorkspaceListItem) => (
                <TableRow
                  onClick={() => setSelectedWorkspace(ws)}
                  key={ws.id}
                  className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                >
                  <TableCell className="px-6 py-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20"
                    >
                      {ws.institution_name}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors font-mono">
                      {ws.title}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-xs font-semibold text-muted-foreground/80">
                    {ws.class_name}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <span className="text-xs font-bold text-foreground/70 flex items-center justify-center gap-1.5">
                      <Users className="size-3.5 opacity-50" />{" "}
                      {ws.student_count}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs font-bold text-foreground/80 font-mono">
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
                  <TableCell className="text-right pr-6 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
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
                    className="h-44 text-center text-sm font-medium text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
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
        <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
          <Table>
            <TableHeader className="bg-muted/15 border-b border-border/40">
              <TableRow className="h-10 hover:bg-transparent border-none">
                <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">
                  Type
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Assessment Title
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  Marks
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  Grading Mode
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Deadline
                </TableHead>
                <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assessments.map((asmt: AssessmentSummary) => (
                <TableRow
                  onClick={() => {
                    setSelectedAssessment(asmt);
                    if (asmt.is_group_assessment) {
                      fetchGroupQueue(asmt.id);
                    } else {
                      fetchClassStats(asmt.id);
                    }
                  }}
                  key={asmt.id}
                  className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                >
                  <TableCell className="px-6 py-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/5 text-indigo-600 border-indigo-500/20"
                    >
                      {asmt.assessment_type.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {asmt.title}
                    </span>
                    {asmt.is_group_assessment && (
                      <Badge
                        variant="outline"
                        className="text-[9px] font-bold bg-indigo-500/5 text-indigo-600 border-indigo-500/20 ml-2 flex items-center gap-1"
                      >
                        <Users className="size-3" /> Group Work
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <span className="text-xs font-bold text-foreground/70 font-mono">
                      {asmt.total_marks} Pts
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Badge
                      variant="outline"
                      className="text-[9px] font-bold uppercase bg-muted/10 text-muted-foreground border-border/50"
                    >
                      {asmt.grading_mode}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5 font-semibold">
                      <Calendar className="size-3.5 opacity-60" />
                      {asmt.window_end
                        ? new Date(asmt.window_end).toLocaleDateString()
                        : "No deadline"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-6 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {assessments.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-44 text-center text-sm font-medium text-muted-foreground font-semibold"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
                      <FolderOpen className="size-8 opacity-20" />
                      <p>No assessments found in this workspace.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : /* STEP C (GROUP): GROUP WORK SUBMISSIONS QUEUE */
      selectedAssessment.is_group_assessment ? (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
          {groupQueueLoading ? (
            <div className="py-20 text-center space-y-3">
              <Loader2 className="size-8 text-primary animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground font-semibold">
                Loading group submissions...
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/15 border-b border-border/40">
                <TableRow className="h-10 hover:bg-transparent border-none">
                  <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">
                    Group Name
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Members
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                    Approvals
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                    Status
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupQueue.map((item: any) => (
                  <TableRow
                    onClick={() => openGroupSubmission(item.id)}
                    key={item.id}
                    className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                  >
                    <TableCell className="px-6 py-2">
                      <span className="text-sm font-bold text-foreground">
                        {item.group_name}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-xs font-semibold text-foreground/80">
                      {item.member_count} Members
                    </TableCell>
                    <TableCell className="py-2 text-center">
                      <div className="flex flex-col items-center gap-1 font-semibold">
                        <span className="text-[10px] font-bold text-muted-foreground font-mono">
                          {item.approved_member_count} / {item.member_count}{" "}
                          Approved
                        </span>
                        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{
                              width: `${item.member_count ? (item.approved_member_count / item.member_count) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center">
                      <Badge
                        className={cn(
                          "text-[9px] font-bold uppercase tracking-wider border font-mono",
                          item.status === "GRADED"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20",
                        )}
                      >
                        {item.status === "GRADED"
                          ? `Graded (${item.score}/${item.max_score || 100})`
                          : "Needs Review"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6 py-2">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openGroupSubmission(item.id);
                        }}
                        className="h-8 font-bold rounded-lg text-xs"
                      >
                        Open Group
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {groupQueue.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-44 text-center text-sm font-medium text-muted-foreground font-semibold"
                    >
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Users className="size-8 opacity-20" />
                        <p>No submitted groups found for this assessment.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      ) : /* STEP C (INDIVIDUAL): CLASS SECTIONS LIST */
      !selectedClass ? (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
          <Table>
            <TableHeader className="bg-muted/15 border-b border-border/40">
              <TableRow className="h-10 hover:bg-transparent border-none">
                <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">
                  Class Name
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  Submissions
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  Reviewed
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  Pending Review
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  Released
                </TableHead>
                <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classStats.map((c: ClassStatRecord) => (
                <TableRow
                  onClick={() => setSelectedClass(c)}
                  key={c.class_id}
                  className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                >
                  <TableCell className="px-6 py-2">
                    <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {c.class_name}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-center text-xs font-bold text-foreground/80 font-mono">
                    {c.submitted_count} / {c.total_students}
                  </TableCell>
                  <TableCell className="py-2 text-center text-xs font-bold text-emerald-600 font-mono">
                    {c.reviewed_count}
                  </TableCell>
                  <TableCell className="py-2 text-center text-xs font-bold text-rose-500 font-mono">
                    {c.pending_review_count}
                  </TableCell>
                  <TableCell className="py-2 text-center text-xs font-bold text-indigo-500 font-mono">
                    {c.released_count}
                  </TableCell>
                  <TableCell className="text-right pr-6 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {classStats.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-44 text-center text-sm font-medium text-muted-foreground font-semibold"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Users className="size-8 opacity-20" />
                      <p>No class stats found for this assessment.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* STEP D (INDIVIDUAL): INDIVIDUAL STUDENT SUBMISSIONS QUEUE */
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Submissions Filter row */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-border/50 bg-card/20 rounded-xl backdrop-blur-sm">
            <div className="flex items-center gap-3 flex-1 min-w-[240px] flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search students..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-lg bg-background"
                />
              </div>

              {/* Status Select with full backend lifecycles supported (Issue 14) */}
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-36 h-9 text-xs rounded-lg">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Submissions</SelectItem>
                  <SelectItem value="PENDING">Pending Review</SelectItem>
                  <SelectItem value="AI_SUGGESTED">AI Suggested</SelectItem>
                  <SelectItem value="COMPLETED">Graded</SelectItem>
                  <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                  <SelectItem value="PENDING_RELEASE">
                    Pending Release
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger className="w-36 h-9 text-xs rounded-lg">
                  <SelectValue placeholder="Question Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="ESSAY">Essay</SelectItem>
                  <SelectItem value="SHORT_ANSWER">Short Answer</SelectItem>
                  <SelectItem value="CASE_STUDY">Case Study</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-36 h-9 text-xs rounded-lg">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_asc">Oldest First</SelectItem>
                  <SelectItem value="date_desc">Newest First</SelectItem>
                  <SelectItem value="risk_desc">Integrity Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-muted-foreground font-semibold">
              Showing {data.length} of {total} submissions
            </div>
          </div>

          <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
            {loading ? (
              <div className="py-20 text-center space-y-3">
                <Loader2 className="size-8 text-primary animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground font-semibold">
                  Loading submissions...
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader className="bg-muted/15 border-b border-border/40">
                    <TableRow className="h-10 hover:bg-transparent border-none">
                      <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">
                        Student Name
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                        AI Marks
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                        Integrity Risk
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((item: GradingQueueItem) => (
                      <TableRow
                        onClick={() => handleOpenReview(item)}
                        key={item.id}
                        className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                      >
                        <TableCell className="px-6 py-2">
                          <span className="text-sm font-bold text-foreground">
                            {item.student_name}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          {/* Lifecycle Status Badges (Issue 14) */}
                          <Badge
                            className={cn(
                              "text-[9px] font-bold uppercase tracking-wider border font-mono",
                              item.status === "COMPLETED"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : item.status === "AI_SUGGESTED"
                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/20 animate-pulse"
                                  : item.status === "UNDER_REVIEW"
                                    ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                    : item.status === "PENDING_RELEASE"
                                      ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/20"
                                      : "bg-amber-500/10 text-amber-600 border-amber-500/20",
                            )}
                          >
                            {item.status === "COMPLETED"
                              ? "Graded"
                              : item.status === "AI_SUGGESTED"
                                ? "AI Suggested"
                                : item.status === "UNDER_REVIEW"
                                  ? "Under Review"
                                  : item.status === "PENDING_RELEASE"
                                    ? "Pending Release"
                                    : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          {item.ai_suggested_score !== null ? (
                            <Badge
                              variant="secondary"
                              className="font-mono text-xs bg-primary/10 text-primary border-primary/20"
                            >
                              {item.ai_suggested_score} /{" "}
                              {item.max_score || DEFAULT_QUESTION_MAX_MARKS} pts
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/45 text-[10px] italic">
                              N/A
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <span
                            className={cn(
                              "text-xs font-bold font-mono",
                              item.integrity_risk_score > 50
                                ? "text-red-500"
                                : "text-emerald-500",
                            )}
                          >
                            {item.integrity_risk_score}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-2">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenReview(item);
                            }}
                            className="h-8 font-bold rounded-lg text-xs"
                          >
                            Grade Submission
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-44 text-center text-sm font-medium text-muted-foreground font-semibold"
                        >
                          <div className="flex flex-col items-center justify-center gap-3">
                            <Users className="size-8 opacity-20" />
                            <p>
                              No student submissions found matching filters.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {/* Submissions Queue Table Pagination Footer */}
                <div className="flex items-center justify-between p-4 border-t bg-muted/5 font-semibold">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    className="text-xs rounded-lg h-8"
                  >
                    <ChevronLeft className="size-4 mr-1" /> Previous
                  </Button>
                  <span className="text-xs text-muted-foreground font-semibold">
                    Page {currentPage}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasMore}
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    className="text-xs rounded-lg h-8"
                  >
                    Next <ChevronRight className="size-4 ml-1" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
