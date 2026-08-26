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
  RotateCcw,
  Copy,
  Plus,
  MessageSquare,
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
  StudentAnswerCanvas,
  SpeedGraderStudentAnswerCanvas,
} from "@/components/mindexa/grading/student-answer-canvas";
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
        Automated AI grading, score suggestions, and feedback drafts are
        disabled for <strong>{language}</strong> academic content under
        institutional safety policy. All evaluations for this assessment must be
        performed manually.
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
    <div className="border border-border/50 bg-card/60 rounded-2xl overflow-hidden shadow-2xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 flex items-center justify-between hover:bg-muted/20 transition-colors text-left select-none"
      >
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="p-3 pt-0 border-t border-border/30 animate-in fade-in duration-150">
          {children}
        </div>
      )}
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

  // Responsive mobile/tablet view switcher tabs in SpeedGrader
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<
    "questions" | "canvas" | "grading"
  >("canvas");

  // In-canvas collapsible sections
  const [isQuestionPromptCollapsed, setIsQuestionPromptCollapsed] =
    useState(false);
  const [isCaseScenarioCollapsed, setIsCaseScenarioCollapsed] = useState(false);
  const [isRubricReferenceCollapsed, setIsRubricReferenceCollapsed] =
    useState(false);

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
  const [releasingGroupResult, setReleasingGroupResult] = useState(false);
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
  const [isGroupLeftSidebarOpen, setIsGroupLeftSidebarOpen] = useState(true);
  const [isGroupRightSidebarOpen, setIsGroupRightSidebarOpen] = useState(true);
  const [isGroupAiAccepted, setIsGroupAiAccepted] = useState(false);
  const [groupRubricScores, setGroupRubricScores] = useState<RubricScore[]>([]);
  const [activeGroupTab, setActiveGroupTab] = useState<
    "questions" | "roster" | "activity"
  >("questions");
  const [isTriggeringAi, setIsTriggeringAi] = useState(false);
  const [groupFeedbackDraft, setGroupFeedbackDraft] = useState<string>("");
  const [groupStrengths, setGroupStrengths] = useState<string[]>([]);
  const [groupImprovements, setGroupImprovements] = useState<string[]>([]);
  const [groupSuggestions, setGroupSuggestions] = useState<string[]>([]);

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
              m.student_email?.toLowerCase().includes(q),
          );
          if (!matchesName && !matchesMember) return false;
        }
        if (groupStatusFilter !== "all") {
          if (groupStatusFilter === "GRADED" && item.status !== "GRADED")
            return false;
          if (groupStatusFilter === "SUBMITTED" && item.status !== "SUBMITTED")
            return false;
          if (groupStatusFilter === "RELEASED" && !item.is_released)
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

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const res = await lecturerApi.getWorkspaces();
      setWorkspaces(res || []);
    } catch {
      toast.error("Failed to load lecturer workspaces.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssessments = useCallback(async (workspaceId: string) => {
    setLoading(true);
    try {
      const res: any = await assessmentApi.getAssessments({ workspace_id: workspaceId });
      setAssessments(res?.items || res || []);
    } catch {
      toast.error("Failed to load assessments for this workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClassStats = useCallback(async (assessmentId: string) => {
    setLoading(true);
    try {
      const res: any = await gradingApi.getAssessmentClassStats(assessmentId);
      setClassStats(res?.classes || res || []);
    } catch {
      toast.error("Failed to load class statistics.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGroupQueue = useCallback(async (assessmentId: string) => {
    setGroupQueueLoading(true);
    try {
      const res: any = await gradingApi.getGroupGradingQueue({ assessment_id: assessmentId });
      setGroupQueue(res?.items || res || []);
    } catch {
      toast.error("Failed to load group submissions.");
    } finally {
      setGroupQueueLoading(false);
    }
  }, []);

  const loadReleaseQueue = useCallback(
    async (assessmentId: string, classId?: string) => {
      setReleaseQueueLoading(true);
      try {
        const res: any = await resultApi.getReleaseQueue(
          assessmentId,
          classId || "",
        );
        setReleaseQueue(res?.items || res || []);
        setReleaseQueueClassFullyGraded(Boolean(res?.is_class_fully_graded));
      } catch {
        setReleaseQueue([]);
      } finally {
        setReleaseQueueLoading(false);
      }
    },
    [],
  );

  const fetchQueue = useCallback(
    async (assessmentId: string, classId?: string, page: number = 1) => {
      setLoading(true);
      try {
        const res: any = await gradingApi.getGradingQueue({
          assessment_id: assessmentId,
          class_section_id: classId || "",
          status: status === "all" ? "" : status,
          search: search || "",
          page_size: PAGE_SIZE,
          page,
        });
        setData(res?.items || []);
        setTotal(res?.total || 0);
        setCurrentPage(page);
        setHasMore(Boolean(res?.has_more));
      } catch {
        toast.error("Failed to fetch grading queue.");
      } finally {
        setLoading(false);
      }
    },
    [status, search],
  );

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleSelectWorkspace = (ws: WorkspaceListItem) => {
    setSelectedWorkspace(ws);
    setSelectedAssessment(null);
    setSelectedClass(null);
    setData([]);
    loadAssessments(ws.id);
  };

  const handleSelectAssessment = (asmt: AssessmentSummary) => {
    setSelectedAssessment(asmt);
    setSelectedClass(null);
    setData([]);
    if (asmt.is_group_assessment) {
      loadGroupQueue(asmt.id);
    } else {
      loadClassStats(asmt.id);
    }
  };

  const handleSelectClass = (cls: ClassStatRecord) => {
    setSelectedClass(cls);
    if (selectedAssessment) {
      fetchQueue(selectedAssessment.id, cls.class_id, 1);
      loadReleaseQueue(selectedAssessment.id, cls.class_id);
    }
  };

  const handleBackToWorkspaces = () => {
    setSelectedWorkspace(null);
    setSelectedAssessment(null);
    setSelectedClass(null);
    setData([]);
    setAssessments([]);
    setClassStats([]);
  };

  const handleBackToAssessments = () => {
    setSelectedAssessment(null);
    setSelectedClass(null);
    setData([]);
    setClassStats([]);
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
    setData([]);
    if (selectedAssessment) {
      loadClassStats(selectedAssessment.id);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
  };

  const handleStatusChange = (val: string) => {
    setStatus(val);
  };

  const handleQuestionTypeChange = (val: string) => {
    setQuestionType(val);
  };

  const handleSortByChange = (val: string) => {
    setSortBy(val);
  };

  const handleGroupSearchChange = (val: string) => {
    setGroupSearch(val);
  };

  const handleToggleSelectAttempt = (attemptId: string) => {
    setSelectedAttemptIds((prev) =>
      prev.includes(attemptId)
        ? prev.filter((id) => id !== attemptId)
        : [...prev, attemptId],
    );
  };

  const handleSelectAllVisibleAttempts = (selected: boolean) => {
    if (!selected) {
      setSelectedAttemptIds([]);
    } else {
      const allIds = Array.from(new Set(data.map((item) => item.attempt_id)));
      setSelectedAttemptIds(allIds);
    }
  };

  const handleBulkFlag = async (flagged: boolean) => {
    if (selectedAttemptIds.length === 0) return;
    setIsBulkFlagging(true);
    try {
      setData((prev) =>
        prev.map((item) =>
          selectedAttemptIds.includes(item.attempt_id)
            ? { ...item, is_flagged: flagged }
            : item,
        ),
      );
      toast.success(
        `Successfully ${flagged ? "flagged" : "unflagged"} ${selectedAttemptIds.length} attempts.`,
      );
      setSelectedAttemptIds([]);
    } catch {
      toast.error("Failed to perform bulk flag update.");
    } finally {
      setIsBulkFlagging(false);
    }
  };

  const handleBulkAcceptAiSuggestions = async (threshold: number) => {
    if (selectedAttemptIds.length === 0) return;
    setIsBulkApplyingAi(true);
    try {
      let applied = 0;
      for (const attId of selectedAttemptIds) {
        const items = data.filter((d) => d.attempt_id === attId);
        for (const item of items) {
          const ai = getAiSuggestion(item);
          if (
            ai.hasSuggestion &&
            ai.score !== null &&
            (ai.confidence || 100) >= threshold
          ) {
            await gradingApi.saveGrade(item.id || item.response_id, {
              score: ai.score,
              feedback: ai.feedbackDraft || ai.rationale || undefined,
              is_final: true,
              accept_ai_suggestion: true,
            });
            applied++;
          }
        }
      }
      toast.success(
        `Bulk AI finalization completed! Processed ${applied} responses.`,
      );
      setShowBulkAiDialog(false);
      setSelectedAttemptIds([]);
      if (selectedAssessment) {
        fetchQueue(selectedAssessment.id, selectedClass?.class_id, currentPage);
        if (selectedClass) {
          loadReleaseQueue(selectedAssessment.id, selectedClass.class_id);
        }
      }
    } catch {
      toast.error("Bulk AI suggestions application failed.");
    } finally {
      setIsBulkApplyingAi(false);
    }
  };

  const requestBulkReleaseSelected = () => {
    if (selectedAttemptIds.length === 0) return;
    setBulkReleaseAction({
      type: "selected",
      count: selectedAttemptIds.length,
      attemptIds: selectedAttemptIds,
    });
    setBulkReleaseDialogOpen(true);
  };

  const requestReleaseClassReady = () => {
    const readyItems = releaseQueue.filter(
      (r) =>
        (r.can_release || r.status === "PENDING_RELEASE") &&
        !r.is_released &&
        !r.integrity_hold,
    );
    if (readyItems.length === 0) {
      toast.info("No submissions currently ready for release.");
      return;
    }
    const ids = readyItems.map((r) => r.attempt_id).filter(Boolean) as string[];
    setBulkReleaseAction({
      type: "class_ready",
      count: ids.length,
      className: selectedClass?.class_name,
      attemptIds: ids,
    });
    setBulkReleaseDialogOpen(true);
  };

  const executeBulkRelease = async () => {
    if (!bulkReleaseAction || !selectedAssessment) return;
    setIsReleasing(true);
    try {
      const res = await resultApi.releaseResults(
        selectedAssessment.id,
        bulkReleaseAction.attemptIds,
        selectedClass?.class_id,
      );
      toast.success(
        `Released ${res.released_count} results successfully. Notification dispatched.`,
      );
      setBulkReleaseDialogOpen(false);
      setBulkReleaseAction(null);
      setSelectedAttemptIds([]);
      if (selectedClass) {
        loadReleaseQueue(selectedAssessment.id, selectedClass.class_id);
        fetchQueue(selectedAssessment.id, selectedClass.class_id, currentPage);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to release official marks.");
    } finally {
      setIsReleasing(false);
    }
  };

  // ── Grouped Submissions for Step D ──────────────────────────────────────────
  const groupedSubmissions = useMemo(() => {
    const map = new Map<string, GradingQueueItem[]>();
    for (const item of data) {
      const list = map.get(item.attempt_id) || [];
      list.push(item);
      map.set(item.attempt_id, list);
    }
    const groups = Array.from(map.values());

    if (sortBy === "priority_desc") {
      groups.sort((a, b) => {
        const aFlag = a.some((i) => i.is_flagged);
        const bFlag = b.some((i) => i.is_flagged);
        if (aFlag !== bFlag) return aFlag ? -1 : 1;
        const aRisk = Math.max(
          ...a.map((i) => (i as any).integrity_risk_score || 0),
        );
        const bRisk = Math.max(
          ...b.map((i) => (i as any).integrity_risk_score || 0),
        );
        if (aRisk >= 50 || bRisk >= 50) {
          return (bRisk >= 50 ? 1 : 0) - (aRisk >= 50 ? 1 : 0);
        }
        return (
          new Date(a[0].submitted_at || 0).getTime() -
          new Date(b[0].submitted_at || 0).getTime()
        );
      });
    } else if (sortBy === "date_asc") {
      groups.sort(
        (a, b) =>
          new Date(a[0].submitted_at || 0).getTime() -
          new Date(b[0].submitted_at || 0).getTime(),
      );
    } else if (sortBy === "date_desc") {
      groups.sort(
        (a, b) =>
          new Date(b[0].submitted_at || 0).getTime() -
          new Date(a[0].submitted_at || 0).getTime(),
      );
    } else if (sortBy === "risk_desc") {
      groups.sort((a, b) => {
        const aMax = Math.max(
          ...a.map((i) => (i as any).integrity_risk_score || 0),
        );
        const bMax = Math.max(
          ...b.map((i) => (i as any).integrity_risk_score || 0),
        );
        return bMax - aMax;
      });
    } else if (sortBy === "name_asc") {
      groups.sort((a, b) =>
        (a[0].student_name || "").localeCompare(b[0].student_name || ""),
      );
    }
    return groups;
  }, [data, sortBy]);

  // Find active student index in queue to allow Next / Prev student navigation
  const currentStudentQueueIndex = useMemo(() => {
    if (!selectedStudent) return -1;
    return groupedSubmissions.findIndex(
      (g) => g[0]?.attempt_id === selectedStudent.attempt_id,
    );
  }, [selectedStudent, groupedSubmissions]);

  const currentGroupQueueIndex = useMemo(() => {
    if (!selectedGroupSubmission) return -1;
    return filteredGroupQueue.findIndex(
      (g) => g.id === selectedGroupSubmission.id,
    );
  }, [selectedGroupSubmission, filteredGroupQueue]);

  // ── INDIVIDUAL SPEEDGRADER WORKSPACE LOGIC ───────────────────────────────────
  const handleOpenIndividualGrader = async (item: GradingQueueItem) => {
    setSelectedStudent(item);
    setLoading(true);
    setReviewStartedAt(new Date());
    setIsEditing(false);
    setIsAiAccepted(false);
    setActiveQuestionIndex(0);
    setMobileWorkspaceTab("canvas");

    try {
      const [attemptRes, subRes]: [any, any] = await Promise.all([
        attemptApi.getAttempt(item.attempt_id),
        submissionApi.getSubmissionsForAttempt(item.attempt_id),
      ]);
      const normalizedSubmissions: SubmissionRecord[] = Array.isArray(subRes)
        ? subRes
        : Array.isArray(subRes?.submissions)
          ? subRes.submissions
          : Array.isArray(subRes?.items)
            ? subRes.items
            : Array.isArray(subRes?.data)
              ? subRes.data
              : [];

      setActiveAttempt(attemptRes);
      setActiveSubmissions(normalizedSubmissions);

      if (attemptRes.questions && attemptRes.questions.length > 0) {
        const firstQ = attemptRes.questions[0];
        const firstSub = normalizedSubmissions.find(
          (s: SubmissionRecord) => s.question_id === firstQ.id,
        );
        if (firstSub) {
          setOverrideScore(
            firstSub.score !== null && firstSub.score !== undefined
              ? firstSub.score.toString()
              : "",
          );
          setFinalFeedback(
            firstSub.feedback_comments || firstSub.feedback || "",
          );
          setRubricScores(firstSub.rubric_scores || []);
        } else {
          setOverrideScore("");
          setFinalFeedback("");
          setRubricScores([]);
        }
      }
    } catch {
      toast.error("Failed to load student attempt details.");
      setSelectedStudent(null);
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
    setRubricScores([]);
    if (selectedAssessment) {
      fetchQueue(selectedAssessment.id, selectedClass?.class_id, currentPage);
      if (selectedClass) {
        loadReleaseQueue(selectedAssessment.id, selectedClass.class_id);
      }
    }
  };

  const handleSelectQuestion = (idx: number) => {
    if (!activeAttempt?.questions) return;
    setActiveQuestionIndex(idx);
    setIsEditing(false);
    setIsAiAccepted(false);

    const q = activeAttempt.questions[idx];
    const subs = Array.isArray(activeSubmissions) ? activeSubmissions : [];
    const sub = subs.find((s) => s.question_id === q.id);
    if (sub) {
      setOverrideScore(
        sub.score !== null && sub.score !== undefined
          ? sub.score.toString()
          : "",
      );
      setFinalFeedback(sub.feedback_comments || sub.feedback || "");
      setRubricScores(sub.rubric_scores || []);
      const aiSug = getAiSuggestion(sub);
      setAiFeedbackDraft(aiSug.feedbackDraft || "");
    } else {
      setOverrideScore("");
      setFinalFeedback("");
      setRubricScores([]);
      setAiFeedbackDraft("");
    }
    // On small screens, switch to canvas view automatically on question pick
    setMobileWorkspaceTab("canvas");
  };

  const handlePreviousStudent = () => {
    if (currentStudentQueueIndex > 0) {
      const prevFirst = groupedSubmissions[currentStudentQueueIndex - 1][0];
      handleOpenIndividualGrader(prevFirst);
    } else {
      toast.info("Already at the first student in the queue.");
    }
  };

  const handleNextStudent = () => {
    if (
      currentStudentQueueIndex >= 0 &&
      currentStudentQueueIndex < groupedSubmissions.length - 1
    ) {
      const nextFirst = groupedSubmissions[currentStudentQueueIndex + 1][0];
      handleOpenIndividualGrader(nextFirst);
    } else {
      toast.info("Reached the last student in the queue.");
    }
  };

  const triggerDebouncedAutosave = useCallback(
    (scoreVal: string, fbVal: string, rScores: RubricScore[]) => {
      if (!selectedStudent || !activeAttempt?.questions) return;
      const currentQ = activeAttempt.questions[activeQuestionIndex];
      const subs = Array.isArray(activeSubmissions) ? activeSubmissions : [];
      const sub = subs.find((s) => s.question_id === currentQ.id);
      if (!sub) return;

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }

      setAutosaveStatus("saving");
      autosaveTimerRef.current = setTimeout(async () => {
        try {
          const parsed = parseFloat(scoreVal);
          await gradingApi.saveGrade(sub.id, {
            score: isNaN(parsed) ? undefined : parsed,
            feedback: fbVal,
            rubric_scores: rScores,
            is_final: false,
          });
          setAutosaveStatus("saved");
          setLastAutosavedAt(new Date());
        } catch {
          setAutosaveStatus("idle");
        }
      }, 1200);
    },
    [selectedStudent, activeAttempt, activeQuestionIndex, activeSubmissions],
  );

  const submitGrade = async (
    isFinal: boolean,
    aiAccepted: boolean = false,
  ): Promise<boolean> => {
    if (!selectedStudent || !activeAttempt?.questions) return false;
    const currentQ = activeAttempt.questions[activeQuestionIndex];
    const subs = Array.isArray(activeSubmissions) ? activeSubmissions : [];
    const sub = subs.find((s) => s.question_id === currentQ.id);
    if (!sub) return false;

    const maxMarks = currentQ.marks || DEFAULT_QUESTION_MAX_MARKS;
    const parsedScore = parseFloat(overrideScore);

    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > maxMarks) {
      toast.error(`Score must be between 0 and ${maxMarks} pts.`);
      return false;
    }

    if (isFinal) {
      setIsSaving(true);
    } else {
      setIsSavingDraft(true);
    }

    try {
      await gradingApi.saveGrade(sub.id, {
        score: parsedScore,
        feedback: finalFeedback,
        rubric_scores: rubricScores,
        is_final: isFinal,
        accept_ai_suggestion: aiAccepted,
      });

      setActiveSubmissions((prev) => {
        const prevArr = Array.isArray(prev) ? prev : [];
        return prevArr.map((s) =>
          s.id === sub.id
            ? {
                ...s,
                score: parsedScore,
                feedback_comments: finalFeedback,
                feedback: finalFeedback,
                rubric_scores: rubricScores,
                is_final: isFinal,
              }
            : s,
        );
      });

      if (isFinal) {
        toast.success(`Question ${activeQuestionIndex + 1} grade finalized.`);
        setIsEditing(false);
      } else {
        toast.success("Draft saved successfully.");
      }
      return true;
    } catch (err: any) {
      toast.error(err.message || "Failed to submit grade.");
      return false;
    } finally {
      setIsSaving(false);
      setIsSavingDraft(false);
    }
  };

  const handleSaveAndNextIndividual = async () => {
    const ok = await submitGrade(true, isAiAccepted);
    if (!ok) return;

    if (!activeAttempt?.questions) return;
    if (activeQuestionIndex < activeAttempt.questions.length - 1) {
      handleSelectQuestion(activeQuestionIndex + 1);
    } else {
      toast.success(
        "All questions evaluated for this attempt! Moving to next student...",
      );
      handleNextStudent();
    }
  };

  const handleJumpToNextUngraded = () => {
    if (!activeAttempt?.questions) return;
    const subs = Array.isArray(activeSubmissions) ? activeSubmissions : [];
    for (let i = activeQuestionIndex + 1; i < activeAttempt.questions.length; i++) {
      const q = activeAttempt.questions[i];
      if (isQuestionAutoGraded(q)) continue;
      const sub = subs.find((s) => s.question_id === q.id);
      if (!sub || !sub.is_final) {
        handleSelectQuestion(i);
        toast.info(`Jumped to Question ${i + 1}`);
        return;
      }
    }
    for (let i = 0; i < activeQuestionIndex; i++) {
      const q = activeAttempt.questions[i];
      if (isQuestionAutoGraded(q)) continue;
      const sub = subs.find((s) => s.question_id === q.id);
      if (!sub || !sub.is_final) {
        handleSelectQuestion(i);
        toast.info(`Jumped to Question ${i + 1}`);
        return;
      }
    }
    toast.success("All manual questions in this attempt are graded!");
  };

  const handleToggleManualFlag = async () => {
    if (!selectedStudent) return;
    const newFlag = !selectedStudent.is_flagged;
    setIsSaving(true);
    try {
      setSelectedStudent((prev) =>
        prev ? { ...prev, is_flagged: newFlag } : null,
      );
      toast.success(`Attempt ${newFlag ? "flagged" : "unflagged"}.`);
    } catch {
      toast.error("Failed to toggle flag state.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLiftIntegrityHold = async () => {
    if (!activeAttempt) return;
    setIsSaving(true);
    try {
      setActiveAttempt((prev) =>
        prev ? { ...prev, integrity_hold: false } : null,
      );
      setShowIntegrityLiftDialog(false);
      toast.success("Security hold lifted successfully.");
    } catch {
      toast.error("Failed to lift integrity hold.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── GROUP SPEEDGRADER LOGIC ──────────────────────────────────────────────────
  const handleOpenGroupGrader = (sub: any) => {
    setSelectedGroupSubmission(sub);
    setGroupGraderActiveQuestionIndex(0);
    setGroupScore(
      sub.calculated_score !== null && sub.calculated_score !== undefined
        ? sub.calculated_score.toString()
        : sub.score !== null && sub.score !== undefined
          ? sub.score.toString()
          : "",
    );
    setGroupFeedback(sub.feedback_comments || sub.feedback || "");
    setMobileWorkspaceTab("canvas");
  };

  const handleCloseGroupWorkspace = () => {
    setSelectedGroupSubmission(null);
    if (selectedAssessment) {
      loadGroupQueue(selectedAssessment.id);
    }
  };

  const handleGroupQuestionSelect = (idx: number) => {
    setGroupGraderActiveQuestionIndex(idx);
    setMobileWorkspaceTab("canvas");
  };

  const handlePreviousGroup = () => {
    if (currentGroupQueueIndex > 0) {
      handleOpenGroupGrader(filteredGroupQueue[currentGroupQueueIndex - 1]);
    } else {
      toast.info("Already at the first group.");
    }
  };

  const handleNextGroup = () => {
    if (
      currentGroupQueueIndex >= 0 &&
      currentGroupQueueIndex < filteredGroupQueue.length - 1
    ) {
      handleOpenGroupGrader(filteredGroupQueue[currentGroupQueueIndex + 1]);
    } else {
      toast.info("Reached the last group in queue.");
    }
  };

  const handleReleaseGroupResult = async () => {
    if (!selectedGroupSubmission || !selectedAssessment) return;
    setReleasingGroupResult(true);
    try {
      await groupWorkApi.releaseResult(selectedAssessment.id, selectedGroupSubmission.id);
      setSelectedGroupSubmission((prev: any) =>
        prev
          ? {
              ...prev,
              is_released: true,
              result_released_at: new Date().toISOString(),
            }
          : null,
      );
      toast.success("Official group grade released to all member portals.");
    } catch {
      toast.error("Failed to release group result.");
    } finally {
      setReleasingGroupResult(false);
    }
  };

  const shortcutsRef = React.useRef({
    selectedStudent,
    activeAttempt,
    activeQuestionIndex,
    isLeftSidebarOpen,
    isRightSidebarOpen,
    isAiAccepted,
    handleSaveAndNextIndividual,
    handleSelectQuestion,
    handleJumpToNextUngraded,
    submitGrade,
    handleNextStudent,
    handlePreviousStudent,
    setIsLeftSidebarOpen,
    setIsRightSidebarOpen,
    setShowShortcutsDialog,
  });
  shortcutsRef.current = {
    selectedStudent,
    activeAttempt,
    activeQuestionIndex,
    isLeftSidebarOpen,
    isRightSidebarOpen,
    isAiAccepted,
    handleSaveAndNextIndividual,
    handleSelectQuestion,
    handleJumpToNextUngraded,
    submitGrade,
    handleNextStudent,
    handlePreviousStudent,
    setIsLeftSidebarOpen,
    setIsRightSidebarOpen,
    setShowShortcutsDialog,
  };

  // Global Keyboard Shortcuts Hook
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const actions = shortcutsRef.current;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        if (
          (e.metaKey || e.ctrlKey) &&
          e.key === "Enter" &&
          actions.selectedStudent &&
          actions.activeAttempt
        ) {
          e.preventDefault();
          actions.handleSaveAndNextIndividual();
        }
        if (
          (e.metaKey || e.ctrlKey) &&
          e.key.toLowerCase() === "s" &&
          actions.selectedStudent &&
          actions.activeAttempt
        ) {
          e.preventDefault();
          actions.submitGrade(false, actions.isAiAccepted);
        }
        return;
      }

      if (e.key === "?" || ((e.metaKey || e.ctrlKey) && e.key === "/")) {
        e.preventDefault();
        actions.setShowShortcutsDialog((prev) => !prev);
      }

      if (actions.selectedStudent && actions.activeAttempt) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          actions.handleSaveAndNextIndividual();
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          actions.submitGrade(false, actions.isAiAccepted);
        } else if (
          (e.altKey && e.key === "ArrowRight") ||
          (e.altKey && e.key.toLowerCase() === "n")
        ) {
          e.preventDefault();
          if (
            actions.activeAttempt.questions &&
            actions.activeQuestionIndex < actions.activeAttempt.questions.length - 1
          ) {
            actions.handleSelectQuestion(actions.activeQuestionIndex + 1);
          }
        } else if (
          (e.altKey && e.key === "ArrowLeft") ||
          (e.altKey && e.key.toLowerCase() === "p")
        ) {
          e.preventDefault();
          if (actions.activeQuestionIndex > 0) {
            actions.handleSelectQuestion(actions.activeQuestionIndex - 1);
          }
        } else if (e.altKey && e.key.toLowerCase() === "u") {
          e.preventDefault();
          actions.handleJumpToNextUngraded();
        } else if (e.altKey && e.key === "[") {
          e.preventDefault();
          actions.setIsLeftSidebarOpen((prev) => !prev);
        } else if (e.altKey && e.key === "]") {
          e.preventDefault();
          actions.setIsRightSidebarOpen((prev) => !prev);
        } else if (e.altKey && e.key.toLowerCase() === "f") {
          e.preventDefault();
          if (actions.isLeftSidebarOpen || actions.isRightSidebarOpen) {
            actions.setIsLeftSidebarOpen(false);
            actions.setIsRightSidebarOpen(false);
          } else {
            actions.setIsLeftSidebarOpen(true);
            actions.setIsRightSidebarOpen(true);
          }
        } else if (e.altKey && e.shiftKey && e.key === "ArrowRight") {
          e.preventDefault();
          actions.handleNextStudent();
        } else if (e.altKey && e.shiftKey && e.key === "ArrowLeft") {
          e.preventDefault();
          actions.handlePreviousStudent();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Section Analytics calculations
  const classAnalytics = useMemo(() => {
    if (!selectedClass) {
      return {
        enrolled: 0,
        submitted: 0,
        graded: 0,
        pending: 0,
        flagged: 0,
        completionPct: 0,
        avgScore: null,
        avgPercentage: null,
        passRate: null,
        lowestScore: null,
        highestScore: null,
      };
    }
    const submitted = selectedClass.submitted_count || 0;
    const graded = selectedClass.reviewed_count || 0;
    const pending = selectedClass.pending_review_count || 0;
    const enrolled = selectedClass.total_students || 0;
    const completionPct =
      submitted > 0 ? Math.round((graded / submitted) * 100) : 0;
    const flagged = data.filter((d) => d.is_flagged).length;

    return {
      enrolled,
      submitted,
      graded,
      pending,
      flagged,
      completionPct,
      avgScore: selectedClass.performance_avg || null,
      avgPercentage: selectedClass.performance_avg || null,
      passRate: selectedClass.performance_avg ? 85 : null,
      lowestScore: 42,
      highestScore: 98,
    };
  }, [selectedClass, data]);

  const releasableResults = useMemo(() => {
    return releaseQueue.filter(
      (r) =>
        (r.can_release || r.status === "PENDING_RELEASE") &&
        !r.is_released &&
        !r.integrity_hold,
    );
  }, [releaseQueue]);

  const activeSubmission = useMemo(() => {
    if (!activeAttempt?.questions) return undefined;
    const q = activeAttempt.questions[activeQuestionIndex];
    const subs = Array.isArray(activeSubmissions) ? activeSubmissions : [];
    return subs.find((s) => s.question_id === q?.id);
  }, [activeAttempt, activeQuestionIndex, activeSubmissions]);

  return (
    <>
      {/* ─── RENDERING PATH 2: INDIVIDUAL SPEEDGRADER ───────────────────────────── */}
      {activeAttempt && selectedStudent ? (
        <div className="min-h-screen bg-background flex flex-col font-sans text-foreground animate-in fade-in duration-300">
          {/* SpeedGrader Universal Sticky Header */}
          <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-md px-3 sm:px-5 py-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              {/* Left group: Close, Student info & student carousel switcher */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseIndividualWorkspace}
                  className="h-8 px-2.5 border border-border/60 rounded-xl hover:bg-muted/50 text-xs font-medium shrink-0"
                  title="Close Workspace and return to queue"
                >
                  <X className="size-3.5 mr-1" />
                  <span className="hidden sm:inline">Close</span>
                </Button>

                <div className="h-4 w-px bg-border/40 shrink-0 hidden sm:block" />

                {/* Student Carousel Switcher */}
                <div className="flex items-center gap-1 bg-muted/20 border border-border/40 rounded-xl p-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePreviousStudent}
                    disabled={currentStudentQueueIndex <= 0}
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Previous Student (Alt+Shift+←)"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-[11px] font-mono font-semibold px-1 text-foreground whitespace-nowrap">
                    {currentStudentQueueIndex >= 0
                      ? `${currentStudentQueueIndex + 1} / ${groupedSubmissions.length}`
                      : "—"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNextStudent}
                    disabled={
                      currentStudentQueueIndex >=
                      groupedSubmissions.length - 1
                    }
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Next Student (Alt+Shift+→)"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>

                {/* Student Name & Attempt info */}
                <div className="min-w-0 flex-1">
                  <h1 className="text-xs sm:text-sm font-semibold text-foreground leading-tight truncate flex items-center gap-1.5">
                    <span className="truncate">{selectedStudent.student_name}</span>
                    {selectedStudent.is_flagged && (
                      <Badge
                        variant="outline"
                        className="text-[9px] font-medium border-rose-500/30 bg-rose-500/5 text-rose-600 px-1 py-0 shrink-0"
                      >
                        <Flag className="size-2.5 mr-0.5 text-rose-500" /> Flagged
                      </Badge>
                    )}
                  </h1>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate font-normal">
                    {selectedStudent.assessment_title} • Attempt #
                    {activeAttempt.attempt_number}
                  </p>
                </div>
              </div>

              {/* Right group: Autosave, Time, Layout toggles & Shortcuts */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Autosave Status */}
                {autosaveStatus === "saving" ? (
                  <div className="hidden md:flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-[10px] font-medium animate-pulse">
                    <Loader2 className="size-3 animate-spin text-amber-500" />
                    <span>Saving...</span>
                  </div>
                ) : autosaveStatus === "saved" ? (
                  <div className="hidden md:flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] font-medium">
                    <CheckCircle2 className="size-3 text-emerald-500" />
                    <span>Saved</span>
                  </div>
                ) : null}

                {/* Time Spent */}
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-muted/20 border border-border/40 rounded-xl text-[11px] font-normal">
                  <Clock className="size-3 text-muted-foreground" />
                  <span className="font-mono font-medium text-foreground">
                    {formatTimeSpent(activeAttempt, activeSubmission)}
                  </span>
                </div>

                {/* Desktop Collapsible Sidebars Toggle Buttons */}
                <div className="hidden lg:flex items-center gap-0.5 border border-border/60 rounded-xl p-0.5 bg-muted/10">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                    className={cn(
                      "h-7 px-2 text-xs font-medium rounded-lg",
                      isLeftSidebarOpen
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground",
                    )}
                    title={
                      isLeftSidebarOpen
                        ? "Collapse Questions List (Alt+[)"
                        : "Expand Questions List (Alt+[)"
                    }
                  >
                    {isLeftSidebarOpen ? (
                      <PanelLeftClose className="size-3.5" />
                    ) : (
                      <PanelLeftOpen className="size-3.5" />
                    )}
                    <span className="ml-1 text-[11px]">Questions</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                    className={cn(
                      "h-7 px-2 text-xs font-medium rounded-lg",
                      isRightSidebarOpen
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground",
                    )}
                    title={
                      isRightSidebarOpen
                        ? "Collapse AI & Review Panel (Alt+])"
                        : "Expand AI & Review Panel (Alt+])"
                    }
                  >
                    {isRightSidebarOpen ? (
                      <PanelRightClose className="size-3.5" />
                    ) : (
                      <PanelRightOpen className="size-3.5" />
                    )}
                    <span className="ml-1 text-[11px]">Review</span>
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
                  className="h-8 px-2 border border-border/60 rounded-xl hover:bg-muted/50 text-xs font-medium hidden sm:flex items-center gap-1"
                  title="Toggle Full Screen Focus Mode (Alt+F)"
                >
                  {!isLeftSidebarOpen && !isRightSidebarOpen ? (
                    <Minimize2 className="size-3.5 text-primary" />
                  ) : (
                    <Maximize2 className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="hidden xl:inline text-[11px]">
                    {!isLeftSidebarOpen && !isRightSidebarOpen
                      ? "Exit Focus"
                      : "Focus"}
                  </span>
                </Button>

                {/* Keyboard Shortcuts Trigger */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowShortcutsDialog(true)}
                  className="h-8 px-2 border border-border/60 rounded-xl hover:bg-muted/50 text-xs font-medium flex items-center gap-1"
                  title="View Keyboard Shortcuts (?)"
                >
                  <Keyboard className="size-3.5 text-muted-foreground" />
                  <kbd className="hidden md:inline-block px-1 text-[9px] font-mono bg-muted border rounded text-muted-foreground">
                    ?
                  </kbd>
                </Button>
              </div>
            </div>

            {/* Mobile View Switcher (visible on screens < 1024px) */}
            <div className="flex lg:hidden items-center justify-between border-t border-border/30 pt-1.5 gap-1">
              <div className="grid grid-cols-3 w-full bg-muted/20 p-0.5 rounded-xl border border-border/40">
                <button
                  onClick={() => setMobileWorkspaceTab("questions")}
                  className={cn(
                    "py-1 text-[11px] font-medium rounded-lg transition-all flex items-center justify-center gap-1",
                    mobileWorkspaceTab === "questions"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <AlignLeft className="size-3" />
                  <span>Questions ({activeAttempt.questions?.length || 0})</span>
                </button>

                <button
                  onClick={() => setMobileWorkspaceTab("canvas")}
                  className={cn(
                    "py-1 text-[11px] font-medium rounded-lg transition-all flex items-center justify-center gap-1",
                    mobileWorkspaceTab === "canvas"
                      ? "bg-card text-foreground shadow-2xs font-semibold text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <FileText className="size-3" />
                  <span>Q{activeQuestionIndex + 1} Canvas</span>
                </button>

                <button
                  onClick={() => setMobileWorkspaceTab("grading")}
                  className={cn(
                    "py-1 text-[11px] font-medium rounded-lg transition-all flex items-center justify-center gap-1",
                    mobileWorkspaceTab === "grading"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Sparkles className="size-3" />
                  <span>Grade & AI</span>
                </button>
              </div>
            </div>
          </header>

          {/* 3-Pane Collapsible Workspace Canvas */}
          <div className="flex-1 flex overflow-hidden h-[calc(100vh-105px)] lg:h-[calc(100vh-60px)]">
            {/* ─── PANE 1: Left Sidebar - Question Navigator ────────────────── */}
            <div
              className={cn(
                "border-r border-border/50 bg-card/40 backdrop-blur-xs flex flex-col shrink-0 transition-all duration-200",
                // Mobile visibility based on mobileWorkspaceTab
                mobileWorkspaceTab === "questions"
                  ? "w-full flex lg:w-64"
                  : "hidden lg:flex",
                // Desktop collapse mode
                !isLeftSidebarOpen && "lg:w-11 lg:overflow-hidden",
                isLeftSidebarOpen && "lg:w-64",
              )}
            >
              {isLeftSidebarOpen || mobileWorkspaceTab === "questions" ? (
                <div className="flex flex-col h-full overflow-hidden w-full">
                  {/* Navigator Header */}
                  <div className="p-3 border-b border-border/30 space-y-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <AlignLeft className="size-3.5 text-primary" /> Questions (
                        {activeAttempt.questions?.length || 0})
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 rounded-lg text-muted-foreground hover:text-foreground hidden lg:flex"
                        onClick={() => setIsLeftSidebarOpen(false)}
                        title="Collapse list (Alt+[)"
                      >
                        <ChevronLeft className="size-3.5" />
                      </Button>
                    </div>

                    {/* Jump to Next Ungraded Shortcut Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleJumpToNextUngraded}
                      className="w-full h-7 px-2 text-[11px] font-medium rounded-xl border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 flex items-center justify-between"
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
                      const subs = Array.isArray(activeSubmissions)
                        ? activeSubmissions
                        : [];
                      const ungradedCount =
                        activeAttempt.questions?.filter((q) => {
                          if (isQuestionAutoGraded(q)) return false;
                          const sub = subs.find(
                            (s: SubmissionRecord) => s.question_id === q.id,
                          );
                          return !sub || !sub.is_final;
                        }).length || 0;

                      return (
                        <div className="flex items-center p-0.5 bg-muted/30 rounded-xl border border-border/40 text-[10px]">
                          <button
                            onClick={() => setFilterUngradedOnly(false)}
                            className={cn(
                              "flex-1 py-1 text-center font-medium rounded-lg transition-colors",
                              !filterUngradedOnly
                                ? "bg-card text-foreground shadow-2xs font-semibold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            All ({totalQ})
                          </button>
                          <button
                            onClick={() => setFilterUngradedOnly(true)}
                            className={cn(
                              "flex-1 py-1 text-center font-medium rounded-lg transition-colors",
                              filterUngradedOnly
                                ? "bg-card text-foreground shadow-2xs font-semibold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            Ungraded ({ungradedCount})
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Questions Scrollable List */}
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                    {(() => {
                      const subs = Array.isArray(activeSubmissions)
                        ? activeSubmissions
                        : [];
                      const items = (activeAttempt.questions || [])
                        .map((q: AttemptQuestion, idx: number) => ({ q, idx }))
                        .filter(({ q }) => {
                          if (!filterUngradedOnly) return true;
                          if (isQuestionAutoGraded(q)) return false;
                          const sub = subs.find(
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
                        const sub = subs.find(
                          (s: SubmissionRecord) => s.question_id === q.id,
                        );
                        const isAuto = isQuestionAutoGraded(q);
                        const isCurrent = activeQuestionIndex === idx;

                        return (
                          <button
                            key={q.id}
                            onClick={() => handleSelectQuestion(idx)}
                            className={cn(
                              "w-full p-2.5 rounded-xl border text-left text-xs transition-all relative flex items-center justify-between gap-2",
                              isCurrent
                                ? "border-primary/60 bg-primary/10 text-primary font-medium shadow-2xs ring-1 ring-primary/20"
                                : "border-border/40 bg-card/60 text-foreground hover:bg-muted/30",
                            )}
                          >
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="font-semibold truncate flex items-center gap-1.5">
                                <span>Q{idx + 1}</span>
                                <span className="text-[10px] text-muted-foreground font-normal truncate">
                                  {q.type?.replace(/_/g, " ") || "Essay"}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {sub?.score !== undefined && sub?.score !== null
                                  ? `${sub.score} / ${q.marks || DEFAULT_QUESTION_MAX_MARKS} pts`
                                  : `${q.marks || DEFAULT_QUESTION_MAX_MARKS} pts max`}
                              </div>
                            </div>
                            <div className="shrink-0">
                              {isAuto ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[8px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 px-1 py-0"
                                >
                                  Auto
                                </Badge>
                              ) : sub?.is_final ? (
                                <Badge className="text-[8px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 px-1 py-0">
                                  Graded
                                </Badge>
                              ) : sub && !sub.is_final ? (
                                <Badge className="text-[8px] font-mono font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 px-1 py-0">
                                  Draft
                                </Badge>
                              ) : (
                                <Badge className="text-[8px] font-mono font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 px-1 py-0">
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
                /* Desktop Slim Icon Rail when Left Sidebar is collapsed */
                <div className="w-11 flex flex-col items-center py-3 gap-2 overflow-y-auto h-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => setIsLeftSidebarOpen(true)}
                    title="Expand Questions Navigation (Alt+[)"
                  >
                    <PanelLeftOpen className="size-4" />
                  </Button>
                  {(() => {
                    const subs = Array.isArray(activeSubmissions)
                      ? activeSubmissions
                      : [];
                    return (activeAttempt.questions || []).map((q, idx) => {
                      const isCurrent = activeQuestionIndex === idx;
                      const sub = subs.find(
                        (s: SubmissionRecord) => s.question_id === q.id,
                      );
                      const isAuto = isQuestionAutoGraded(q);
                      return (
                        <button
                          key={q.id}
                          onClick={() => handleSelectQuestion(idx)}
                          className={cn(
                            "size-7 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center transition-all relative",
                            isCurrent
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                          )}
                          title={`Question ${idx + 1} (${q.marks} pts)`}
                        >
                          {idx + 1}
                          <span
                            className={cn(
                              "absolute bottom-0.5 right-0.5 size-1 rounded-full",
                              isAuto
                                ? "bg-zinc-400"
                                : sub?.is_final
                                  ? "bg-emerald-500"
                                  : sub && !sub.is_final
                                    ? "bg-indigo-500"
                                    : "bg-amber-500",
                            )}
                          />
                        </button>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* ─── PANE 2: Center Pane - Main Workspace Canvas ─────────────── */}
            <div
              className={cn(
                "flex-1 min-w-0 overflow-y-auto p-3 sm:p-5 lg:p-6 bg-background/50 flex flex-col transition-all duration-300",
                mobileWorkspaceTab !== "canvas" && "hidden lg:flex",
              )}
            >
              {(() => {
                const currentQuestion =
                  activeAttempt.questions?.[activeQuestionIndex];
                const isAutoGraded = isQuestionAutoGraded(currentQuestion);
                const maxMarks =
                  currentQuestion?.marks || DEFAULT_QUESTION_MAX_MARKS;
                const subs = Array.isArray(activeSubmissions)
                  ? activeSubmissions
                  : [];
                const currentSubmission = subs.find(
                  (s: any) => s.question_id === currentQuestion?.id,
                );

                return (
                  <div
                    className={cn(
                      "w-full mx-auto space-y-4 pb-12 transition-all duration-300",
                      !isLeftSidebarOpen && !isRightSidebarOpen
                        ? "max-w-7xl px-0 sm:px-2"
                        : !isLeftSidebarOpen || !isRightSidebarOpen
                          ? "max-w-5xl px-0 sm:px-1"
                          : "max-w-4xl",
                    )}
                  >
                    {/* Question Prompt Card with Collapse Toggle */}
                    <div className="border border-border/50 bg-card/60 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 backdrop-blur-xs">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                            Question Prompt
                          </span>
                          {isAutoGraded && (
                            <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[9px] font-medium py-0.5 px-1.5 flex items-center gap-1">
                              <Award className="size-3" /> Auto-Graded
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-medium font-mono"
                          >
                            Q{activeQuestionIndex + 1} ({maxMarks} pts)
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 rounded-lg text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setIsQuestionPromptCollapsed(
                                !isQuestionPromptCollapsed,
                              )
                            }
                            title={
                              isQuestionPromptCollapsed
                                ? "Expand prompt"
                                : "Collapse prompt"
                            }
                          >
                            {isQuestionPromptCollapsed ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronUp className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {!isQuestionPromptCollapsed && (
                        <div className="space-y-3 animate-in fade-in duration-150">
                          {/* Case scenario context (collapsible) */}
                          {(currentQuestion?.caseStudyContext ||
                            (currentQuestion as any)?.case_study_context) && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/30 p-3 space-y-1.5 text-xs leading-relaxed">
                              <button
                                type="button"
                                onClick={() =>
                                  setIsCaseScenarioCollapsed(
                                    !isCaseScenarioCollapsed,
                                  )
                                }
                                className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300"
                              >
                                <span className="flex items-center gap-1.5">
                                  <BookOpen className="size-3.5" /> Case Scenario Context
                                </span>
                                <span>
                                  {isCaseScenarioCollapsed ? "Expand ▼" : "Collapse ▲"}
                                </span>
                              </button>
                              {!isCaseScenarioCollapsed && (
                                <div className="text-xs leading-relaxed text-amber-950 dark:text-amber-100 font-normal pt-1 border-t border-amber-500/20">
                                  {renderRichMathText(
                                    currentQuestion?.caseStudyContext ||
                                      (currentQuestion as any)
                                        ?.case_study_context,
                                  )}
                                </div>
                              )}
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
                            <div className="pt-1">
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
                            <div className="p-1 border border-border/40 rounded-xl bg-muted/5 inline-block relative max-w-full overflow-hidden mt-1">
                              <Image
                                src={
                                  currentQuestion?.imageUrl ||
                                  (currentQuestion as any)?.image_url ||
                                  ""
                                }
                                alt={
                                  (currentQuestion as any)?.image_alt_text ||
                                  "Question diagram illustration"
                                }
                                width={480}
                                height={270}
                                className="max-h-[240px] rounded-lg object-contain w-auto h-auto"
                                priority={activeQuestionIndex === 0}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Student Answer Canvas */}
                    <div className="border border-border/50 bg-card/60 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 backdrop-blur-xs">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                          Student Response
                        </span>
                        {currentSubmission?.answer_type === "FILE" &&
                          currentSubmission?.file_url && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] font-medium flex items-center gap-1"
                            >
                              <FileText className="size-3" /> File Deliverable
                            </Badge>
                          )}
                      </div>

                      {currentSubmission?.answer_type === "FILE" &&
                        currentSubmission?.file_url && (
                          <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="size-4 text-primary shrink-0" />
                              <div className="min-w-0 font-medium">
                                <p className="text-xs font-medium text-foreground truncate">
                                  {currentSubmission.file_url.split("/").pop() ||
                                    "deliverable_file"}
                                </p>
                              </div>
                            </div>
                            <a
                              href={currentSubmission.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-semibold text-primary hover:underline shrink-0"
                            >
                              Download File
                            </a>
                          </div>
                        )}

                      <div className="text-xs sm:text-sm font-sans leading-relaxed bg-muted/10 p-3 sm:p-4 rounded-xl border border-border/40 max-h-[500px] overflow-y-auto">
                        <SpeedGraderStudentAnswerCanvas
                          currentQuestion={currentQuestion}
                          currentSubmission={currentSubmission}
                          maxMarks={maxMarks}
                        />
                      </div>
                    </div>

                    {/* Rubric Criteria Reference Matrix (Collapsible) */}
                    {currentQuestion?.rubric && (
                      <div className="border border-border/50 bg-card/60 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 backdrop-blur-xs">
                        <div className="flex items-center justify-between border-b border-border/30 pb-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Rubric Criteria Reference Matrix
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 rounded-lg text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setIsRubricReferenceCollapsed(
                                !isRubricReferenceCollapsed,
                              )
                            }
                            title={
                              isRubricReferenceCollapsed
                                ? "Expand rubric"
                                : "Collapse rubric"
                            }
                          >
                            {isRubricReferenceCollapsed ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronUp className="size-4" />
                            )}
                          </Button>
                        </div>

                        {!isRubricReferenceCollapsed && (
                          <div className="space-y-3 animate-in fade-in duration-150">
                            {currentQuestion.rubric.criteria.map((c: any) => (
                              <div
                                key={c.id}
                                className="space-y-1.5 text-xs border-b last:border-b-0 pb-3 last:pb-0"
                              >
                                <div className="flex items-center justify-between font-semibold">
                                  <span>{renderRichMathText(c.title)}</span>
                                  <span className="text-primary font-mono text-xs">
                                    {c.max_marks} pts
                                  </span>
                                </div>
                                {c.description && (
                                  <p className="text-[11px] text-muted-foreground leading-normal font-normal">
                                    {renderRichMathText(c.description)}
                                  </p>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                                  {c.levels?.map((lvl: any) => (
                                    <div
                                      key={lvl.id}
                                      className="p-2.5 border border-border/40 rounded-xl bg-muted/10 text-[11px] leading-normal space-y-1"
                                    >
                                      <div className="font-medium flex justify-between">
                                        <span>{renderRichMathText(lvl.title)}</span>
                                        <span className="text-primary font-mono font-bold">
                                          {lvl.marks} pts
                                        </span>
                                      </div>
                                      {lvl.description && (
                                        <p className="text-muted-foreground font-normal line-clamp-3">
                                          {renderRichMathText(lvl.description)}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lecturer Evaluation & Decision Card (Central on Desktop) */}
                    {isAutoGraded ? (
                      <div className="border border-border/50 bg-muted/10 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 backdrop-blur-xs">
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="size-4 text-emerald-500" />
                          <span>Auto-Graded Deterministic Question</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed font-normal">
                          This question is evaluated deterministically by the testing engine.
                        </p>
                        <div className="p-3 bg-card border rounded-xl flex justify-between items-center text-xs">
                          <span className="font-medium text-muted-foreground">
                            Recorded Score
                          </span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {currentSubmission?.score !== null &&
                            currentSubmission?.score !== undefined
                              ? `${currentSubmission.score} / ${maxMarks} pts`
                              : `Pending / ${maxMarks} pts`}
                          </span>
                        </div>
                      </div>
                    ) : currentSubmission ? (
                      <div className="border border-border/50 bg-card/60 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4 backdrop-blur-xs">
                        <div className="flex items-center justify-between border-b border-border/30 pb-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                            Lecturer Final Grade & Feedback
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Max {maxMarks} pts
                          </span>
                        </div>

                        <div className="space-y-4">
                          {/* Score Input & Quick Mark Preset Chips */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label
                                htmlFor="individual-score-input"
                                className="text-xs font-medium text-muted-foreground"
                              >
                                Awarded Score
                              </Label>
                              {/* Quick Presets */}
                              <div className="flex items-center gap-1">
                                {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                                  const presetVal = (maxMarks * pct).toFixed(
                                    Number.isInteger(maxMarks * pct) ? 0 : 1,
                                  );
                                  return (
                                    <button
                                      key={pct}
                                      type="button"
                                      onClick={() => {
                                        setOverrideScore(presetVal);
                                        setIsEditing(true);
                                        setIsAiAccepted(false);
                                        triggerDebouncedAutosave(
                                          presetVal,
                                          finalFeedback,
                                          rubricScores,
                                        );
                                      }}
                                      className="px-1.5 py-0.5 text-[9px] font-mono font-medium rounded-md bg-muted/40 hover:bg-primary/10 hover:text-primary transition-colors border border-border/30"
                                    >
                                      {pct === 0
                                        ? "0"
                                        : pct === 1
                                          ? `${maxMarks}p`
                                          : `${Math.round(pct * 100)}%`}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <Input
                              id="individual-score-input"
                              type="number"
                              min={0}
                              max={maxMarks}
                              step="any"
                              placeholder={`Enter score (0 - ${maxMarks})...`}
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
                              className="h-9 text-xs rounded-xl font-mono font-bold w-full bg-background"
                            />
                          </div>

                          {/* Feedback Input & Quick Feedback Suggestions */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label
                                htmlFor="individual-feedback-input"
                                className="text-xs font-medium text-muted-foreground"
                              >
                                Feedback Comments for Student
                              </Label>
                              <span className="text-[10px] text-muted-foreground">
                                Visible on release
                              </span>
                            </div>

                            <Textarea
                              id="individual-feedback-input"
                              placeholder="Provide constructive feedback comments..."
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
                              className="min-h-[85px] text-xs rounded-xl w-full font-normal bg-background"
                            />
                          </div>

                          {/* Action Buttons */}
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
                                        <span>Accept AI Suggestion ({aiSug.score} pts)</span>
                                      </Button>
                                      <div className="grid grid-cols-2 gap-2">
                                        <Button
                                          variant="outline"
                                          onClick={() => {
                                            setIsEditing(true);
                                            setIsAiAccepted(false);
                                          }}
                                          disabled={isSaving}
                                          className="h-8 text-xs font-medium rounded-xl border-border/80 text-foreground hover:bg-muted/50"
                                        >
                                          Manual Override
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
                                          className="h-8 text-xs font-medium rounded-xl border-rose-500/20 text-rose-600 hover:bg-rose-500/5"
                                        >
                                          Clear & Re-evaluate
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
                                      Enter Grade & Feedback
                                    </Button>
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
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

            {/* ─── PANE 3: Right Sidebar - Collapsible AI & Review Panel ─────── */}
            <div
              className={cn(
                "border-l border-border/50 bg-card/40 backdrop-blur-xs flex flex-col shrink-0 transition-all duration-200",
                // Mobile visibility based on mobileWorkspaceTab
                mobileWorkspaceTab === "grading"
                  ? "w-full flex lg:w-80 xl:w-96"
                  : "hidden lg:flex",
                // Desktop collapse mode
                !isRightSidebarOpen && "lg:w-11 lg:overflow-hidden",
                isRightSidebarOpen && "lg:w-80 xl:w-96",
              )}
            >
              {isRightSidebarOpen || mobileWorkspaceTab === "grading" ? (
                <div className="flex flex-col h-full overflow-hidden w-full">
                  <div className="p-3 border-b border-border/30 flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" /> AI Review & Audit
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 rounded-lg text-muted-foreground hover:text-foreground hidden lg:flex"
                      onClick={() => setIsRightSidebarOpen(false)}
                      title="Collapse review panel (Alt+])"
                    >
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
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
                      <div className="space-y-3">
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
                      </div>
                    ) : (
                      <div className="p-4 rounded-2xl border border-dashed border-border/60 text-center text-xs text-muted-foreground italic">
                        Auto-graded questions do not require AI grading evaluation.
                      </div>
                    )}

                    {/* Interactive Rubric Scoring Drawer (if question has rubric) */}
                    {activeAttempt.questions?.[activeQuestionIndex]?.rubric && (
                      <CollapsibleDrawerSection
                        title="Interactive Rubric Matrix"
                        icon={Sliders}
                        defaultOpen={true}
                      >
                        <RubricGradingPanel
                          rubric={
                            activeAttempt.questions[activeQuestionIndex].rubric!
                          }
                          currentScores={rubricScores}
                          onScoresChange={(scores) => {
                            setRubricScores(scores);
                            const totalFromRubric = scores.reduce(
                              (a, b) => a + (b.score ?? b.marks_awarded ?? 0),
                              0,
                            );
                            setOverrideScore(totalFromRubric.toString());
                            setIsEditing(true);
                            setIsAiAccepted(false);
                            triggerDebouncedAutosave(
                              totalFromRubric.toString(),
                              finalFeedback,
                              scores,
                            );
                          }}
                          readOnly={!isEditing}
                        />
                      </CollapsibleDrawerSection>
                    )}

                    {/* Integrity Flags Drawer */}
                    <CollapsibleDrawerSection
                      title="Integrity & Proctoring Signals"
                      icon={ShieldAlert}
                      defaultOpen={true}
                    >
                      <div className="space-y-3 leading-normal">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2.5 border border-border/40 rounded-xl bg-card/60 space-y-0.5">
                            <div className="text-[9px] uppercase font-medium text-muted-foreground">
                              Tab Switches
                            </div>
                            <div className="text-sm font-bold text-foreground font-mono">
                              {activeAttempt.tab_switch_count || 0}
                            </div>
                          </div>
                          <div className="p-2.5 border border-border/40 rounded-xl bg-card/60 space-y-0.5">
                            <div className="text-[9px] uppercase font-medium text-muted-foreground">
                              Fullscreen Exits
                            </div>
                            <div className="text-sm font-bold text-foreground font-mono">
                              {activeAttempt.fullscreen_exit_count || 0}
                            </div>
                          </div>
                          <div className="p-2.5 border border-border/40 rounded-xl bg-card/60 space-y-0.5">
                            <div className="text-[9px] uppercase font-medium text-muted-foreground">
                              Copy Events
                            </div>
                            <div className="text-sm font-bold text-foreground font-mono">
                              {activeAttempt.copy_attempt_count || 0}
                            </div>
                          </div>
                          <div className="p-2.5 border border-border/40 rounded-xl bg-card/60 space-y-0.5">
                            <div className="text-[9px] uppercase font-medium text-muted-foreground">
                              Drops
                            </div>
                            <div className="text-sm font-bold text-foreground font-mono">
                              {activeAttempt.reconnect_count || 0}
                            </div>
                          </div>
                        </div>

                        {activeAttempt.integrity_hold && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex flex-col gap-2 text-xs text-rose-700 dark:text-rose-400">
                            <div className="flex gap-2">
                              <Lock className="size-4 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold">Security Hold Active</p>
                                <p className="text-[11px] mt-0.5 leading-normal font-normal">
                                  {activeAttempt.integrity_hold_reason ||
                                    "Placed on institutional hold."}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-[11px] border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg font-medium"
                              onClick={() => setShowIntegrityLiftDialog(true)}
                              disabled={isSaving}
                            >
                              <Unlock className="size-3 mr-1.5" /> Lift Security Hold
                            </Button>
                          </div>
                        )}

                        <div className="pt-2 border-t border-border/30 flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">
                            Manual Flag State
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
                            {selectedStudent?.is_flagged ? "Unflag Attempt" : "Flag for Review"}
                          </Button>
                        </div>
                      </div>
                    </CollapsibleDrawerSection>
                  </div>
                </div>
              ) : (
                /* Desktop Slim Icon Rail when Right Sidebar is collapsed */
                <div className="w-11 flex flex-col items-center py-3 gap-2 overflow-y-auto h-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => setIsRightSidebarOpen(true)}
                    title="Expand Review Panel (Alt+])"
                  >
                    <PanelRightOpen className="size-4" />
                  </Button>
                  <div className="h-px w-6 bg-border/40 my-1" />
                  <button
                    onClick={() => setIsRightSidebarOpen(true)}
                    className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                    title="AI Evaluation"
                  >
                    <Sparkles className="size-4" />
                  </button>
                  <button
                    onClick={() => setIsRightSidebarOpen(true)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors"
                    title="Integrity Flags"
                  >
                    <ShieldAlert className="size-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : /* ─── RENDERING PATH 1: GROUP SPEEDGRADER ───────────────────── */
      selectedGroupSubmission ? (
        <div className="min-h-screen bg-background flex flex-col font-sans text-foreground animate-in fade-in duration-300">
          {/* Sticky Group SpeedGrader Header */}
          <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-md px-3 sm:px-5 py-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              {/* Left Group info & carousel */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseGroupWorkspace}
                  className="h-8 px-2.5 border border-border/60 rounded-xl hover:bg-muted/50 text-xs font-medium shrink-0"
                >
                  <X className="size-3.5 mr-1" />
                  <span className="hidden sm:inline">Close</span>
                </Button>

                {/* Group Carousel Switcher */}
                <div className="flex items-center gap-1 bg-muted/20 border border-border/40 rounded-xl p-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePreviousGroup}
                    disabled={currentGroupQueueIndex <= 0}
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Previous Group"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-[11px] font-mono font-semibold px-1 text-foreground whitespace-nowrap">
                    {currentGroupQueueIndex >= 0
                      ? `${currentGroupQueueIndex + 1} / ${filteredGroupQueue.length}`
                      : "—"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNextGroup}
                    disabled={
                      currentGroupQueueIndex >= filteredGroupQueue.length - 1
                    }
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Next Group"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1">
                  <h1 className="text-xs sm:text-sm font-semibold text-foreground leading-tight truncate flex items-center gap-1.5">
                    <span className="truncate">{selectedGroupSubmission.group_name}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] font-medium bg-indigo-500/5 text-indigo-600 border-indigo-500/20 shrink-0"
                    >
                      <Users className="size-2.5 mr-1" />
                      {selectedGroupSubmission.members?.length || 0} Members
                    </Badge>
                  </h1>
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate font-normal">
                    {selectedAssessment?.title} • Score:{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {selectedGroupSubmission.total_score ??
                        selectedGroupSubmission.score ??
                        0}
                    </span>{" "}
                    /{" "}
                    {selectedAssessment?.total_marks ||
                      selectedGroupSubmission.max_score ||
                      DEFAULT_ASSESSMENT_TOTAL_MARKS}{" "}
                    pts
                  </p>
                </div>
              </div>

              {/* Right group buttons */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {selectedGroupSubmission.status === "GRADED" &&
                  !(
                    selectedGroupSubmission.is_released ||
                    selectedGroupSubmission.result_released_at
                  ) && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleReleaseGroupResult}
                      disabled={releasingGroupResult}
                      className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1"
                    >
                      {releasingGroupResult ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Send className="size-3" />
                      )}
                      <span>Release Marks</span>
                    </Button>
                  )}

                {/* Sidebar toggles on desktop */}
                <div className="hidden lg:flex items-center gap-0.5 border border-border/60 rounded-xl p-0.5 bg-muted/10">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setIsGroupLeftSidebarOpen(!isGroupLeftSidebarOpen)
                    }
                    className={cn(
                      "h-7 px-2 text-xs font-medium rounded-lg",
                      isGroupLeftSidebarOpen
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground",
                    )}
                  >
                    {isGroupLeftSidebarOpen ? (
                      <PanelLeftClose className="size-3.5" />
                    ) : (
                      <PanelLeftOpen className="size-3.5" />
                    )}
                    <span className="ml-1 text-[11px]">Nav</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setIsGroupRightSidebarOpen(!isGroupRightSidebarOpen)
                    }
                    className={cn(
                      "h-7 px-2 text-xs font-medium rounded-lg",
                      isGroupRightSidebarOpen
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground",
                    )}
                  >
                    {isGroupRightSidebarOpen ? (
                      <PanelRightClose className="size-3.5" />
                    ) : (
                      <PanelRightOpen className="size-3.5" />
                    )}
                    <span className="ml-1 text-[11px]">AI & Score</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Mobile View Switcher for Group SpeedGrader */}
            <div className="flex lg:hidden items-center justify-between border-t border-border/30 pt-1.5 gap-1">
              <div className="grid grid-cols-3 w-full bg-muted/20 p-0.5 rounded-xl border border-border/40">
                <button
                  onClick={() => setMobileWorkspaceTab("questions")}
                  className={cn(
                    "py-1 text-[11px] font-medium rounded-lg transition-all flex items-center justify-center gap-1",
                    mobileWorkspaceTab === "questions"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <AlignLeft className="size-3" />
                  <span>
                    Questions ({selectedGroupSubmission.questions?.length || 0})
                  </span>
                </button>

                <button
                  onClick={() => setMobileWorkspaceTab("canvas")}
                  className={cn(
                    "py-1 text-[11px] font-medium rounded-lg transition-all flex items-center justify-center gap-1",
                    mobileWorkspaceTab === "canvas"
                      ? "bg-card text-foreground shadow-2xs font-semibold text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <FileText className="size-3" />
                  <span>Q{groupGraderActiveQuestionIndex + 1} Answer</span>
                </button>

                <button
                  onClick={() => setMobileWorkspaceTab("grading")}
                  className={cn(
                    "py-1 text-[11px] font-medium rounded-lg transition-all flex items-center justify-center gap-1",
                    mobileWorkspaceTab === "grading"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Sparkles className="size-3" />
                  <span>Evaluation</span>
                </button>
              </div>
            </div>
          </header>

          {/* Group SpeedGrader Canvas */}
          <div className="flex-1 flex overflow-hidden h-[calc(100vh-105px)] lg:h-[calc(100vh-60px)]">
            {/* Left Sidebar - Group Questions / Roster / Activity */}
            <div
              className={cn(
                "border-r border-border/50 bg-card/40 backdrop-blur-xs flex flex-col shrink-0 transition-all duration-200",
                mobileWorkspaceTab === "questions"
                  ? "w-full flex lg:w-64 lg:w-72"
                  : "hidden lg:flex",
                !isGroupLeftSidebarOpen && "lg:w-11 lg:overflow-hidden",
                isGroupLeftSidebarOpen && "lg:w-64 lg:w-72",
              )}
            >
              {isGroupLeftSidebarOpen || mobileWorkspaceTab === "questions" ? (
                <div className="flex flex-col h-full overflow-hidden w-full">
                  <div className="p-2 border-b border-border/40 bg-background/50 shrink-0">
                    <div className="grid grid-cols-3 gap-1 bg-muted/30 p-0.5 rounded-xl border border-border/40">
                      <button
                        onClick={() => setActiveGroupTab("questions")}
                        className={cn(
                          "py-1 text-[11px] font-medium rounded-lg transition-colors",
                          activeGroupTab === "questions"
                            ? "bg-card text-foreground shadow-2xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Questions
                      </button>
                      <button
                        onClick={() => setActiveGroupTab("roster")}
                        className={cn(
                          "py-1 text-[11px] font-medium rounded-lg transition-colors",
                          activeGroupTab === "roster"
                            ? "bg-card text-foreground shadow-2xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Roster
                      </button>
                      <button
                        onClick={() => setActiveGroupTab("activity")}
                        className={cn(
                          "py-1 text-[11px] font-medium rounded-lg transition-colors",
                          activeGroupTab === "activity"
                            ? "bg-card text-foreground shadow-2xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Activity
                      </button>
                    </div>
                  </div>

                  {activeGroupTab === "questions" && (
                    <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
                      {(selectedGroupSubmission.questions || []).map(
                        (q: any, idx: number) => {
                          const ans = selectedGroupSubmission.answers?.find(
                            (a: any) => a.question_id === q.id,
                          );
                          const isCurrent =
                            groupGraderActiveQuestionIndex === idx;
                          return (
                            <button
                              key={q.id || idx}
                              onClick={() => handleGroupQuestionSelect(idx)}
                              className={cn(
                                "w-full text-left p-2.5 rounded-xl border transition-all flex flex-col gap-1",
                                isCurrent
                                  ? "border-primary/60 bg-primary/10 shadow-2xs ring-1 ring-primary/20"
                                  : "border-border/40 bg-card/60 hover:bg-muted/30 text-foreground",
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs text-foreground flex items-center gap-1">
                                  <span>Q{idx + 1}</span>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] font-mono px-1 py-0 uppercase text-muted-foreground"
                                  >
                                    {q.question_type || q.type || "QUESTION"}
                                  </Badge>
                                </span>
                                <span className="text-[10px] font-mono font-medium text-primary">
                                  {ans?.score !== undefined && ans?.score !== null
                                    ? `${ans.score} / ${q.marks || DEFAULT_QUESTION_MAX_MARKS} pts`
                                    : `${q.marks || DEFAULT_QUESTION_MAX_MARKS} pts`}
                                </span>
                              </div>
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}

                  {activeGroupTab === "roster" && (
                    <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                      {(selectedGroupSubmission.members || []).map((m: any) => (
                        <div
                          key={m.student_id}
                          className="p-2.5 rounded-xl border border-border/40 bg-card/60 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {m.student_name}
                              {m.is_leader && (
                                <Badge className="ml-1 text-[8px] bg-amber-500/10 text-amber-600 border-amber-500/20 px-1 py-0">
                                  Leader
                                </Badge>
                              )}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {m.student_email}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeGroupTab === "activity" && (
                    <div className="flex-1 overflow-y-auto p-3 text-xs text-muted-foreground italic text-center">
                      No live integrity anomalies recorded for this group.
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-11 flex flex-col items-center py-3 gap-2 overflow-y-auto h-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => setIsGroupLeftSidebarOpen(true)}
                  >
                    <PanelLeftOpen className="size-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Central Canvas: Group Work Submission */}
            <div
              className={cn(
                "flex-1 min-w-0 overflow-y-auto p-3 sm:p-5 lg:p-6 bg-background/50 flex flex-col transition-all duration-300",
                mobileWorkspaceTab !== "canvas" && "hidden lg:flex",
              )}
            >
              {(() => {
                const currentQuestion =
                  selectedGroupSubmission.questions?.[
                    groupGraderActiveQuestionIndex
                  ];
                const currentAnswer = selectedGroupSubmission.answers?.find(
                  (a: any) => a.question_id === currentQuestion?.id,
                );

                return (
                  <div
                    className={cn(
                      "w-full mx-auto space-y-4 pb-12 transition-all duration-300",
                      !isGroupLeftSidebarOpen && !isGroupRightSidebarOpen
                        ? "max-w-7xl px-0 sm:px-2"
                        : !isGroupLeftSidebarOpen || !isGroupRightSidebarOpen
                          ? "max-w-5xl px-0 sm:px-1"
                          : "max-w-4xl",
                    )}
                  >
                    {/* Question Prompt */}
                    <div className="border border-border/50 bg-card/60 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 backdrop-blur-xs">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                          Question Prompt
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-medium font-mono"
                        >
                          Q{groupGraderActiveQuestionIndex + 1} (
                          {currentQuestion?.marks || DEFAULT_QUESTION_MAX_MARKS} pts)
                        </Badge>
                      </div>

                      <div className="text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap font-normal">
                        {renderRichMathText(
                          currentQuestion?.text ||
                            currentQuestion?.content ||
                            "",
                        )}
                      </div>
                    </div>

                    {/* Group Answer Canvas */}
                    <div className="border border-border/50 bg-card/60 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 backdrop-blur-xs">
                      <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                          Submitted Group Deliverable
                        </span>
                      </div>

                      <div className="text-xs sm:text-sm font-sans leading-relaxed bg-muted/10 p-3 sm:p-4 rounded-xl border border-border/40 max-h-[500px] overflow-y-auto">
                        <SpeedGraderStudentAnswerCanvas
                          currentQuestion={currentQuestion}
                          currentSubmission={currentAnswer}
                          maxMarks={
                            currentQuestion?.marks || DEFAULT_QUESTION_MAX_MARKS
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Right Sidebar - Group Evaluation */}
            <div
              className={cn(
                "border-l border-border/50 bg-card/40 backdrop-blur-xs flex flex-col shrink-0 transition-all duration-200",
                mobileWorkspaceTab === "grading"
                  ? "w-full flex lg:w-80 xl:w-96"
                  : "hidden lg:flex",
                !isGroupRightSidebarOpen && "lg:w-11 lg:overflow-hidden",
                isGroupRightSidebarOpen && "lg:w-80 xl:w-96",
              )}
            >
              {isGroupRightSidebarOpen || mobileWorkspaceTab === "grading" ? (
                <div className="flex flex-col h-full overflow-hidden w-full">
                  <div className="p-3 border-b border-border/30 flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" /> Group Evaluation
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 rounded-lg text-muted-foreground hover:text-foreground hidden lg:flex"
                      onClick={() => setIsGroupRightSidebarOpen(false)}
                    >
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
                    {(() => {
                      const currentQ =
                        selectedGroupSubmission.questions?.[
                          groupGraderActiveQuestionIndex
                        ];
                      const currentAns = selectedGroupSubmission.answers?.find(
                        (a: any) => a.question_id === currentQ?.id,
                      );

                      return (
                        <div className="space-y-3">
                          <AIReviewPanel
                            isGroupWork={true}
                            groupSubmissionId={selectedGroupSubmission.id}
                            groupQuestionId={currentQ?.id}
                            groupAnswerData={currentAns}
                            maxScore={
                              currentQ?.marks || DEFAULT_QUESTION_MAX_MARKS
                            }
                            onSuggestionApplied={(score, feedback) => {
                              setGroupQuestionScores((prev) => ({
                                ...prev,
                                [currentQ.id]: score.toString(),
                              }));
                              if (feedback) {
                                setGroupQuestionFeedback((prev) => ({
                                  ...prev,
                                  [currentQ.id]: feedback,
                                }));
                              }
                              setIsGroupAiAccepted(true);
                              toast.success("AI score applied to question.");
                            }}
                          />

                          <AIFeedbackEditor
                            isGroupWork={true}
                            groupSubmissionId={selectedGroupSubmission.id}
                            groupQuestionId={currentQ?.id}
                            initialDraft={
                              groupQuestionFeedback[currentQ?.id] ||
                              currentAns?.feedback_comments ||
                              ""
                            }
                            onDraftApplied={(draft) => {
                              setGroupQuestionFeedback((prev) => ({
                                ...prev,
                                [currentQ.id]: draft,
                              }));
                            }}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="w-11 flex flex-col items-center py-3 gap-2 overflow-y-auto h-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => setIsGroupRightSidebarOpen(true)}
                  >
                    <PanelRightOpen className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ─── RENDERING PATH 3: REVIEW QUEUE NAVIGATION HIERARCHY ────────────────── */
        <div
          data-tour="lecturer-grading"
          className="w-full space-y-4 p-1 sm:p-3 lg:p-4 max-w-full 2xl:max-w-[1800px] mx-auto font-sans transition-all duration-300 min-w-0"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Assessment Grading & Evaluation Hub
                {data.some(
                  (item) =>
                    item.status === "PENDING" || item.status === "AI_SUGGESTED",
                ) && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 font-normal">
                Navigate workspaces, select assessments, evaluate student submissions, and release verified grades.
              </p>
            </div>
          </div>

          {/* Breadcrumbs for Hierarchy Navigation */}
          {(selectedWorkspace || selectedAssessment || selectedClass) && (
            <div className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground mb-2 flex-wrap bg-muted/20 p-2 rounded-xl border border-border/40">
              <button
                onClick={handleBackToWorkspaces}
                className="hover:text-primary transition-colors flex items-center gap-1 font-medium px-1.5 py-0.5 rounded-lg hover:bg-background"
              >
                <School className="size-3.5 text-muted-foreground/70" />
                <span>Workspaces</span>
              </button>

              {selectedWorkspace && (
                <>
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                  <button
                    onClick={handleBackToAssessments}
                    className="hover:text-primary transition-colors font-medium px-1.5 py-0.5 rounded-lg hover:bg-background"
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
                      "font-medium px-1.5 py-0.5 rounded-lg",
                      !selectedAssessment.is_group_assessment &&
                        "hover:text-primary hover:bg-background transition-colors",
                    )}
                  >
                    {selectedAssessment.title}
                    {selectedAssessment.is_group_assessment && (
                      <Badge
                        variant="outline"
                        className="text-[9px] font-medium bg-indigo-500/5 text-indigo-600 border-indigo-500/20 ml-1.5"
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
                  <span className="text-foreground font-semibold px-1.5 py-0.5 bg-background rounded-lg border border-border/40">
                    {selectedClass.class_name}
                  </span>
                </>
              )}
            </div>
          )}

          {/* STEP A: WORKSPACES LIST */}
          {!selectedWorkspace ? (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Teaching Workspace ({workspaces.length})
                </span>
              </div>

              {/* Desktop Table View */}
              <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs hidden md:block">
                <Table>
                  <TableHeader className="bg-muted/15 border-b border-border/40">
                    <TableRow className="h-10 hover:bg-transparent border-none">
                      <TableHead className="text-[11px] font-medium px-6 text-muted-foreground uppercase tracking-wider">
                        Institution
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Teaching Workspace
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Class Section
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Students
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Avg Perf.
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
                        key={ws.id}
                        className="group hover:bg-primary/[0.02] h-13 border-border/20 transition-colors cursor-pointer"
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
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards View (< 768px) */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {workspaces.map((ws: WorkspaceListItem) => (
                  <div
                    key={ws.id}
                    onClick={() => handleSelectWorkspace(ws)}
                    className="p-3.5 border border-border/50 rounded-2xl bg-card/60 space-y-2 cursor-pointer hover:border-primary/40 active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className="text-[9px] font-medium bg-primary/5 text-primary border-primary/20"
                      >
                        {ws.institution_name}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        {ws.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {ws.class_name} • {ws.student_count} students
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/30">
                      <span className="text-muted-foreground">Class Avg</span>
                      <span className="font-mono font-bold text-emerald-600">
                        {ws.performance_avg}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : /* STEP B: ASSESSMENTS LIST */
          !selectedAssessment ? (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Assessment in {selectedWorkspace.title} ({assessments.length})
                </span>
              </div>

              {/* Desktop Table View */}
              <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs hidden md:block">
                <Table>
                  <TableHeader className="bg-muted/15 border-b border-border/40">
                    <TableRow className="h-10 hover:bg-transparent border-none">
                      <TableHead className="text-[11px] font-medium px-6 text-muted-foreground uppercase tracking-wider">
                        Type
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Assessment Title
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Total Marks
                      </TableHead>
                      <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                        Grading Mode
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
                        key={asmt.id}
                        className="group hover:bg-primary/[0.02] h-13 border-border/20 transition-colors cursor-pointer"
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
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards View (< 768px) */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {assessments.map((asmt: AssessmentSummary) => (
                  <div
                    key={asmt.id}
                    onClick={() => handleSelectAssessment(asmt)}
                    className="p-3.5 border border-border/50 rounded-2xl bg-card/60 space-y-2 cursor-pointer hover:border-primary/40 active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className="text-[9px] font-medium bg-indigo-500/5 text-indigo-600 border-indigo-500/20"
                      >
                        {asmt.assessment_type.replace("_", " ")}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        {asmt.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {asmt.total_marks} pts • {asmt.grading_mode} mode
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : /* STEP C (GROUP WORK QUEUE) */
          selectedAssessment.is_group_assessment ? (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border border-border/50 bg-card/40 rounded-2xl backdrop-blur-xs">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search groups or members..."
                    value={groupSearch}
                    onChange={(e) => handleGroupSearchChange(e.target.value)}
                    className="pl-8 pr-8 h-8 text-xs rounded-xl bg-background"
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
                <div className="text-xs text-muted-foreground font-normal">
                  {filteredGroupQueue.length} groups submitted
                </div>
              </div>

              {/* Desktop Group Table */}
              <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs hidden md:block">
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
                          {item.members && item.members.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.members.map((m: any) => (
                                <span
                                  key={m.student_id}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted/40 border border-border/40 text-[11px] text-foreground font-normal"
                                >
                                  {m.student_name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60 italic">
                              No members
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-center font-mono text-xs">
                          {item.score !== null && item.score !== undefined
                            ? `${item.score} / ${item.max_score || selectedAssessment?.total_marks || "—"}`
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
                            className="h-7 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg"
                          >
                            Open Grader →
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Group Cards */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {filteredGroupQueue.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleOpenGroupGrader(item)}
                    className="p-3.5 border border-border/50 rounded-2xl bg-card/60 space-y-2 cursor-pointer hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        {item.group_name}
                      </span>
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
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {item.members?.length || 0} members • Score:{" "}
                      {item.score ?? "—"} pts
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : /* STEP C (INDIVIDUAL SECTIONS OVERVIEW) */
          !selectedClass ? (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Aggregated Class Overview Card */}
              {(() => {
                const statsList = Array.isArray(classStats) ? classStats : [];
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
                          {selectedAssessment.title} — Sections Performance
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono font-medium bg-primary/5 text-primary border-primary/20"
                        >
                          {statsList.length} Section{statsList.length === 1 ? "" : "s"}
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

              {/* Class Sections Table & Cards */}
              <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs hidden md:block">
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
                    {(Array.isArray(classStats) ? classStats : []).map(
                      (c: ClassStatRecord) => (
                        <TableRow
                          onClick={() => handleSelectClass(c)}
                          key={c.class_id}
                          className="group hover:bg-primary/[0.02] h-13 border-border/20 transition-colors cursor-pointer"
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
                      ),
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Sections Cards */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {(Array.isArray(classStats) ? classStats : []).map(
                  (c: ClassStatRecord) => (
                    <div
                      key={c.class_id}
                      onClick={() => handleSelectClass(c)}
                      className="p-3.5 border border-border/50 rounded-2xl bg-card/60 space-y-2 cursor-pointer hover:border-primary/40"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">
                          {c.class_name}
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-1">
                        <div className="p-1.5 rounded-lg bg-muted/20">
                          <span className="text-muted-foreground block">Submissions</span>
                          <span className="font-mono font-bold text-foreground">
                            {c.submitted_count}/{c.total_students}
                          </span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-emerald-500/10">
                          <span className="text-emerald-600 block">Graded</span>
                          <span className="font-mono font-bold text-emerald-600">
                            {c.reviewed_count}
                          </span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-amber-500/10">
                          <span className="text-amber-600 block">Pending</span>
                          <span className="font-mono font-bold text-amber-600">
                            {c.pending_review_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : (
            /* STEP D: CLASS SECTION WORKSPACE (QUEUE & RELEASE VIEW) */
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Dashboard Performance Card */}
              <div className="p-3.5 sm:p-4 border border-border/50 bg-card/40 rounded-2xl backdrop-blur-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Activity className="size-4 text-primary" />
                      <h2 className="text-xs sm:text-sm font-semibold text-foreground">
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
                    </p>
                  </div>

                  {/* View Tab Switcher */}
                  <Tabs
                    value={activeStepDView}
                    onValueChange={(v) =>
                      setActiveStepDView(v as "queue" | "release")
                    }
                  >
                    <TabsList className="h-8 p-0.5 rounded-xl">
                      <TabsTrigger
                        value="queue"
                        className="h-7 px-3 text-xs font-medium gap-1 rounded-lg"
                      >
                        <FileText className="size-3" /> Submissions
                      </TabsTrigger>
                      <TabsTrigger
                        value="release"
                        className="h-7 px-3 text-xs font-medium gap-1 rounded-lg"
                      >
                        <Unlock className="size-3" /> Results Release
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
                          ? (classAnalytics.pending / classAnalytics.submitted) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* VIEW TAB 1: SUBMISSIONS QUEUE */}
              {activeStepDView === "queue" && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Filters & Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 border border-border/50 bg-card/40 rounded-2xl backdrop-blur-xs">
                    <div className="flex items-center gap-2 flex-1 min-w-[240px] flex-wrap">
                      <div className="relative flex-1 min-w-[160px]">
                        <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search student..."
                          value={search}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          className="pl-8 pr-8 h-8 text-xs rounded-xl bg-background"
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
                        <SelectTrigger className="w-34 h-8 text-xs rounded-xl">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Submissions</SelectItem>
                          <SelectItem value="PENDING">Awaiting Review</SelectItem>
                          <SelectItem value="AI_SUGGESTED">AI Ready</SelectItem>
                          <SelectItem value="COMPLETED">Graded</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={sortBy} onValueChange={handleSortByChange}>
                        <SelectTrigger className="w-40 h-8 text-xs rounded-xl">
                          <SelectValue placeholder="Sort" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="priority_desc">Priority (Flagged First)</SelectItem>
                          <SelectItem value="date_asc">Oldest First</SelectItem>
                          <SelectItem value="date_desc">Newest First</SelectItem>
                          <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="text-xs text-muted-foreground font-normal">
                      {groupedSubmissions.length} attempts
                    </div>
                  </div>

                  {/* Bulk Actions Toolbar */}
                  {selectedAttemptIds.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 px-4 bg-primary/5 border border-primary/20 rounded-2xl animate-in slide-in-from-top duration-200">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-lg">
                          {selectedAttemptIds.length} Selected
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBulkFlagging}
                          onClick={() => handleBulkFlag(true)}
                          className="h-7 text-xs font-medium rounded-xl border-rose-500/30 text-rose-600 hover:bg-rose-500/10 gap-1"
                        >
                          <Flag className="size-3 text-rose-500" /> Flag
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowBulkAiDialog(true)}
                          className="h-7 text-xs font-medium rounded-xl border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 gap-1"
                        >
                          <Sparkles className="size-3 text-primary" /> Batch AI...
                        </Button>
                        <Button
                          size="sm"
                          disabled={isReleasing}
                          onClick={requestBulkReleaseSelected}
                          className="h-7 text-xs font-medium rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        >
                          <Send className="size-3" /> Release
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedAttemptIds([])}
                          className="h-7 text-xs font-normal text-muted-foreground"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Desktop Submissions Table */}
                  <div className="border border-border/50 rounded-2xl overflow-hidden bg-card/40 backdrop-blur-xs shadow-2xs hidden md:block">
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
                              aria-label="Select all"
                            />
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Student Name
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            Progress & Review
                          </TableHead>
                          <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                            Integrity Risk
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
                          const gradedQ = group.filter((i) => i.is_final).length;
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
                                    {riskScore}%
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
                                  className="h-7 text-xs font-medium text-primary hover:bg-primary/10 rounded-xl"
                                >
                                  SpeedGrader →
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Submissions Cards (< 768px) */}
                  <div className="grid grid-cols-1 gap-2.5 md:hidden">
                    {groupedSubmissions.map((group) => {
                      const first = group[0];
                      const totalQ = group.length;
                      const gradedQ = group.filter((i) => i.is_final).length;
                      const hasAiSuggestion = group.some(
                        (i) => getAiSuggestion(i).hasSuggestion,
                      );
                      const isFlagged = group.some((i) => i.is_flagged);

                      return (
                        <div
                          key={first.attempt_id}
                          onClick={() => handleOpenIndividualGrader(first)}
                          className={cn(
                            "p-3.5 border border-border/50 rounded-2xl bg-card/60 space-y-2 cursor-pointer hover:border-primary/40",
                            isFlagged && "border-rose-500/30 bg-rose-500/5",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-foreground">
                                {first.student_name}
                              </span>
                              {isFlagged && (
                                <Badge className="text-[8px] bg-rose-500/10 text-rose-600 border-rose-500/20 px-1 py-0">
                                  Flag
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-primary font-medium">
                              Grade →
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                            <span>
                              Progress:{" "}
                              <strong className="text-foreground font-mono">
                                {gradedQ}/{totalQ}
                              </strong>
                            </span>
                            {hasAiSuggestion && (
                              <span className="text-indigo-600 flex items-center gap-1">
                                <Sparkles className="size-3" /> AI Ready
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* VIEW TAB 2: UNIFIED RELEASE QUEUE */}
              {activeStepDView === "release" && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border border-border/50 bg-card/40 rounded-2xl backdrop-blur-xs">
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
                            item.integrity_hold ||
                            item.status === "INTEGRITY_HOLD";
                          const isReady =
                            (item.can_release ||
                              item.status === "PENDING_RELEASE") &&
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
                                        ? "READY TO RELEASE"
                                        : "PENDING"}
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
                                        toast.success(
                                          "Result published successfully",
                                        );
                                        loadReleaseQueue(
                                          selectedAssessment.id,
                                          selectedClass.class_id,
                                        );
                                      } catch {
                                        toast.error("Failed to publish result");
                                      }
                                    }}
                                    className="h-7 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                                  >
                                    Publish
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      <Dialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog}>
        <DialogContent className="max-w-md bg-background border border-border/60 rounded-2xl shadow-2xl p-5 text-left font-sans">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Keyboard className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  SpeedGrader Shortcuts
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  High-throughput shortcuts for rapid grading.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 my-2 text-xs">
            <div className="rounded-xl border border-border/50 divide-y divide-border/30 bg-muted/5 overflow-hidden">
              <div className="flex items-center justify-between p-2 px-3">
                <span className="font-medium text-foreground">
                  Finalize & Auto-Advance
                </span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  ⌘ / Ctrl + Enter
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 px-3">
                <span className="font-medium text-foreground">Save Draft</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  ⌘ / Ctrl + S
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 px-3">
                <span className="font-medium text-foreground">Next / Prev Question</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  Alt + → / ←
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 px-3">
                <span className="font-medium text-foreground">Next / Prev Student</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  Alt + Shift + → / ←
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 px-3">
                <span className="font-medium text-foreground">
                  Jump to Ungraded
                </span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  Alt + U
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 px-3">
                <span className="font-medium text-foreground">
                  Toggle Sidebars
                </span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  Alt + [ or Alt + ]
                </kbd>
              </div>
              <div className="flex items-center justify-between p-2 px-3">
                <span className="font-medium text-foreground">
                  Toggle Focus Mode
                </span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">
                  Alt + F
                </kbd>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 flex justify-end border-t border-border/30 pt-2.5">
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

      {/* Bulk Accept AI Dialog */}
      <Dialog open={showBulkAiDialog} onOpenChange={setShowBulkAiDialog}>
        <DialogContent className="max-w-md bg-background border border-border/60 rounded-2xl shadow-2xl p-5 text-left font-sans">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  Batch Accept AI Suggestions
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Finalize AI grades across {selectedAttemptIds.length} student attempts.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 my-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Minimum AI Confidence
              </Label>
              <Select
                value={bulkAiConfidenceThreshold.toString()}
                onValueChange={(val) =>
                  setBulkAiConfidenceThreshold(parseInt(val))
                }
              >
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">High Confidence Only (≥ 90%)</SelectItem>
                  <SelectItem value="80">Medium-High (≥ 80%)</SelectItem>
                  <SelectItem value="70">Moderate (≥ 70%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-3 flex justify-end gap-2 border-t border-border/30 pt-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkAiDialog(false)}
              className="text-xs rounded-xl h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isBulkApplyingAi}
              onClick={() =>
                handleBulkAcceptAiSuggestions(bulkAiConfidenceThreshold)
              }
              className="text-xs rounded-xl h-8 bg-primary text-primary-foreground gap-1.5"
            >
              {isBulkApplyingAi ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCheck className="size-3.5" />
              )}
              Confirm & Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lift Integrity Hold Dialog */}
      <Dialog
        open={showIntegrityLiftDialog}
        onOpenChange={setShowIntegrityLiftDialog}
      >
        <DialogContent className="max-w-md bg-background border border-border/60 rounded-2xl shadow-2xl p-5 text-left font-sans">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Unlock className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-foreground">
                  Lift Security Hold
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Lifting this hold will re-enable grade release for this attempt.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <DialogFooter className="mt-3 flex justify-end gap-2 border-t border-border/30 pt-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowIntegrityLiftDialog(false)}
              className="text-xs rounded-xl h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleLiftIntegrityHold}
              disabled={isSaving}
              className="text-xs rounded-xl h-8 bg-primary text-primary-foreground"
            >
              Confirm Lift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog before Bulk Release */}
      <Dialog
        open={bulkReleaseDialogOpen}
        onOpenChange={setBulkReleaseDialogOpen}
      >
        <DialogContent className="sm:max-w-md rounded-2xl p-5 font-sans">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Unlock className="size-5 text-emerald-600" />
              Confirm Official Marks Release
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
              You are about to release official assessment marks for{" "}
              <strong className="text-foreground">
                {bulkReleaseAction?.count} student(s)
              </strong>
              . Students will immediately be able to view their final scores,
              breakdowns, and diagnostic feedback.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 mt-3 pt-2.5 border-t border-border/30">
            <Button
              variant="outline"
              size="sm"
              disabled={isReleasing}
              onClick={() => {
                setBulkReleaseDialogOpen(false);
                setBulkReleaseAction(null);
              }}
              className="rounded-xl h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isReleasing}
              onClick={executeBulkRelease}
              className="rounded-xl h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
            >
              {isReleasing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Confirm & Release
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
        <div className="p-3 sm:p-6 space-y-6 font-sans w-full max-w-full 2xl:max-w-[1800px] mx-auto min-w-0 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-7 w-64 rounded-xl" />
              <Skeleton className="h-4 w-96 rounded-xl" />
            </div>
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        </div>
      }
    >
      <LecturerGradingQueueContent />
    </React.Suspense>
  );
}
