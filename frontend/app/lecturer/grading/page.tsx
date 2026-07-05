// app/lecturer/grading/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Search,
  BrainCircuit,
  Users,
  RefreshCcw,
  Clock,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Scale,
  Loader2,
  Send,
  User,
  Layers,
  ArrowUpDown,
  ShieldAlert,
  FileText,
  Check,
  X,
  History,
  AlertTriangle,
  TrendingUp,
  BarChart,
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  School,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce";

import { gradingApi } from "@/lib/api/grading";
import { lecturerApi, WorkspaceListItem } from "@/lib/api/lecturer";
import { assessmentApi } from "@/lib/api/assessment";
import { attemptApi } from "@/lib/api/attempt";
import { submissionApi } from "@/lib/api/submission";
import { resultApi } from "@/lib/api/result";
import { integrityApi } from "@/lib/api/integrity";
import { groupWorkApi } from "@/lib/api/group-work";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { AIReviewPanel } from "@/components/mindexa/grading/ai-review-panel";
import { AIFeedbackEditor } from "@/components/mindexa/grading/ai-feedback-editor";
import { RubricGradingPanel } from "@/components/mindexa/grading/rubric-grading-panel";
import { ModerationPanel } from "@/components/mindexa/grading/moderation-panel";
import { ResultReleasePanel } from "@/components/mindexa/grading/result-release-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface GradingQueueItem {
  id: string;
  student_id: string;
  student_name: string;
  assessment_title: string;
  assessment_id: string;
  question_id: string;
  question_title: string;
  question_type: string;
  attempt_id: string;
  response_id: string;
  status: "PENDING" | "AI_SUGGESTED" | "COMPLETED" | "UNDER_REVIEW" | "PENDING_RELEASE" | "RELEASED";
  submitted_at: string | null;
  student_answer: string | null;
  ai_suggested_score: number | null;
  ai_confidence: number | null;
  ai_grading_basis?: string | null;
  max_score?: number;
  ai_feedback_draft: string | null;
  score: number | null;
  feedback: string | null;
  is_flagged: boolean;
  integrity_risk_score: number;
  class_section_id: string;
  institution_name?: string;
  workspace_title?: string;
}

interface AttemptDetail {
  id: string;
  attempt_number: number;
  status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED" | "GRADED" | "RELEASED";
  time_taken_seconds: number | null;
  integrity_risk_score: number;
  tab_switch_count: number;
  fullscreen_exit_count: number;
  copy_attempt_count: number;
  reconnect_count: number;
  total_integrity_warnings: number;
  warning_count: number;
  questions: AttemptQuestion[];
  integrity_hold: boolean;
  integrity_hold_reason: string | null;
}

interface AttemptQuestion {
  id: string;
  type: string;
  question_type?: string;
  text?: string;
  content?: string;
  marks: number;
  grading_mode?: string;
  caseStudyContext?: string;
  rubric?: any;
}

interface RubricCriteria {
  id: string;
  label: string;
  max_score: number;
  descriptor?: string;
}

interface RubricScore {
  criteria_id: string;
  score: number;
}

interface SubmissionRecord {
  id: string;
  question_id: string;
  answer_text: string | null;
  answer_type: "TEXT" | "FILE" | "CHOICE" | "MATCH" | "ORDER";
  file_url: string | null;
  score: number | null;
  override_score: number | null;
  ai_suggested_score: number | null;
  ai_grading_basis?: string | null;
  ai_feedback_draft: string | null;
  ai_rationale?: string | null;
  ai_confidence?: number | null;
  ai_feedback_strengths?: string[] | null;
  ai_feedback_improvements?: string[] | null;
  ai_feedback_suggestions?: string[] | null;
  feedback: string | null;
  is_final: boolean;
}

interface ClassStatRecord {
  class_id: string;
  class_name: string;
  workspace_title: string;
  total_students: number;
  submitted_count: number;
  not_submitted_count: number;
  pending_review_count: number;
  reviewed_count: number;
  released_count: number;
  latest_submission_at: string | null;
}

interface ClassAiSummary {
  ai_generated_at: string;
  average_score: number;
  pass_rate: number;
  strong_topics: string[];
  weak_topics: string[];
  students_needing_attention: { name: string; reason: string }[];
  common_mistakes: string[];
}

interface AuditLog {
  id: string;
  change_type: string;
  created_at: string;
  created_by_id: string | null;
  new_value: {
    override_score?: number;
    score?: number;
    feedback?: string;
    max_attempts?: number;
    passing_marks?: number;
  } | null;
  previous_value: Record<string, unknown> | null;
}

interface AssessmentSummary {
  id: string;
  title: string;
  assessment_type: string;
  total_marks: number;
  grading_mode: string;
  window_end: string | null;
  is_group_assessment?: boolean;
}

interface QuestionSummary {
  id: string;
  question_id?: string;
  question?: {
    content?: string;
    question_type?: string;
    title?: string;
  };
}

interface ReleaseValidationState {
  valid: boolean;
  errors: string[];
  gradedCount: number;
  totalCount: number;
}

interface BatchGradeItemState {
  score: string;
  feedback: string;
}

interface AnalyticsData {
  class_average: number;
  highest_score: number;
  lowest_score: number;
  pass_rate: number;
  question_difficulty: Array<{
    question_title: string;
    question_type: string;
    average_score: number;
    max_score: number;
    difficulty: "Easy" | "Medium" | "Hard";
  }>;
  ai_narrative: string | null;
}

export function isQuestionAutoGraded(q?: { type: string; question_type?: string; grading_mode?: string }) {
  if (!q) return false;
  if (q.grading_mode) {
    return q.grading_mode.toUpperCase() === "AUTO";
  }
  const t = (q.type || q.question_type || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  return ["mcq", "truefalse", "true_definition", "true_false", "matching", "fillblank", "fillblanks", "ordering"].includes(t);
}

export default function LecturerGradingQueue() {
  const [data, setData] = useState<GradingQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [assessmentId, setAssessmentId] = useState<string>("all");
  const [releaseAssessmentId, setReleaseAssessmentId] = useState<string>("all");
  const [classSectionId, setClassSectionId] = useState<string>("all");
  const [questionType, setQuestionType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date_asc");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);

  const [institutionFilter, setInstitutionFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [submissionDateFilter, setSubmissionDateFilter] = useState<string>("");

  // Metadata for Filters
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [activeTab, setActiveTab] = useState("individuals");

  // Hierarchy Navigation State
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceListItem | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentSummary | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassStatRecord | null>(null);
  const [classStats, setClassStats] = useState<ClassStatRecord[]>([]);
  const [classAiSummary, setClassAiSummary] = useState<ClassAiSummary | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const PAGE_SIZE = 50;

  const [batchGradeState, setBatchGradeState] = useState<Record<string, BatchGradeItemState>>({});

  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchAnalytics = useCallback(async (asmtId: string) => {
    setAnalyticsLoading(true);
    try {
      const res = await gradingApi.getAssessmentAnalytics(asmtId);
      setAnalyticsData(res);
    } catch (error: unknown) {
      console.error("Failed to fetch analytics", error);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // Group Grading State
  const [groupQueue, setGroupQueue] = useState<any[]>([]);
  const [groupQueueLoading, setGroupQueueLoading] = useState(false);
  const [selectedGroupSubmission, setSelectedGroupSubmission] = useState<any | null>(null);
  const [loadingGroupWorkspace, setLoadingGroupWorkspace] = useState(false);
  const [gradingGroup, setGradingGroup] = useState(false);
  const [groupScore, setGroupScore] = useState("");
  const [groupFeedback, setGroupFeedback] = useState("");
  const [groupGraderActiveQuestionIndex, setGroupGraderActiveQuestionIndex] = useState(0);
  const [isOverrideEnabled, setIsOverrideEnabled] = useState(false);
  const [memberScoreOverrides, setMemberScoreOverrides] = useState<Record<string, string>>({});

  const fetchGroupQueue = useCallback(async (asmtId: string) => {
    setGroupQueueLoading(true);
    try {
      const res = await gradingApi.getGroupGradingQueue({ assessment_id: asmtId });
      setGroupQueue(res.items || []);
    } catch (error: unknown) {
      console.error("Failed to fetch group queue", error);
      toast.error(error instanceof Error ? error.message : "Failed to load group grading queue");
    } finally {
      setGroupQueueLoading(false);
    }
  }, []);

  const openGroupSubmission = async (submissionId: string) => {
    setLoadingGroupWorkspace(true);
    try {
      const res = await groupWorkApi.getSubmissionWorkspace(submissionId);
      setSelectedGroupSubmission(res);
      setGroupScore(res.total_score !== undefined && res.total_score !== null ? res.total_score.toString() : "");
      setGroupFeedback(res.feedback || "");
      setGroupGraderActiveQuestionIndex(0);
      setIsOverrideEnabled(res.member_overrides ? true : false);
      const overrides: Record<string, string> = {};
      if (res.member_overrides) {
        Object.entries(res.member_overrides).forEach(([k, v]: any) => {
          overrides[k] = v.toString();
        });
      }
      setMemberScoreOverrides(overrides);
    } catch (error: unknown) {
      toast.error("Failed to load group submission workspace details");
    } finally {
      setLoadingGroupWorkspace(false);
    }
  };

  const submitGroupGrade = async () => {
    if (!selectedGroupSubmission) return;
    const totalScore = parseFloat(groupScore);
    if (isNaN(totalScore)) {
      toast.error("Please enter a valid numeric score");
      return;
    }
    const overridesPayload: Record<string, number> = {};
    if (isOverrideEnabled) {
      selectedGroupSubmission.members.forEach((m: any) => {
        const val = memberScoreOverrides[m.student_id];
        const num = parseFloat(val);
        overridesPayload[m.student_id] = !isNaN(num) ? num : totalScore;
      });
    }
    setGradingGroup(true);
    try {
      await groupWorkApi.gradeSubmission(selectedGroupSubmission.assessment_id, selectedGroupSubmission.submission_id, {
        total_score: totalScore,
        max_score: selectedGroupSubmission.assessment?.total_marks || 100,
        feedback: groupFeedback,
        member_overrides: isOverrideEnabled ? overridesPayload : undefined,
      });
      toast.success("Group submission graded successfully!");
      // Reload workspace and queue
      const updatedWorkspace = await groupWorkApi.getSubmissionWorkspace(selectedGroupSubmission.submission_id);
      setSelectedGroupSubmission(updatedWorkspace);
      if (selectedAssessment) {
        fetchGroupQueue(selectedAssessment.id);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save grade");
    } finally {
      setGradingGroup(false);
    }
  };

  useEffect(() => {
    if (activeTab === "analytics" && selectedAssessment?.id) {
      fetchAnalytics(selectedAssessment.id);
    }
    if (activeTab === "groups" && selectedAssessment?.id) {
      fetchGroupQueue(selectedAssessment.id);
    }
  }, [activeTab, selectedAssessment, fetchAnalytics, fetchGroupQueue]);

  const getBatchItem = (responseId: string): BatchGradeItemState =>
    batchGradeState[responseId] ?? { score: "", feedback: "" };

  const setBatchItem = (responseId: string, field: keyof BatchGradeItemState, value: string) =>
    setBatchGradeState(prev => ({
      ...prev,
      [responseId]: { ...getBatchItem(responseId), [field]: value },
    }));

  const handleAcceptAllAi = () => {
    // 1. Filter items that are ready for AI confirmation
    const aiReadyItems = filteredData.filter(item => 
      item.status === "AI_SUGGESTED" && (item.ai_confidence || 0) >= confidenceThreshold / 100
    );

    if (aiReadyItems.length === 0) {
      toast.info("No AI-suggested submissions match the current threshold.");
      return;
    }

    setAcceptAllPreviewItems(aiReadyItems);
    setShowAcceptAllPreview(true);
  };

  const commitAcceptAllAi = async () => {
    setShowAcceptAllPreview(false);
    const uniqueResponseIds = Array.from(new Set(acceptAllPreviewItems.map(item => item.response_id)));

    setIsSaving(true);
    try {
      const results = await Promise.allSettled(uniqueResponseIds.map(responseId => 
        gradingApi.saveGrade(responseId, {
          accept_ai_suggestion: true,
          is_final: true,
        })
      ));

      const fulfilled = results.filter(r => r.status === "fulfilled").length;
      const rejected = results.filter(r => r.status === "rejected").length;

      if (rejected === 0) {
        toast.success(`Successfully accepted all ${fulfilled} AI suggestions.`);
      } else {
        toast.warning(`Processed ${fulfilled} items, but ${rejected} failed. Refreshing queue...`);
      }
      
      fetchSubmissions();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Batch processing operation failed";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToWorkspaces = () => {
    setSelectedWorkspace(null);
    setSelectedAssessment(null);
    setSelectedClass(null);
    setAssessmentId("all");
    setClassSectionId("all");
  };

  const handleBackToAssessments = () => {
    setSelectedAssessment(null);
    setSelectedClass(null);
    setAssessmentId("all");
    setClassSectionId("all");
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
    setClassSectionId("all");
  };

  const fetchClassStats = async (asmtId: string) => {
    setLoading(true);
    try {
      const res = await gradingApi.getAssessmentClassStats(asmtId);
      setClassStats(res.classes || []);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to fetch class grading stats";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassAiSummary = async (asmtId: string, classId: string) => {
    try {
      const res = await gradingApi.getClassAiSummary(asmtId, classId);
      setClassAiSummary(res);
    } catch (error: unknown) {
      console.error("Failed to fetch class AI summary", error);
    }
  };

  // Selection & Decision (SpeedGrader View)
  const [selectedStudent, setSelectedStudent] = useState<GradingQueueItem | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<AttemptDetail | null>(null);
  const [activeSubmissions, setActiveSubmissions] = useState<SubmissionRecord[]>([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [reviewTab, setReviewTab] = useState<"question" | "integrity" | "reassessment" | "audit">("question");

  const [overrideScore, setOverrideScore] = useState<string>("");
  const [finalFeedback, setFinalFeedback] = useState<string>("");
  const [rubricScores, setRubricScores] = useState<RubricScore[]>([]);
  const [reviewStartedAt, setReviewStartedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [showAcceptAllPreview, setShowAcceptAllPreview] = useState(false);
  const [acceptAllPreviewItems, setAcceptAllPreviewItems] = useState<GradingQueueItem[]>([]);
  const [showBatchReviewModal, setShowBatchReviewModal] = useState(false);
  const [batchReviewItem, setBatchReviewItem] = useState<GradingQueueItem | null>(null);
  const [batchReviewDetails, setBatchReviewDetails] = useState<any | null>(null);
  const [batchReviewLoading, setBatchReviewLoading] = useState(false);

  // Reassessment options form state
  const [allowReassessment, setAllowReassessment] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [passMark, setPassMark] = useState(50);
  const [reassessmentWindow, setReassessmentWindow] = useState("7");

  // Batch Grading state
  const [selectedBatchQuestionTitle, setSelectedBatchQuestionTitle] = useState<string>("all");

  // Moderation state
  const [moderationQuestionId, setModerationQuestionId] = useState<string | null>(null);
  const [moderationAssessmentId, setModerationAssessmentId] = useState<string>("all");
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);

  // Result Release Policies
  const [releasePolicy, setReleasePolicy] = useState<"immediate" | "scheduled" | "hold">("hold");
  const [releaseDate, setReleaseDate] = useState("");
  const [releaseValidation, setReleaseValidation] = useState<ReleaseValidationState>({
    valid: true,
    errors: [],
    gradedCount: 0,
    totalCount: 0,
  });

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedClass, selectedAssessment, status, questionType, sortBy, debouncedSearch]);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> = { 
        page_size: PAGE_SIZE, 
        page: currentPage,
        sort_by: sortBy 
      };
      if (selectedAssessment) params.assessment_id = selectedAssessment.id;
      if (selectedClass) params.class_section_id = selectedClass.class_id;
      if (questionType !== "all") params.question_type = questionType;
      if (status !== "all") params.status = status;
      if (debouncedSearch) params.q = debouncedSearch;

      const response = await gradingApi.getGradingQueue(params);
      setData(response.items || []);
      setTotal(response.total || 0);
      setHasMore((response.items?.length ?? 0) === PAGE_SIZE);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Queue trace failure";
      toast.error(msg);
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

  const fetchQuestions = useCallback(async (asmtId: string) => {
    try {
      const res = await assessmentApi.getAssessmentQuestions(asmtId);
      setQuestions(res || []);
    } catch (error: unknown) {
      console.error(error);
    }
  }, []);

  const runReleaseValidation = useCallback(async (asmtId: string) => {
    try {
      const res = await resultApi.getAssessmentResults(asmtId);
      const items = res.items || [];
      const errorsList: string[] = [];
      let gradedQ = 0;
      let totalQ = 0;

      items.forEach((r: { student_name: string; graded_question_count: number; total_question_count: number; integrity_hold: boolean }) => {
        gradedQ += r.graded_question_count || 0;
        totalQ += r.total_question_count || 0;
        if (r.graded_question_count < r.total_question_count) {
          errorsList.push(`${r.student_name}: ${r.total_question_count - r.graded_question_count} questions remaining ungraded.`);
        }
        if (r.integrity_hold) {
          errorsList.push(`${r.student_name}: Unresolved active integrity hold.`);
        }
      });

      setReleaseValidation({
        valid: errorsList.length === 0,
        errors: errorsList,
        gradedCount: gradedQ,
        totalCount: totalQ,
      });
    } catch (error: unknown) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (activeTab === "individuals") {
      fetchSubmissions();
      if (selectedAssessment && !selectedClass) {
        fetchClassStats(selectedAssessment.id);
      }
    }
    if (activeTab === "release" && releaseAssessmentId !== "all") runReleaseValidation(releaseAssessmentId);
    return () => controller.abort();
  }, [activeTab, fetchSubmissions, releaseAssessmentId, runReleaseValidation, selectedClass, selectedAssessment]);

  useEffect(() => {
    const controller = new AbortController();
    if (selectedWorkspace) {
      assessmentApi.getAssessments({ workspace_id: selectedWorkspace.id }).then(res => {
        if (controller.signal.aborted) return;
        setAssessments(res.items || []);
      });
    } else {
      // Re-fetch all if no workspace selected? Or just wait for metadata.
      fetchMetadata();
    }
    return () => controller.abort();
  }, [selectedWorkspace]);

  useEffect(() => {
    const controller = new AbortController();
    if (moderationAssessmentId !== "all")
      fetchQuestions(moderationAssessmentId);
    else {
      setQuestions([]);
      setModerationQuestionId(null);
    }
    return () => {
      controller.abort();
    };
  }, [moderationAssessmentId, fetchQuestions]);

  useEffect(() => {
    let active = true;
    if (batchReviewItem) {
      setBatchReviewLoading(true);
      gradingApi.getGradeDetail(batchReviewItem.response_id)
        .then(data => {
          if (active) {
            setBatchReviewDetails(data);
          }
        })
        .catch(err => {
          console.error("Failed to load AI details in batch mode", err);
        })
        .finally(() => {
          if (active) {
            setBatchReviewLoading(false);
          }
        });
    } else {
      setBatchReviewDetails(null);
    }
    return () => {
      active = false;
    };
  }, [batchReviewItem]);

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

  const fetchResponseLogs = async (responseId: string) => {
    setAuditLoading(true);
    try {
      const logs = await submissionApi.getSubmissionLogs(responseId);
      setAuditLogs(logs || []);
    } catch (error: unknown) {
      console.error("Failed to fetch response audit logs", error);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleOpenReview = async (item: GradingQueueItem) => {
    setLoading(true);
    try {
      const attemptRes = await attemptApi.getAttempt(item.attempt_id);
      const subRes = await submissionApi.getSubmissionsForAttempt(item.attempt_id);

      setActiveAttempt(attemptRes);
      setActiveSubmissions(subRes.submissions || []);

      // Find question index matching queue item
      const idx = attemptRes.questions?.findIndex((q: AttemptQuestion) => q.id === item.question_id);
      const activeIdx = idx >= 0 ? idx : 0;
      setActiveQuestionIndex(activeIdx);

      const activeQuestion = attemptRes.questions?.[activeIdx];
      const activeSub = subRes.submissions?.find((s: SubmissionRecord) => s.question_id === activeQuestion?.id);

      if (activeSub) {
        fetchResponseLogs(activeSub.id);
        const detail = await gradingApi.getGradeDetail(activeSub.id);
        setActiveSubmissions((prev: SubmissionRecord[]) =>
          prev.map((s) => (s.id === activeSub.id ? { ...s, ...detail } : s))
        );
        setOverrideScore(detail.score?.toString() || detail.ai_suggested_score?.toString() || "");
        setFinalFeedback(detail.feedback || "");
        setRubricScores(detail.rubric_scores || []);
      } else {
        setOverrideScore("");
        setFinalFeedback("");
        setRubricScores([]);
        setAuditLogs([]);
      }

      setSelectedStudent(item);
      setReviewStartedAt(new Date());
      setAllowReassessment(false);
      setReviewTab("question");
    } catch (error: unknown) {
      toast.error("Failed to load student attempt details");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuestion = async (index: number) => {
    if (!activeAttempt) return;
    setActiveQuestionIndex(index);
    const q = activeAttempt.questions[index];
    const submission = activeSubmissions.find((s: SubmissionRecord) => s.question_id === q.id);

    if (submission) {
      fetchResponseLogs(submission.id);
      try {
        const detail = await gradingApi.getGradeDetail(submission.id);
        setActiveSubmissions((prev: SubmissionRecord[]) =>
          prev.map((s) => (s.id === submission.id ? { ...s, ...detail } : s))
        );
        setOverrideScore(detail.score?.toString() || detail.ai_suggested_score?.toString() || "");
        setFinalFeedback(detail.feedback || "");
        setRubricScores(detail.rubric_scores || []);
        setShowAiPanel(true);
      } catch (error: unknown) {
        console.error("Failed to fetch grade details for question", error);
      }
    } else {
      setOverrideScore("");
      setFinalFeedback("");
      setRubricScores([]);
      setAuditLogs([]);
    }
  };

  const handleSaveDecision = async (
    isFinal: boolean,
    acceptAi: boolean = false,
  ) => {
    if (!selectedStudent || !activeAttempt) return;
    const currentQuestion = activeAttempt.questions?.[activeQuestionIndex];
    const currentSubmission = activeSubmissions.find((s: SubmissionRecord) => s.question_id === currentQuestion?.id);

    if (!currentSubmission) {
      toast.error("No student submission registered for this question node");
      return;
    }

    if (isFinal && !acceptAi && overrideScore === "") {
      toast.error("Score required for finalization");
      return;
    }

    setIsSaving(true);
    try {
      const duration = reviewStartedAt
        ? Math.floor((new Date().getTime() - reviewStartedAt.getTime()) / 1000)
        : 0;
      const payload: Record<string, string | number | boolean | RubricScore[]> = {
        accept_ai_suggestion: acceptAi,
        is_final: isFinal,
        review_started_at: reviewStartedAt?.toISOString() || "",
        review_duration_seconds: duration,
        rubric_scores: rubricScores,
      };
      if (!acceptAi) {
        const parsedScore = parseFloat(overrideScore);
        if (Number.isFinite(parsedScore)) {
          const maxMarks = currentQuestion?.marks || 10;
          if (parsedScore < 0 || parsedScore > maxMarks) {
            toast.error(`Score must be between 0 and ${maxMarks} points`);
            setIsSaving(false);
            return;
          }
          payload.override_score = parsedScore;
        }
        payload.feedback = finalFeedback;
      }

      await gradingApi.saveGrade(currentSubmission.id, payload);
      toast.success(isFinal ? "Decision recorded successfully" : "Draft preserved");

      // Reload attempt submissions
      const subRes = await submissionApi.getSubmissionsForAttempt(activeAttempt.id);
      setActiveSubmissions(subRes.submissions || []);

      if (isFinal) {
        // Auto-navigate to next pending manual question
        const nextPendingIdx = activeAttempt.questions.findIndex((q: AttemptQuestion, idx: number) => {
          if (idx <= activeQuestionIndex) return false;
          const isManual = !isQuestionAutoGraded(q);
          if (!isManual) return false;
          const sub = subRes.submissions?.find((s: SubmissionRecord) => s.question_id === q.id);
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
      toast.error("Save failure");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRubricChange = (scores: RubricScore[]) => {
    setRubricScores(scores);
    const total = scores.reduce((acc, curr) => acc + curr.score, 0);
    const totalStr = total.toString();
    if (overrideScore && overrideScore !== totalStr) {
      toast.info(`Score updated to ${totalStr} based on rubric criteria selection.`);
    }
    setOverrideScore(totalStr);
  };

  // Reassessment Grants
  const handleGrantReassessment = async () => {
    if (!activeAttempt) return;
    try {
      await attemptApi.grantReassessment(activeAttempt.id, {
        max_attempts: maxAttempts,
        passing_marks: passMark,
        window_days: parseInt(reassessmentWindow),
      });
      toast.success("Reassessment granted. Student is authorized for a new attempt.");
      setAuditLogs((prev: AuditLog[]) => [
        {
          id: "new-reassessment-log",
          change_type: "REASSESSMENT_GRANTED",
          created_at: new Date().toISOString(),
          new_value: { max_attempts: maxAttempts, passing_marks: passMark },
          previous_value: null,
          created_by_id: null,
        },
        ...prev,
      ]);
    } catch (error: unknown) {
      toast.error("Failed to grant reassessment");
    }
  };

  // Batch Grading helpers
  const groupedBatchQuestions = useMemo(() => {
    const groups: Record<string, GradingQueueItem[]> = {};
    data.forEach((item: GradingQueueItem) => {
      const qTitle = item.question_title || "General Question";
      if (!groups[qTitle]) groups[qTitle] = [];
      groups[qTitle].push(item);
    });
    return groups;
  }, [data]);

  const handleBatchApplyAi = async (responseId: string, score: number) => {
    try {
      await gradingApi.saveGrade(responseId, {
        override_score: score,
        is_final: true,
      });
      toast.success("AI suggested score applied");
      fetchSubmissions();
    } catch (error: unknown) {
      toast.error("Failed to apply AI suggestion");
    }
  };

  const handleSaveBatchGrade = async (responseId: string, scoreStr: string, feedback: string) => {
    const parsedScore = parseFloat(scoreStr);
    if (isNaN(parsedScore)) {
      toast.error("Please enter a valid score");
      return;
    }
    const item = data.find(i => i.response_id === responseId);
    const maxMarks = item?.max_score || 10;
    if (parsedScore < 0 || parsedScore > maxMarks) {
      toast.error(`Score must be between 0 and ${maxMarks} points`);
      return;
    }
    try {
      await gradingApi.saveGrade(responseId, {
        override_score: parsedScore,
        feedback: feedback,
        is_final: true,
      });
      toast.success("Grade confirmed");
      fetchSubmissions();
    } catch (error: unknown) {
      toast.error("Failed to save grade");
    }
  };

  const handleSaveReleasePolicy = async (asmtId: string) => {
    try {
      await resultApi.updateReleasePolicy(asmtId, {
        policy: releasePolicy,
        release_date: releasePolicy === "scheduled" ? releaseDate : null,
      });
      toast.success("Release policy saved successfully");
    } catch (error: unknown) {
      toast.error("Failed to save release policy");
    }
  };

  const handleTriggerImmediateRelease = async (asmtId: string) => {
    setIsSaving(true);
    try {
      await resultApi.triggerImmediateRelease(asmtId);
      toast.success("Results released to students immediately.");
      runReleaseValidation(asmtId);
    } catch (error: unknown) {
      toast.error("Failed to trigger immediate release");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLiftIntegrityHold = async () => {
    if (!activeAttempt) return;
    setIsSaving(true);
    try {
      await integrityApi.liftHold(activeAttempt.id);
      toast.success("Integrity hold lifted. Student result is now eligible for release.");
      // Refresh the attempt
      const updated = await attemptApi.getAttempt(activeAttempt.id);
      setActiveAttempt(updated);
    } catch (error: unknown) {
      toast.error("Failed to lift integrity hold");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleManualFlag = async () => {
    if (!selectedStudent || !activeAttempt) return;
    setIsSaving(true);
    try {
      await integrityApi.toggleFlag(activeAttempt.id, !selectedStudent.is_flagged);
      toast.success(selectedStudent.is_flagged ? "Attempt unflagged." : "Attempt flagged for institutional review.");
      setSelectedStudent(prev => prev ? { ...prev, is_flagged: !prev.is_flagged } : prev);
    } catch (error: unknown) {
      toast.error("Failed to update flag status");
    } finally {
      setIsSaving(false);
    }
  };

  const stats = useMemo(
    () => ({
      pending: data.filter((d) => d.status === "PENDING").length,
      aiSuggested: data.filter((d) => d.status === "AI_SUGGESTED").length,
      flagged: data.filter((d) => d.is_flagged).length,
    }),
    [data],
  );

  const institutions = useMemo(() => {
    const list = workspaces.map((w) => w.institution_name).filter(Boolean);
    return Array.from(new Set(list));
  }, [workspaces]);

  const courses = useMemo(() => {
    const list = workspaces.map((w) => w.title).filter(Boolean);
    return Array.from(new Set(list));
  }, [workspaces]);

  const filteredData = useMemo(() => {
    return data.filter((item: GradingQueueItem) => {
      // TODO: Ensure GET /grading/queue includes institution_name and workspace_title
      // on each GradingQueueItem so institution and course filters work correctly.

      // 1. Institution Filter
      if (institutionFilter !== "all") {
        if (!item.institution_name || item.institution_name !== institutionFilter) return false;
      }
      
      // 2. Course Filter
      if (courseFilter !== "all") {
        if (!item.workspace_title || item.workspace_title !== courseFilter) return false;
      }
      
      // 3. Submission Date Filter
      if (submissionDateFilter) {
        if (!item.submitted_at) return false;
        const itemDate = new Date(item.submitted_at).toISOString().split("T")[0];
        if (itemDate !== submissionDateFilter) return false;
      }
      
      // 4. Confidence Threshold Filter (Only applies to AI Suggested)
      if (confidenceThreshold > 0 && item.status === "AI_SUGGESTED") {
        if ((item.ai_confidence || 0) < confidenceThreshold / 100) return false;
      }
      
      return true;
    });
  }, [data, institutionFilter, courseFilter, submissionDateFilter, confidenceThreshold]);

  // SpeedGrader Review workspace UI
  if (activeAttempt) {
    const currentQuestion = activeAttempt.questions?.[activeQuestionIndex];
    const currentSubmission = activeSubmissions.find((s) => s.question_id === currentQuestion?.id);
    const isAutoGraded = isQuestionAutoGraded(currentQuestion);

    return (
      <div className="min-h-screen bg-background flex flex-col font-sans text-foreground">
        {/* SpeedGrader Header */}
        <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
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
                {selectedStudent?.assessment_title} • Attempt #{activeAttempt.attempt_number}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 bg-muted/20 border border-border/50 rounded-xl p-1 px-3 h-9 text-xs font-semibold">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="size-3.5" /> Spent: {activeAttempt.time_taken_seconds ? `${Math.floor(activeAttempt.time_taken_seconds / 60)}m ${activeAttempt.time_taken_seconds % 60}s` : "N/A"}
              </span>
              <div className="h-4 w-px bg-border/20" />
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "size-2 rounded-full",
                  activeAttempt.integrity_risk_score > 70 ? "bg-red-500" : activeAttempt.integrity_risk_score > 30 ? "bg-amber-500" : "bg-emerald-500"
                )} />
                <span className="text-foreground/80">Integrity Risk: {activeAttempt.integrity_risk_score || 0}%</span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs font-semibold border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 rounded-lg shadow-sm"
              onClick={async () => {
                if (!activeAttempt) return;
                try {
                  const check = await gradingApi.verifyAttemptGrades(activeAttempt.id);
                  if (!check.valid) {
                    if (check.ungraded_count > 0) {
                      toast.error(`Cannot finalize. ${check.ungraded_count} manually graded questions are not finalized yet.`);
                    }
                    if (check.unreviewed_bulk_count > 0) {
                      toast.warning(`Warning: ${check.unreviewed_bulk_count} grades were bulk-accepted via AI suggestion without individual review. Please review these submissions individually before release.`);
                    }
                  } else {
                    toast.success("All validations passed! Ready for release.");
                  }
                } catch (err) {
                  toast.error("Failed to execute verification checks.");
                }
              }}
            >
              Verify Marks
            </Button>
          </div>
        </div>

        {/* SpeedGrader Workspace Grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Sidebar */}
          <div className="w-64 border-r border-border/40 bg-muted/5 flex flex-col p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
              Assessment Outline
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {activeAttempt.questions?.map((q: AttemptQuestion, idx: number) => {
                const sub = activeSubmissions.find((s: SubmissionRecord) => s.question_id === q.id);
                const isAuto = isQuestionAutoGraded(q);

                let statusBadge = (
                  <Badge variant="outline" className="text-[9px] font-bold py-0 h-4 uppercase tracking-wider bg-amber-500/5 text-amber-600 border-amber-500/15">
                    Pending
                  </Badge>
                );
                if (isAuto) {
                  statusBadge = (
                    <Badge variant="outline" className="text-[9px] font-bold py-0 h-4 uppercase tracking-wider bg-emerald-500/5 text-emerald-600 border-emerald-500/15">
                      Finalized
                    </Badge>
                  );
                } else if (sub) {
                  if (sub.is_final) {
                    statusBadge = (
                      <Badge variant="outline" className="text-[9px] font-bold py-0 h-4 uppercase tracking-wider bg-emerald-500/5 text-emerald-600 border-emerald-500/15">
                        Finalized
                      </Badge>
                    );
                  } else if (sub.score !== null || sub.override_score !== null || overrideScore !== "") {
                    statusBadge = (
                      <Badge variant="outline" className="text-[9px] font-bold py-0 h-4 uppercase tracking-wider bg-indigo-500/5 text-indigo-600 border-indigo-500/15">
                        Reviewed
                      </Badge>
                    );
                  } else if (sub.ai_suggested_score !== null) {
                    statusBadge = (
                      <Badge variant="outline" className="text-[9px] font-bold py-0 h-4 uppercase tracking-wider bg-blue-500/5 text-blue-600 border-blue-500/15 animate-pulse">
                        AI Suggested
                      </Badge>
                    );
                  }
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => handleSelectQuestion(idx)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between",
                      idx === activeQuestionIndex
                        ? "ring-2 ring-primary ring-offset-1 border-primary bg-background shadow-sm"
                        : "border-border/50 bg-background/50 hover:bg-background"
                    )}
                  >
                    <div className="space-y-1 min-w-0 pr-2">
                      <p className={cn("text-xs font-bold truncate", idx === activeQuestionIndex ? "text-primary" : "text-foreground/80")}>
                        Question {idx + 1}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 truncate capitalize">
                        {q.type?.replace("_", " ").toLowerCase()} • {q.marks || 0} pts
                      </p>
                    </div>
                    {statusBadge}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Dual Pane Workspace */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Pane (Question, Reference, Rubric, Integrity, Reassessment, Audit) */}
            <div className="flex-1 border-r border-border/40 p-6 overflow-y-auto space-y-6 bg-background">
              <div className="flex border-b border-border/40 pb-2 gap-4">
                <button
                  onClick={() => setReviewTab("question")}
                  className={cn(
                    "text-xs font-semibold pb-2 border-b-2 transition-all",
                    reviewTab === "question" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                  )}
                >
                  Question & Rubric
                </button>
                <button
                  onClick={() => setReviewTab("integrity")}
                  className={cn(
                    "text-xs font-semibold pb-2 border-b-2 transition-all",
                    reviewTab === "integrity" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                  )}
                >
                  Integrity Review
                </button>
                <button
                  onClick={() => setReviewTab("reassessment")}
                  className={cn(
                    "text-xs font-semibold pb-2 border-b-2 transition-all",
                    reviewTab === "reassessment" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                  )}
                >
                  Reassessment
                </button>
                <button
                  onClick={() => setReviewTab("audit")}
                  className={cn(
                    "text-xs font-semibold pb-2 border-b-2 transition-all",
                    reviewTab === "audit" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
                  )}
                >
                  Audit Trail
                </button>
              </div>

              {reviewTab === "question" && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/85">
                      Question Text
                    </Label>
                    <div className="p-4 rounded-xl border border-border/60 bg-muted/10 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                      {currentQuestion?.text || currentQuestion?.content}
                    </div>
                  </div>

                  {currentQuestion?.caseStudyContext && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/85">
                        Case Study Context / Reference Answer
                      </Label>
                      <div className="p-4 rounded-xl border border-primary/15 bg-primary/[0.01] text-xs leading-relaxed italic text-foreground/80 whitespace-pre-wrap">
                        {currentQuestion.caseStudyContext}
                      </div>
                    </div>
                  )}

                  {currentQuestion?.rubric ? (
                    <RubricGradingPanel
                      rubric={currentQuestion.rubric}
                      currentScores={rubricScores}
                      onScoresChange={handleRubricChange}
                    />
                  ) : (
                    <div className="py-6 border-t border-dashed text-center text-xs text-muted-foreground/60 italic">
                      No explicit rubric criteria configured for this question node.
                    </div>
                  )}
                </div>
              )}

              {reviewTab === "integrity" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="size-5 text-destructive" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Integrity Incidents Report</h3>
                  </div>

                  {activeAttempt.status === "AUTO_SUBMITTED" && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-700">
                      <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider">Forced Auto-Submission</p>
                        <p className="text-xs leading-relaxed">
                          This assessment session expired or was terminated by security enforcement and was automatically finalized by the system.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border border-border/50 bg-background/50 rounded-xl space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Tab Switching Events</span>
                      <p className="text-xl font-bold text-foreground tabular-nums">{activeAttempt.tab_switch_count || 0}</p>
                    </div>
                    <div className="p-4 border border-border/50 bg-background/50 rounded-xl space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Fullscreen Exits</span>
                      <p className="text-xl font-bold text-foreground tabular-nums">{activeAttempt.fullscreen_exit_count || 0}</p>
                    </div>
                    <div className="p-4 border border-border/50 bg-background/50 rounded-xl space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Copy / Paste Actions</span>
                      <p className="text-xl font-bold text-foreground tabular-nums">{activeAttempt.copy_attempt_count || 0}</p>
                    </div>
                    <div className="p-4 border border-border/50 bg-background/50 rounded-xl space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Disconnects / Drops</span>
                      <p className="text-xl font-bold text-foreground tabular-nums">{activeAttempt.reconnect_count || 0}</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Warnings Issued</p>
                    <p className="text-xs text-foreground/80 leading-relaxed font-medium">
                      Student received {activeAttempt.total_integrity_warnings || activeAttempt.warning_count || 0} integrity warnings during the timed session.
                    </p>
                  </div>

                  {activeAttempt.integrity_hold && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 text-red-700">
                        <Lock className="size-5 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-wider">Integrity Hold Active</p>
                          <p className="text-xs leading-relaxed">
                            {activeAttempt.integrity_hold_reason || "This attempt has been placed on hold pending review."}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 h-8 text-xs font-semibold border-red-500/20 bg-red-500/5 text-red-700 hover:bg-red-500/10 rounded-lg"
                        onClick={handleLiftIntegrityHold}
                        disabled={isSaving}
                      >
                        <Unlock className="size-3.5 mr-1.5" /> Lift Hold
                      </Button>
                    </div>
                  )}

                  <div className="pt-4 border-t border-border/40 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-foreground">Manual Flag</p>
                      <p className="text-[10px] text-muted-foreground">Flag this attempt for institutional review and block result release until resolved.</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn(
                        "h-8 text-xs font-semibold rounded-lg",
                        selectedStudent?.is_flagged
                          ? "border-amber-500/20 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10"
                          : "border-border/60 hover:bg-muted/40"
                      )}
                      onClick={handleToggleManualFlag}
                      disabled={isSaving}
                    >
                      {selectedStudent?.is_flagged ? (
                        <><ShieldAlert className="size-3.5 mr-1.5" /> Unflag Attempt</>
                      ) : (
                        <><ShieldAlert className="size-3.5 mr-1.5" /> Flag Attempt</>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {reviewTab === "reassessment" && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2">
                    <RefreshCcw className="size-5 text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Reassessment Management</h3>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Authorize the student to re-take this assessment under institutional guidelines. Reassessment preserves all historical attempts, scores, and integrity logs.
                  </p>

                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between p-3.5 bg-muted/10 border rounded-xl">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-bold text-foreground">Enable Reassessment</Label>
                        <p className="text-[10px] text-muted-foreground">Authorize student a new grading window</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={allowReassessment}
                        onChange={(e) => setAllowReassessment(e.target.checked)}
                        className="size-4 text-primary accent-primary rounded border cursor-pointer"
                      />
                    </div>

                    {allowReassessment && (
                      <div className="space-y-4 p-4 border border-border/50 bg-background/50 rounded-xl animate-fade-in">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Maximum Attempts</Label>
                            <Input
                              type="number"
                              value={maxAttempts}
                              onChange={(e) => setMaxAttempts(parseInt(e.target.value))}
                              className="h-9 text-xs rounded-lg"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Pass Mark Requirement (%)</Label>
                            <Input
                              type="number"
                              value={passMark}
                              onChange={(e) => setPassMark(parseInt(e.target.value))}
                              className="h-9 text-xs rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-muted-foreground">Reassessment Window (Days)</Label>
                          <Select value={reassessmentWindow} onValueChange={setReassessmentWindow}>
                            <SelectTrigger className="h-9 text-xs rounded-lg bg-background">
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
                          className="w-full h-10 text-xs font-semibold mt-2 rounded-xl"
                        >
                          Authorize and Grant Reassessment
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {reviewTab === "audit" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <History className="size-5 text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Academic Audit Trail</h3>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Permanent chronological record of every evaluation action, score modification, and feedback revision.
                  </p>

                  <div className="space-y-2.5 pt-2">
                    {auditLoading ? (
                      <div className="py-12 flex justify-center"><Loader2 className="size-5 text-primary animate-spin" /></div>
                    ) : auditLogs.length === 0 ? (
                      <div className="py-12 border border-dashed rounded-xl text-center text-xs text-muted-foreground/60 italic">
                        No previous grading actions recorded for this question response.
                      </div>
                    ) : (
                      auditLogs.map((log: AuditLog) => (
                        <div key={log.id} className="p-3 border border-border/50 bg-background/50 rounded-xl text-xs space-y-1.5 shadow-sm">
                          <div className="flex justify-between items-center">
                            <span className="font-bold uppercase tracking-wider text-[9px] text-primary">{log.change_type}</span>
                            <span className="text-[10px] text-muted-foreground/60">{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                          {log.new_value && (
                            <div className="font-medium text-foreground/80 leading-relaxed">
                              Modified score to: <span className="font-bold text-foreground">{log.new_value.override_score ?? log.new_value.score ?? "N/A"} pts</span>
                              {log.new_value.feedback && (
                                <p className="italic text-[11px] text-muted-foreground mt-1 font-medium">Feedback: &quot;{log.new_value.feedback.substring(0, 100)}...&quot;</p>
                              )}
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground/50">Actor: Lecturer ID {log.created_by_id || "System Engine"}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Pane (Response, AI Suggestions, Marks, Feedback) */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-muted/[0.01]">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/85">
                  Student Response Trace
                </Label>
                {currentSubmission?.answer_type === "FILE" && currentSubmission?.file_url ? (
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="size-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate max-w-[200px] md:max-w-xs">
                          {currentSubmission.file_url.split("/").pop() || "deliverable_file"}
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
                ) : null}

                <div className="text-sm leading-relaxed border border-border/60 rounded-xl p-4 bg-background shadow-sm whitespace-pre-wrap text-foreground/90 min-h-[140px]">
                  {currentSubmission?.answer_text || currentSubmission?.file_url ? (
                    currentSubmission.answer_text
                  ) : (
                    <span className="italic text-muted-foreground/50">No response recorded.</span>
                  )}
                </div>
              </div>

              {!isAutoGraded && currentSubmission && (
                <div className="space-y-3">
                  <AIReviewPanel
                    queueItemId={selectedStudent?.id}
                    responseId={currentSubmission.id}
                    maxScore={currentQuestion?.marks || 10}
                    onSuggestionApplied={(score) => {
                      setOverrideScore(score.toString());
                      toast.success("Suggested score applied to form — click 'Confirm Evaluation' below to save.");
                    }}
                  />

                  <AIFeedbackEditor
                    responseId={currentSubmission.id}
                    initialDraft={currentSubmission.ai_feedback_draft || undefined}
                    onDraftApplied={(text) => setFinalFeedback(text)}
                  />
                </div>
              )}

              {!isAutoGraded && currentSubmission && (
                <div className="bg-primary/[0.02] border border-primary/15 rounded-xl p-4 space-y-3 shadow-sm my-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <BrainCircuit className="size-4" /> AI Grading Decisions Action Hub
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Instantly accept, modify, or reject AI suggestions to accelerate your academic evaluation.
                  </p>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs font-semibold h-8 rounded-lg border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                      onClick={() => {
                        if (currentSubmission.ai_suggested_score !== null && currentSubmission.ai_suggested_score !== undefined) {
                          setOverrideScore(currentSubmission.ai_suggested_score.toString());
                        }
                        if (currentSubmission.ai_feedback_draft) {
                          setFinalFeedback(currentSubmission.ai_feedback_draft);
                        }
                        toast.success("AI suggested score & feedback applied to form — click 'Confirm Evaluation' below to save.");
                      }}
                    >
                      Accept AI
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs font-semibold h-8 rounded-lg border-amber-500/20 bg-amber-500/5 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
                      onClick={() => {
                        toast.info("Enter a custom grade in the score field below.");
                      }}
                    >
                      Modify / Custom
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs font-semibold h-8 rounded-lg border-red-500/20 bg-red-500/5 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                      onClick={() => {
                        setOverrideScore("");
                        setFinalFeedback("");
                        toast.info("Clearing suggestions. Custom grade expected.");
                      }}
                    >
                      Reject AI
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs font-semibold h-8 rounded-lg border-blue-500/20 bg-blue-500/5 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700"
                      onClick={() => {
                        if (currentSubmission.ai_feedback_draft) {
                          setFinalFeedback(currentSubmission.ai_feedback_draft);
                          toast.success("AI draft feedback approved and copied.");
                        } else {
                          toast.error("No AI feedback draft found to approve.");
                        }
                      }}
                    >
                      Approve Draft
                    </Button>
                  </div>
                </div>
              )}

              {!isAutoGraded && (
                <div className="pt-4 border-t border-dashed border-border/40 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                      Lecturer Comments & Feedback
                    </Label>
                    <Textarea
                      placeholder="Provide details on strengths, weaknesses, and improvement tips..."
                      className="text-xs min-h-[90px] border-border/60 bg-background focus-visible:ring-1 transition-colors rounded-xl"
                      value={finalFeedback}
                      onChange={(e) => setFinalFeedback(e.target.value)}
                    />
                    
                    {currentSubmission && currentSubmission.ai_feedback_draft && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-muted-foreground">Draft Origin:</span>
                          {finalFeedback === currentSubmission.ai_feedback_draft ? (
                            <Badge variant="outline" className="text-[10px] font-bold uppercase bg-emerald-500/10 border-emerald-500/20 text-emerald-700">
                              AI-Authored (Verbatim)
                            </Badge>
                          ) : finalFeedback ? (
                            <Badge variant="outline" className="text-[10px] font-bold uppercase bg-amber-500/10 border-amber-500/20 text-amber-700">
                              AI-Authored (Edited)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-bold uppercase bg-blue-500/10 border-blue-500/20 text-blue-700">
                              Lecturer-Authored (Clear)
                            </Badge>
                          )}
                        </div>
                        
                        {finalFeedback && finalFeedback !== currentSubmission.ai_feedback_draft && (
                          <div className="text-[11px] p-2.5 rounded-lg border bg-muted/20 space-y-1">
                            <span className="font-bold text-muted-foreground uppercase text-[9px] block">Lecturer Additions Highlight</span>
                            <p className="leading-relaxed text-foreground/80">
                              {finalFeedback.split(" ").map((word, i) => {
                                const isNew = !currentSubmission.ai_feedback_draft?.split(" ").includes(word);
                                return (
                                  <span key={i} className={isNew ? "bg-emerald-100 text-emerald-800 px-0.5 rounded" : ""}>
                                    {word}{" "}
                                  </span>
                                );
                              })}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Input
                          type="number"
                          value={overrideScore}
                          onChange={(e) => setOverrideScore(e.target.value)}
                          className="w-24 h-10 text-sm font-semibold text-center pr-7 border-border/60 bg-background rounded-lg"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground/60 select-none">
                          pts
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground/75 font-medium">
                        out of {currentQuestion?.marks || 10} Points Maximum
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pb-8 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => handleSaveDecision(false)}
                        disabled={isSaving}
                        className="h-10 text-xs font-semibold rounded-xl border-border/60 hover:bg-muted/40 shadow-sm"
                      >
                        {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Save Draft"}
                      </Button>
                      <Button
                        onClick={() => handleSaveDecision(true)}
                        disabled={isSaving}
                        className="h-10 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground shadow-md transition-all"
                      >
                        Confirm Evaluation
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {isAutoGraded && (
                <div className="p-4 rounded-xl border border-border/50 bg-muted/10 flex items-center gap-3 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  <div>
                    <span className="font-bold text-foreground">Auto-Graded Question</span>
                    <p className="text-[11px] mt-0.5 leading-relaxed">
                      This question type ({currentQuestion?.type || currentQuestion?.question_type}) is automatically scored by the system. No manual input is required. The score has already been applied.
                    </p>
                    {currentSubmission?.score !== null && (
                      <p className="mt-1 font-semibold text-foreground/80">
                        Recorded Score: <span className="text-emerald-600 font-bold">{currentSubmission?.score} / {currentQuestion?.marks} pts</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Precision Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Grading & Review Center
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} manual evaluation submission{total !== 1 ? "s" : ""} awaiting review
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden md:flex items-center gap-3 bg-muted/20 border border-border/50 rounded-xl p-1 px-3 h-9">
            <div className="flex items-center gap-1.5 border-r border-border/20 pr-3 h-5">
              <span className="size-2 rounded-full bg-amber-500" />
              <span className="text-xs font-semibold text-foreground/80">Pending:</span>
              <span className="text-xs font-bold tabular-nums">{stats.pending}</span>
            </div>
            <div className="flex items-center gap-1.5 border-r border-border/20 pr-3 h-5">
              <span className="size-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs font-semibold text-foreground/80">AI-Ready:</span>
              <span className="text-xs font-bold tabular-nums">{stats.aiSuggested}</span>
            </div>
            <div className="flex items-center gap-1.5 h-5">
              <span className="size-2 rounded-full bg-red-500" />
              <span className="text-xs font-semibold text-foreground/80">Flagged:</span>
              <span className="text-xs font-bold tabular-nums">{stats.flagged}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSubmissions}
            className="h-9 px-4 text-xs font-medium border-border/60 gap-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <RefreshCcw className="size-3.5 text-muted-foreground" /> Sync Queue
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/30 p-1.5 rounded-xl w-full md:w-fit h-fit overflow-x-auto justify-start border border-border/40 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5 border-r border-border/20 pr-3 last:border-0">
            <span className="text-[9px] font-bold text-muted-foreground/75 uppercase tracking-widest px-1">Grading</span>
            <div className="flex gap-1 bg-muted/30 p-0.5 rounded-lg border border-border/10">
              <TabsTrigger
                value="individuals"
                className="text-xs font-semibold px-3.5 py-1.5 rounded-md gap-1.5 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <User className="size-3.5 opacity-80" /> Review Queue
              </TabsTrigger>
              <TabsTrigger
                value="batch"
                className="text-xs font-semibold px-3.5 py-1.5 rounded-md gap-1.5 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <Layers className="size-3.5 opacity-80" /> Batch Grading
              </TabsTrigger>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-r border-border/20 pr-3 last:border-0">
            <span className="text-[9px] font-bold text-muted-foreground/75 uppercase tracking-widest px-1">Quality</span>
            <div className="flex gap-1 bg-muted/30 p-0.5 rounded-lg border border-border/10">
              <TabsTrigger
                value="moderation"
                className="text-xs font-semibold px-3.5 py-1.5 rounded-md gap-1.5 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <Scale className="size-3.5 opacity-80" /> Moderation
              </TabsTrigger>
              <TabsTrigger
                value="analytics"
                className="text-xs font-semibold px-3.5 py-1.5 rounded-md gap-1.5 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <TrendingUp className="size-3.5 opacity-80" /> Analytics
              </TabsTrigger>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-r border-border/20 pr-3 last:border-0">
            <span className="text-[9px] font-bold text-muted-foreground/75 uppercase tracking-widest px-1">Publishing</span>
            <div className="flex gap-1 bg-muted/30 p-0.5 rounded-lg border border-border/10">
              <TabsTrigger
                value="release"
                className="text-xs font-semibold px-3.5 py-1.5 rounded-md gap-1.5 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <Send className="size-3.5 opacity-80" /> Result Release
              </TabsTrigger>
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-r border-border/20 pr-3 last:border-0 pl-1">
            <span className="text-[9px] font-bold text-muted-foreground/75 uppercase tracking-widest px-1">Collaborative</span>
            <div className="flex gap-1 bg-muted/30 p-0.5 rounded-lg border border-border/10">
              <TabsTrigger
                value="groups"
                className="text-xs font-semibold px-3.5 py-1.5 rounded-md gap-1.5 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <Users className="size-3.5 opacity-80" /> Groups
              </TabsTrigger>
            </div>
          </div>
        </TabsList>

        <TabsContent value="individuals" className="mt-4 space-y-4">
          {/* Breadcrumbs */}
          {(selectedWorkspace || selectedAssessment || selectedClass) && (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-4">
              <button onClick={handleBackToWorkspaces} className="hover:text-primary transition-colors flex items-center gap-1">
                <School className="size-3.5" /> Workspaces
              </button>
              {selectedWorkspace && (
                <>
                  <ChevronRight className="size-3" />
                  <button onClick={handleBackToAssessments} className="hover:text-primary transition-colors">{selectedWorkspace.title}</button>
                </>
              )}
              {selectedAssessment && (
                <>
                  <ChevronRight className="size-3" />
                  <button onClick={handleBackToClasses} className="hover:text-primary transition-colors">{selectedAssessment.title}</button>
                </>
              )}
              {selectedClass && (
                <>
                  <ChevronRight className="size-3" />
                  <span className="text-foreground font-semibold">{selectedClass.class_name}</span>
                </>
              )}
            </div>
          )}

          {!selectedWorkspace ? (
            <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
              <Table>
                <TableHeader className="bg-muted/15 border-b border-border/40">
                  <TableRow className="h-10 hover:bg-transparent border-none">
                    <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">Institution</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Teaching Workspace</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class Section</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Students</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Avg Perf.</TableHead>
                    <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspaces.map((ws: WorkspaceListItem) => (
                    <TableRow 
                      key={ws.id} 
                      className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                      onClick={() => setSelectedWorkspace(ws)}
                    >
                      <TableCell className="px-6 py-2">
                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20">
                          {ws.institution_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{ws.title}</span>
                      </TableCell>
                      <TableCell className="py-2 text-xs font-medium text-muted-foreground/80">{ws.class_name}</TableCell>
                      <TableCell className="py-2 text-center">
                        <span className="text-xs font-bold text-foreground/70 flex items-center justify-center gap-1.5">
                          <Users className="size-3.5 opacity-50" /> {ws.student_count}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-bold text-foreground/80">{ws.performance_avg}%</span>
                          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${ws.performance_avg}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-6 py-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {workspaces.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-44 text-center text-sm font-medium text-muted-foreground">
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
          ) : !selectedAssessment ? (
            <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
              <Table>
                <TableHeader className="bg-muted/15 border-b border-border/40">
                  <TableRow className="h-10 hover:bg-transparent border-none">
                    <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assessment Title</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Marks</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Grading Mode</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deadline</TableHead>
                    <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((asmt: AssessmentSummary) => (
                    <TableRow 
                      key={asmt.id} 
                      className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                      onClick={() => {
                        setSelectedAssessment(asmt);
                        fetchClassStats(asmt.id);
                      }}
                    >
                      <TableCell className="px-6 py-2">
                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500/5 text-indigo-600 border-indigo-500/20">
                          {asmt.assessment_type.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{asmt.title}</span>
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <span className="text-xs font-bold text-foreground/70">{asmt.total_marks} Pts</span>
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <Badge variant="outline" className="text-[9px] font-bold uppercase bg-muted/10 text-muted-foreground border-border/50">
                          {asmt.grading_mode}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5 font-medium">
                          <Calendar className="size-3.5 opacity-60" />
                          {asmt.window_end ? formatDistanceToNow(new Date(asmt.window_end), { addSuffix: true }) : "No deadline"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-6 py-2">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {assessments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-44 text-center text-sm font-medium text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <FolderOpen className="size-8 opacity-20" />
                          <p>No assessments found in this workspace.</p>
                          <Button variant="link" size="sm" onClick={handleBackToWorkspaces}>Back to Workspaces</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : !selectedClass ? (
            <div className="space-y-6">
              {/* Class Overview Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: "Total Students", value: classStats.reduce((acc, c) => acc + c.total_students, 0), icon: Users, color: "text-blue-600" },
                  { label: "Submitted", value: classStats.reduce((acc, c) => acc + c.submitted_count, 0), icon: CheckCircle2, color: "text-indigo-600" },
                  { label: "Not Submitted", value: classStats.reduce((acc, c) => acc + c.not_submitted_count, 0), icon: AlertTriangle, color: "text-amber-600" },
                  { label: "Pending Review", value: classStats.reduce((acc, c) => acc + c.pending_review_count, 0), icon: Clock, color: "text-rose-600" },
                  { label: "Reviewed", value: classStats.reduce((acc, c) => acc + c.reviewed_count, 0), icon: Check, color: "text-emerald-600" },
                  { label: "Released", value: classStats.reduce((acc, c) => acc + c.released_count, 0), icon: Send, color: "text-primary" },
                ].map((stat, i) => (
                  <Card key={i} className="bg-card/30 backdrop-blur-sm shadow-none border border-border/50">
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <stat.icon className={cn("size-4 opacity-70", stat.color)} />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{stat.label}</span>
                      </div>
                      <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Classes Table */}
              <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none">
                <Table>
                  <TableHeader className="bg-muted/15 border-b border-border/40">
                    <TableRow className="h-10 hover:bg-transparent border-none">
                      <TableHead className="text-xs font-semibold px-4 text-muted-foreground">Class Name</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Teaching Workspace</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Submissions</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Pending Review</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Reviewed</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Released</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">Latest Submission</TableHead>
                      <TableHead className="text-right text-xs font-semibold pr-4 text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i} className="h-14 border-border/10">
                          <TableCell colSpan={8} className="px-4"><Skeleton className="h-5 w-full rounded" /></TableCell>
                        </TableRow>
                      ))
                    ) : classStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-44 text-center text-sm font-medium text-muted-foreground">
                          No classes assigned to this assessment.
                        </TableCell>
                      </TableRow>
                    ) : (
                      classStats.map((c: ClassStatRecord) => (
                        <TableRow key={c.class_id} className="group hover:bg-primary/5 h-14 border-border/10 transition-all duration-200">
                          <TableCell className="px-4 py-2">
                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{c.class_name}</span>
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground font-medium">{c.workspace_title}</TableCell>
                          <TableCell className="py-2">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-foreground/80">{c.submitted_count} / {c.total_students}</span>
                              <div className="w-20 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                                <div className="h-full bg-indigo-500" style={{ width: `${(c.submitted_count / c.total_students) * 100}%` }} />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-[10px] font-bold bg-rose-500/5 text-rose-600 border-rose-500/20">
                              {c.pending_review_count} Pending
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-[10px] font-bold bg-emerald-500/5 text-emerald-600 border-emerald-500/20">
                              {c.reviewed_count} Done
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-[10px] font-bold bg-primary/5 text-primary border-primary/20">
                              {c.released_count} Released
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5 font-medium">
                              <Clock className="size-3.5 opacity-60" />
                              {c.latest_submission_at ? formatDistanceToNow(new Date(c.latest_submission_at), { addSuffix: true }) : "N/A"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right pr-4 py-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 px-3 text-xs font-bold rounded-lg border-border/60 hover:bg-primary hover:text-primary-foreground transition-all"
                              onClick={() => {
                                setSelectedClass(c);
                                fetchSubmissions();
                                fetchClassAiSummary(selectedAssessment.id, c.class_id);
                              }}
                            >
                              Open Class
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Class AI Summary Header */}
              {classAiSummary && (
                <Card className="border-primary/20 bg-primary/[0.02] shadow-none overflow-hidden animate-in fade-in slide-in-from-top-4">
                  <CardHeader className="py-4 px-6 border-b border-primary/10 flex flex-row items-center justify-between bg-primary/[0.03]">
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="size-5 text-primary" />
                      <div>
                        <CardTitle className="text-sm font-bold text-primary uppercase tracking-wider">AI Pedagogical Insights Summary</CardTitle>
                        <CardDescription className="text-[10px] font-medium text-primary/70">Generated at {new Date(classAiSummary.ai_generated_at).toLocaleString()}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Avg Score</p>
                        <p className="text-xl font-bold text-primary tracking-tight">{classAiSummary.average_score}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Pass Rate</p>
                        <p className="text-xl font-bold text-primary tracking-tight">{classAiSummary.pass_rate}%</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-wider">
                          <CheckCircle2 className="size-4" /> Strong Topics
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {classAiSummary.strong_topics.map((topic: string, i: number) => (
                            <Badge key={i} variant="outline" className="bg-emerald-500/5 text-emerald-700 border-emerald-500/20 text-[10px] font-semibold">{topic}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-600 uppercase tracking-wider">
                          <AlertTriangle className="size-4" /> Weak Topics
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {classAiSummary.weak_topics.map((topic: string, i: number) => (
                            <Badge key={i} variant="outline" className="bg-rose-500/5 text-rose-700 border-rose-500/20 text-[10px] font-semibold">{topic}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
                          <Users className="size-4" /> Attention Required
                        </div>
                        <ul className="space-y-2">
                          {classAiSummary.students_needing_attention.map((s: { name: string; reason: string }, i: number) => (
                            <li key={i} className="text-[11px] font-medium flex items-start gap-2 text-foreground/80">
                              <span className="size-1.5 rounded-full bg-primary mt-1 shrink-0" />
                              <span><span className="font-bold text-foreground">{s.name}</span>: {s.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    {classAiSummary.common_mistakes?.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-primary/10">
                        <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">Common Analytical Omissions</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {classAiSummary.common_mistakes.map((mistake: string, i: number) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-background border border-primary/10 text-[11px] font-medium text-foreground/90">
                              <span className="flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary font-bold">{i+1}</span>
                              {mistake}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Batch Actions Panel */}
              <div className="bg-card/30 border border-border/50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
                    <Input
                      placeholder="Search students..."
                      className="pl-9 h-9 text-xs border-border/60 bg-background/50 focus-visible:ring-1 rounded-lg"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-background/50 border border-border/60 rounded-lg px-3 h-9">
                    <BrainCircuit className="size-3.5 text-blue-600" />
                    <span className="text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap">Min Confidence:</span>
                    <Select value={confidenceThreshold.toString()} onValueChange={(v) => setConfidenceThreshold(parseInt(v))}>
                      <SelectTrigger className="w-[80px] h-7 text-[10px] border-none bg-transparent font-bold">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">All</SelectItem>
                        <SelectItem value="50">50%+</SelectItem>
                        <SelectItem value="70">70%+</SelectItem>
                        <SelectItem value="80">80%+</SelectItem>
                        <SelectItem value="90">90%+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-[130px] h-9 text-xs rounded-lg border-border/60 bg-background/50">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="PENDING">Pending Review</SelectItem>
                      <SelectItem value="AI_SUGGESTED">AI Reviewed</SelectItem>
                      <SelectItem value="COMPLETED">Lecturer Reviewed</SelectItem>
                      <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                      <SelectItem value="PENDING_RELEASE">Pending Release</SelectItem>
                      <SelectItem value="RELEASED">Released</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[130px] h-9 text-xs rounded-lg border-border/60 bg-background/50">
                      <div className="flex items-center gap-1.5">
                        <ArrowUpDown className="size-3.5 opacity-60" />
                        <span>Sort</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date_asc">Oldest First</SelectItem>
                      <SelectItem value="date_desc">Newest First</SelectItem>
                      <SelectItem value="ai_confidence">AI Confidence</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-9 text-xs font-bold border-indigo-500/20 bg-indigo-500/5 text-indigo-600 hover:bg-indigo-500/10 rounded-lg"
                    onClick={handleAcceptAllAi}
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="size-3 animate-spin mr-2" /> : <CheckCircle2 className="size-3 mr-2" />}
                    Accept AI ({confidenceThreshold > 0 ? `${confidenceThreshold}%+` : "All"})
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-9 text-xs font-bold border-emerald-500/20 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 rounded-lg"
                    onClick={() => setActiveTab("release")}
                  >
                    <Send className="size-3 mr-2" /> Result Release
                  </Button>
                </div>
              </div>

              {/* Student Table */}
              <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
                <Table>
                  <TableHeader className="bg-muted/15 border-b border-border/40">
                    <TableRow className="h-10 hover:bg-transparent border-none">
                      <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">Student Name</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Submission Time</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Status</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Review Status</TableHead>
                      <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="h-14 border-border/10">
                          <TableCell colSpan={6} className="px-6"><Skeleton className="h-5 w-full rounded" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-44 text-center text-sm font-medium text-muted-foreground">
                          No submissions match current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredData.map((item: GradingQueueItem) => {
                        // Determine Overall Status for Column 3
                        let overallStatus = "Pending";
                        if (item.status === "RELEASED") overallStatus = "Released";
                        else if (item.status === "PENDING_RELEASE") overallStatus = "Pending Release";
                        else if (item.status === "UNDER_REVIEW") overallStatus = "Under Review";
                        else if (item.status === "COMPLETED") overallStatus = "Lecturer Reviewed";
                        else if (item.status === "AI_SUGGESTED") overallStatus = "AI Reviewed";

                        return (
                          <TableRow 
                            key={item.id} 
                            className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                            onClick={() => handleOpenReview(item)}
                          >
                            <TableCell className="px-6 py-2">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{item.student_name}</span>
                                <span className="text-[10px] text-muted-foreground/60 font-medium tracking-tight">ID: {item.student_id?.substring(0, 8)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-2">
                              <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5 font-semibold">
                                <Clock className="size-3.5 opacity-60" />
                                {item.submitted_at ? formatDistanceToNow(new Date(item.submitted_at), { addSuffix: true }) : "N/A"}
                              </span>
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-2.5 py-0.5 rounded-full capitalize font-bold border shadow-none",
                                  overallStatus === "Released" ? "bg-primary/5 text-primary border-primary/20" :
                                  overallStatus === "Pending Release" ? "bg-indigo-500/5 text-indigo-600 border-indigo-500/20" :
                                  overallStatus === "Under Review" ? "bg-violet-500/5 text-violet-600 border-violet-500/20" :
                                  overallStatus === "Lecturer Reviewed" ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20" :
                                  overallStatus === "AI Reviewed" ? "bg-blue-500/5 text-blue-600 border-blue-500/20" :
                                  "bg-amber-500/5 text-amber-600 border-amber-500/20"
                                )}
                              >
                                {overallStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2">
                              {item.status === "AI_SUGGESTED" ? (
                                <div className="flex flex-col gap-1 items-start">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[9px] font-bold bg-blue-500/5 text-blue-600 border-blue-500/10">
                                      AI SUGGESTED
                                    </Badge>
                                    <span className="text-[10px] font-bold text-blue-600/70">{Math.round((item.ai_confidence || 0) * 100)}% Confidence</span>
                                  </div>
                                  {item.ai_grading_basis === "RUBRIC" ? (
                                    <Badge variant="outline" className="text-[8px] font-bold bg-emerald-500/10 border-emerald-500/20 text-emerald-700 shadow-none uppercase">
                                      Rubric-Based
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[8px] font-bold bg-amber-500/10 border-amber-500/20 text-amber-700 shadow-none uppercase">
                                      General Knowledge
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] font-bold text-muted-foreground/40 italic">Not Assisted</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="flex items-center gap-1.5">
                                <div className={cn(
                                  "size-1.5 rounded-full",
                                  item.status === "COMPLETED" || item.status === "RELEASED" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                                )} />
                                <span className="text-[11px] font-bold text-foreground/80 lowercase first-letter:uppercase">
                                  {item.status === "COMPLETED" || item.status === "RELEASED" ? "Finalized" : "Pending Confirmation"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right pr-6 py-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 px-4 text-[10px] font-bold rounded-lg border-border/60 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all uppercase tracking-widest"
                              >
                                Grade
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {(hasMore || currentPage > 1) && (
                <div className="flex items-center justify-between px-2 pt-3">
                  <span className="text-xs text-muted-foreground font-medium">
                    Showing page {currentPage} · {filteredData.length} of {total} submissions
                  </span>
                  <div className="flex gap-2">
                    {currentPage > 1 && (
                      <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg"
                        onClick={() => setCurrentPage(p => p - 1)}>
                        Previous
                      </Button>
                    )}
                    {hasMore && (
                      <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg"
                        onClick={() => setCurrentPage(p => p + 1)}>
                        Load More
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="batch" className="mt-4 space-y-4">
          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm">
            <CardHeader className="p-4 border-b border-border/30 bg-muted/10 flex flex-col sm:flex-row items-start sm:items-center gap-4 space-y-0">
              <div className="flex-1 w-full space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground/80">
                  Select Question to Batch Grade
                </Label>
                <Select
                  value={selectedBatchQuestionTitle}
                  onValueChange={setSelectedBatchQuestionTitle}
                >
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                    <SelectValue placeholder="Choose question..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Select Question...</SelectItem>
                    {Object.keys(groupedBatchQuestions).map((title, idx) => (
                      <SelectItem key={idx} value={title}>
                        Q: {title.substring(0, 60)}...
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {selectedBatchQuestionTitle === "all" ? (
                <div className="py-20 text-center text-sm font-medium text-muted-foreground">
                  <p className="italic">Select a question node to grade all student responses side-by-side.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                    <span className="block text-xs font-bold text-primary uppercase tracking-wider mb-1">Batch Question prompt</span>
                    <p className="text-sm font-semibold">{selectedBatchQuestionTitle}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groupedBatchQuestions[selectedBatchQuestionTitle]?.map((item: GradingQueueItem) => (
                      <Card key={item.response_id} className="border border-border/50 bg-background/50">
                        <CardHeader className="py-3 px-4 border-b bg-muted/5 flex flex-row items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-foreground">{item.student_name}</p>
                            <p className="text-[10px] text-muted-foreground">Risk Score: {item.integrity_risk_score}%</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize bg-amber-500/5 text-amber-600 border-amber-500/10">
                            {item.status.replace("_", " ").toLowerCase()}
                          </Badge>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground">Response</p>
                            <div className="text-xs p-3 bg-background border rounded-lg whitespace-pre-wrap leading-relaxed min-h-[80px]">
                              {item.student_answer || <span className="italic text-muted-foreground">No response.</span>}
                            </div>
                          </div>

                          {item.ai_suggested_score !== null && (
                            <div className="p-2.5 bg-primary/5 rounded-lg border border-primary/10 flex justify-between items-center text-xs">
                              <span className="font-semibold text-primary">AI Suggestion: {item.ai_suggested_score} pts (Confidence: {Math.round((item.ai_confidence || 0) * 100)}%)</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] font-bold border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                                onClick={() => {
                                  setBatchReviewItem(item);
                                  setShowBatchReviewModal(true);
                                }}
                              >
                                Review Suggestion
                              </Button>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-3 items-end">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Score</Label>
                              <Input
                                type="number"
                                value={getBatchItem(item.response_id).score}
                                onChange={(e) => setBatchItem(item.response_id, "score", e.target.value)}
                                className="h-8 text-xs font-bold"
                                placeholder="Score"
                              />
                            </div>
                            <div className="col-span-2 space-y-1">
                              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Feedback</Label>
                              <Input
                                value={getBatchItem(item.response_id).feedback}
                                onChange={(e) => setBatchItem(item.response_id, "feedback", e.target.value)}
                                className="h-8 text-xs"
                                placeholder="Feedback comments..."
                              />
                            </div>
                          </div>

                          <div className="flex justify-end pt-1">
                            <Button
                              size="sm"
                              onClick={async () => {
                                const item_state = getBatchItem(item.response_id);
                                await handleSaveBatchGrade(item.response_id, item_state.score, item_state.feedback);
                              }}
                              className="h-8 text-xs font-semibold"
                            >
                              Confirm Grade
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="moderation" className="mt-4">
          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm">
            <CardHeader className="p-4 border-b border-border/30 bg-muted/10 flex flex-col sm:flex-row items-start sm:items-center gap-4 space-y-0">
              <div className="flex-1 w-full space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground/80">
                  Select Assessment
                </Label>
                <Select
                  value={moderationAssessmentId}
                  onValueChange={setModerationAssessmentId}
                >
                  <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                    <SelectValue placeholder="Choose assessment..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assessments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {questions.length > 0 && (
                <div className="flex-1 w-full space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground/80">
                    Select Question Node
                  </Label>
                  <Select
                    value={moderationQuestionId || ""}
                    onValueChange={setModerationQuestionId}
                  >
                    <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                      <SelectValue placeholder="Choose question..." />
                      </SelectTrigger>
                      <SelectContent>
                        {questions.map((q: QuestionSummary, idx: number) => (
                          <SelectItem key={q.id} value={q.question_id || q.id}>
                            Q{idx + 1}: {q.question?.title || q.question?.content?.substring(0, 45)}...
                          </SelectItem>
                        ))}
                      </SelectContent>
                  </Select>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-5">
              {!moderationQuestionId ? (
                <div className="py-20 text-center text-sm font-medium text-muted-foreground">
                  <p className="italic">Awaiting node selection for moderation review.</p>
                </div>
              ) : (
                <ModerationPanel questionId={moderationQuestionId} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="release" className="mt-4">
          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm">
            <CardHeader className="p-4 border-b border-border/30 bg-muted/10 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground/80">
                Select Release Assessment Context
              </Label>
              <Select value={releaseAssessmentId} onValueChange={setReleaseAssessmentId}>
                <SelectTrigger className="h-9 text-xs rounded-lg border-border/60 bg-background/50 hover:bg-background/80 transition-colors">
                  <SelectValue placeholder="Choose assessment..." />
                </SelectTrigger>
                <SelectContent>
                  {assessments.map((a: AssessmentSummary) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-5 space-y-6">
              {releaseAssessmentId === "all" ? (
                <div className="py-20 text-center text-sm font-medium text-muted-foreground">
                  <p className="italic">Awaiting release context selection.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Validation checklist */}
                  <div className="p-4 border rounded-xl bg-background space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Scale className="size-4 text-primary" /> Result Release Validation Audit
                    </h4>

                    {releaseValidation.errors.length > 0 ? (
                      <div className="space-y-2">
                        <div className="p-3 bg-red-500/10 border border-red-500/15 rounded-xl flex items-start gap-2.5 text-red-700">
                          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                          <div className="space-y-1 text-xs">
                            <p className="font-bold">Validation Errors Detected</p>
                            <ul className="list-disc pl-4 space-y-1">
                              {releaseValidation.errors.map((err: string, i: number) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/15 rounded-xl flex items-center gap-2.5 text-emerald-700 text-xs font-bold">
                        <CheckCircle2 className="size-4 shrink-0" />
                        All validations passed! Ready for final released state.
                      </div>
                    )}
                  </div>

                  {/* Release settings policy form */}
                  <div className="p-4 border rounded-xl bg-background space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Release Configuration</h4>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">Release Policy</Label>
                        <Select value={releasePolicy} onValueChange={(val: "immediate" | "scheduled" | "hold") => setReleasePolicy(val)}>
                          <SelectTrigger className="h-9 text-xs rounded-lg">
                            <SelectValue placeholder="Policy" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="immediate">Release Immediately</SelectItem>
                            <SelectItem value="scheduled">Release On Specific Date</SelectItem>
                            <SelectItem value="hold">Hold Results</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {releasePolicy === "scheduled" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-muted-foreground">Scheduled Date</Label>
                          <Input
                            type="datetime-local"
                            value={releaseDate}
                            onChange={(e) => setReleaseDate(e.target.value)}
                            className="h-9 text-xs rounded-lg"
                          />
                        </div>
                      )}

                      <div className="flex items-end">
                        <Button
                          onClick={() => handleSaveReleasePolicy(releaseAssessmentId)}
                          className="w-full h-9 text-xs font-semibold rounded-lg"
                        >
                          Save Release Policy
                        </Button>
                      </div>
                    </div>
                  </div>

                  {releasePolicy === "immediate" && releaseValidation.valid && (
                    <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 rounded-xl flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Ready to Release</p>
                        <p className="text-[11px] text-emerald-700/80">
                          All validations passed. Click to immediately publish results to students.
                        </p>
                      </div>
                      <Button
                        className="h-9 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                        onClick={() => handleTriggerImmediateRelease(releaseAssessmentId)}
                        disabled={isSaving}
                      >
                        {isSaving ? <Loader2 className="size-4 animate-spin" /> : <><Unlock className="size-3.5 mr-1.5" /> Release Results Now</>}
                      </Button>
                    </div>
                  )}

                  {releasePolicy === "immediate" && !releaseValidation.valid && (
                    <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-xl text-xs text-red-700 font-semibold">
                      Cannot release: resolve all validation errors above before triggering release.
                    </div>
                  )}

                  <ResultReleasePanel assessmentId={releaseAssessmentId} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart className="size-5 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Class Performance Analytics</h3>
              </div>
              {selectedAssessment && (
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest bg-primary/5 text-primary border-primary/20">
                  {selectedAssessment.title}
                </Badge>
              )}
            </div>

            {!selectedAssessment ? (
              <div className="py-20 text-center space-y-3 bg-muted/10 border border-dashed rounded-xl">
                <BarChart className="size-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">Select an assessment to view deep pedagogical analytics.</p>
              </div>
            ) : analyticsLoading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Skeleton className="h-64 w-full rounded-xl" />
                  <Skeleton className="h-64 w-full rounded-xl" />
                </div>
              </div>
            ) : !analyticsData ? (
              <div className="py-20 text-center text-sm font-medium text-muted-foreground italic">
                No analytics data available for this assessment.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in duration-500">
                  {[
                    { label: "Class Average Score", value: `${analyticsData.class_average}%`, icon: TrendingUp, color: "text-primary" },
                    { label: "Highest Evaluation", value: `${analyticsData.highest_score}%`, icon: CheckCircle2, color: "text-emerald-600" },
                    { label: "Lowest Evaluation", value: `${analyticsData.lowest_score}%`, icon: AlertTriangle, color: "text-rose-600" },
                    { label: "Evaluation Pass Rate", value: `${analyticsData.pass_rate}%`, icon: Check, color: "text-indigo-600" },
                  ].map((stat, i) => (
                    <div key={i} className="p-4 border border-border/50 rounded-xl bg-background/50 space-y-1 shadow-sm">
                      <div className="flex items-center justify-between opacity-60">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{stat.label}</span>
                        <stat.icon className={cn("size-3.5", stat.color)} />
                      </div>
                      <p className={cn("text-2xl font-bold tracking-tight", stat.color)}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  {/* Question Difficulty analysis */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question Difficulty Trace</h4>
                    <div className="border border-border/50 rounded-xl overflow-hidden bg-background shadow-sm">
                      <Table>
                        <TableHeader className="bg-muted/15 border-b border-border/40">
                          <TableRow className="h-9 hover:bg-transparent">
                            <TableHead className="text-[10px] font-bold uppercase pl-4">Question</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase">Type</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase">Avg Score</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase text-right pr-4">Difficulty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          {analyticsData.question_difficulty.map((q, i) => (
                            <TableRow key={i} className="h-10 hover:bg-muted/5 transition-colors border-border/10">
                              <TableCell className="font-bold pl-4 max-w-[200px] truncate">{q.question_title}</TableCell>
                              <TableCell className="capitalize text-muted-foreground/80 font-medium">{q.question_type.replace("_", " ").toLowerCase()}</TableCell>
                              <TableCell className="font-bold text-foreground/70">{q.average_score} / {q.max_score}</TableCell>
                              <TableCell className="text-right pr-4">
                                <Badge variant="outline" className={cn(
                                  "text-[9px] font-bold px-2 py-0 h-5",
                                  q.difficulty === "Easy" ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20" :
                                  q.difficulty === "Medium" ? "bg-amber-500/5 text-amber-600 border-amber-500/20" :
                                  "bg-rose-500/5 text-rose-600 border-rose-500/20"
                                )}>
                                  {q.difficulty}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Narrative Summaries */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">AI Performance Summary</h4>
                    <div className="p-5 rounded-xl border border-primary/20 bg-primary/[0.02] space-y-3 text-xs leading-relaxed text-foreground/80 shadow-sm">
                      <div className="flex items-center gap-2 border-b border-primary/10 pb-2 mb-2">
                        <BrainCircuit className="size-4 text-primary" />
                        <span className="font-bold text-primary uppercase tracking-widest">Narrative Analytics</span>
                      </div>
                      {analyticsData.ai_narrative ? (
                        <p className="font-medium italic leading-relaxed whitespace-pre-wrap">{analyticsData.ai_narrative}</p>
                      ) : (
                        <p className="italic text-muted-foreground/60 text-center py-6">AI narrative processing incomplete for this assessment.</p>
                      )}
                      <div className="pt-2 flex justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-primary/5">
                          Regenerate Narrative
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          {/* Breadcrumbs */}
          {(selectedWorkspace || selectedAssessment || selectedGroupSubmission) && (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-4">
              <button
                onClick={() => {
                  setSelectedWorkspace(null);
                  setSelectedAssessment(null);
                  setSelectedGroupSubmission(null);
                }}
                className="hover:text-primary transition-colors flex items-center gap-1 font-semibold"
              >
                <School className="size-3.5" /> Workspaces
              </button>
              {selectedWorkspace && (
                <>
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                  <button
                    onClick={() => {
                      setSelectedAssessment(null);
                      setSelectedGroupSubmission(null);
                    }}
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
                    onClick={() => {
                      setSelectedGroupSubmission(null);
                    }}
                    className="hover:text-primary transition-colors font-semibold"
                  >
                    {selectedAssessment.title}
                  </button>
                </>
              )}
              {selectedGroupSubmission && (
                <>
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                  <span className="text-foreground font-bold">
                    Group SpeedGrader
                  </span>
                </>
              )}
            </div>
          )}

          {selectedGroupSubmission ? (
            /* GROUP SPEEDGRADER VIEW */
            <div className="flex flex-col flex-1 h-[calc(100vh-12rem)] animate-in fade-in duration-300">
              {/* SpeedGrader Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/40 mb-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedGroupSubmission(null)}
                    className="h-9 px-3 border border-border/60 rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <ChevronLeft className="size-4 mr-1" /> Back to List
                  </Button>
                  <div className="h-5 w-px bg-border/40 hidden md:block" />
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">
                      <span>{selectedWorkspace?.title}</span>
                      <ChevronRight className="size-3" />
                      <span>{selectedAssessment?.title}</span>
                      <ChevronRight className="size-3" />
                      <span className="text-primary font-bold">Group SpeedGrader</span>
                    </div>
                    <h1 className="text-sm font-bold text-foreground leading-none flex items-center gap-2">
                      {selectedGroupSubmission.group_name || "Unnamed Group"} • {selectedGroupSubmission.members?.length || 0} members
                      <Badge variant="outline" className="text-[10px] font-bold uppercase bg-primary/5 text-primary border-primary/20">
                        {selectedGroupSubmission.submission_status}
                      </Badge>
                    </h1>
                    <p className="text-[10px] text-muted-foreground font-medium mt-1">
                      Participation: {selectedGroupSubmission.members?.filter((m: any) => m.participation_count > 0).length || 0} / {selectedGroupSubmission.members?.length || 0} active contributors
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Sequential Navigation Buttons */}
                  {(() => {
                    const currentIdx = groupQueue.findIndex((g: any) => g.id === selectedGroupSubmission.submission_id);
                    const prevGroup = currentIdx > 0 ? groupQueue[currentIdx - 1] : null;
                    const nextGroup = currentIdx !== -1 && currentIdx < groupQueue.length - 1 ? groupQueue[currentIdx + 1] : null;

                    return (
                      <div className="flex items-center gap-1 bg-muted/20 border border-border/50 rounded-xl p-1 h-9">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!prevGroup}
                          onClick={() => prevGroup && openGroupSubmission(prevGroup.id)}
                          className="h-7 text-xs font-semibold rounded-lg hover:bg-background/80 transition-colors flex items-center gap-1 px-2.5"
                          title="Previous Group"
                        >
                          <ChevronLeft className="size-3" /> Previous
                        </Button>
                        <div className="h-4 w-px bg-border/20" />
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!nextGroup}
                          onClick={() => nextGroup && openGroupSubmission(nextGroup.id)}
                          className="h-7 text-xs font-semibold rounded-lg hover:bg-background/80 transition-colors flex items-center gap-1 px-2.5"
                          title="Next Group"
                        >
                          Next <ChevronRight className="size-3" />
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* SpeedGrader Workspace Grid */}
              <div className="flex-1 flex overflow-hidden border border-border/40 rounded-xl bg-card/10 backdrop-blur-sm">
                {/* Left Navigation Sidebar - Assessment Outline */}
                <div className="w-64 border-r border-border/40 bg-muted/5 flex flex-col p-4 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                    Assessment Outline
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {selectedGroupSubmission.questions?.map((q: any, idx: number) => {
                      const isAnswered = selectedGroupSubmission.answers.some((ans: any) => ans.question_id === q.id && ans.answer_content);
                      let statusText = "Pending";
                      if (selectedGroupSubmission.submission_status === "GRADED") {
                        statusText = "Finalized";
                      } else if (isAnswered) {
                        statusText = "AI Suggested";
                      }
                      return (
                        <button
                          key={q.id}
                          onClick={() => setGroupGraderActiveQuestionIndex(idx)}
                          className={cn(
                            "w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between",
                            idx === groupGraderActiveQuestionIndex
                              ? "ring-2 ring-primary ring-offset-1 border-primary bg-background shadow-sm"
                              : "border-border/50 bg-background/50 hover:bg-background",
                          )}
                        >
                          <div className="space-y-1 min-w-0 pr-2">
                            <p className={cn(
                              "text-xs font-bold truncate",
                              idx === groupGraderActiveQuestionIndex ? "text-primary" : "text-foreground/80"
                            )}>
                              Question {idx + 1}
                            </p>
                            <p className="text-[10px] text-muted-foreground/60 truncate capitalize">
                              {q.type?.replace("_", " ").toLowerCase()} • {q.marks || 0} pts
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] font-bold py-0 h-4 uppercase tracking-wider",
                              statusText === "Finalized" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                              statusText === "AI Suggested" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                              "bg-zinc-500/10 text-zinc-600 border-zinc-500/20"
                            )}
                          >
                            {statusText}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Main Dual Pane Workspace */}
                <div className="flex-1 flex overflow-hidden">
                  {/* Middle Pane - Question, Rubric & Contributor Activity */}
                  <div className="flex-1 border-r border-border/40 p-6 overflow-y-auto space-y-6 bg-background">
                    {(() => {
                      const activeQ = selectedGroupSubmission.questions[groupGraderActiveQuestionIndex];
                      if (!activeQ) return null;
                      const answer = selectedGroupSubmission.answers.find((a: any) => a.question_id === activeQ.id);

                      return (
                        <div className="space-y-6 animate-in fade-in duration-200">
                          {/* Question Content */}
                          <div>
                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/5 border border-primary/10 px-2 py-0.5 rounded">
                              Question {groupGraderActiveQuestionIndex + 1} • {activeQ.type?.replace("_", " ").toUpperCase()}
                            </span>
                            <h2 className="text-sm font-bold text-foreground mt-3 leading-relaxed">
                              {activeQ.content}
                            </h2>
                          </div>

                          {/* Rubric View */}
                          {activeQ.rubric && (
                            <div className="border border-border/50 rounded-xl p-4 bg-muted/10 space-y-3">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Grading Rubric</h4>
                              <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                {activeQ.rubric.description || activeQ.rubric.title}
                              </div>
                            </div>
                          )}

                          {/* Collapsible Member Participation section */}
                          <Card className="shadow-none border border-border/50 bg-card/25 rounded-xl overflow-hidden bg-muted/5">
                            <CardHeader className="py-2.5 px-4 border-b border-border/30 bg-muted/10">
                              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Users className="size-3.5 text-primary" /> Member Participation for Q{groupGraderActiveQuestionIndex + 1}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 space-y-2">
                              {(() => {
                                const contributors = selectedGroupSubmission.members.map((m: any) => {
                                  const memberActs = selectedGroupSubmission.activities?.filter(
                                    (act: any) => act.student_id === m.student_id && act.question_id === activeQ.id
                                  ) || [];
                                  return {
                                    ...m,
                                    edits: memberActs.length,
                                    last_edit: memberActs.reduce((latest: any, cur: any) => {
                                      return !latest || new Date(cur.created_at) > new Date(latest.created_at) ? cur : latest;
                                    }, null)?.created_at
                                  };
                                });
                                return (
                                  <div className="space-y-1.5">
                                    {contributors.map((c: any) => (
                                      <div key={c.student_id} className="text-xs flex items-center justify-between p-2 rounded-lg bg-background border border-border/10">
                                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                          {c.student_name}
                                          {c.is_leader && (
                                            <Badge className="text-[8px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0">
                                              Leader
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-3">
                                          <span>Edits: <span className="font-bold text-foreground">{c.edits}</span></span>
                                          {c.last_edit ? (
                                            <span>Last Edit: <span className="font-bold text-foreground">{formatDistanceToNow(new Date(c.last_edit), { addSuffix: true })}</span></span>
                                          ) : (
                                            <span className="italic text-muted-foreground/60">No edits</span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </CardContent>
                          </Card>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Right Pane (Group Response, Scoring & AI review panel) */}
                  <div className="w-96 p-6 overflow-y-auto bg-muted/5 space-y-6">
                    {(() => {
                      const activeQ = selectedGroupSubmission.questions[groupGraderActiveQuestionIndex];
                      if (!activeQ) return null;
                      const answer = selectedGroupSubmission.answers.find((a: any) => a.question_id === activeQ.id);

                      const renderAnswerContent = (ansContent: any) => {
                        if (!ansContent) return <p className="text-xs text-muted-foreground italic font-medium">No answer content submitted by group.</p>;
                        if (typeof ansContent === "string") return <p className="text-xs font-medium text-foreground whitespace-pre-wrap leading-relaxed">{ansContent}</p>;
                        if (ansContent.text !== undefined) return <p className="text-xs font-medium text-foreground whitespace-pre-wrap leading-relaxed">{ansContent.text}</p>;
                        if (ansContent.answer_text !== undefined) return <p className="text-xs font-medium text-foreground whitespace-pre-wrap leading-relaxed">{ansContent.answer_text}</p>;
                        if (ansContent.selected_option_id !== undefined) {
                          const optionText = activeQ.options?.find((o: any) => o.id === ansContent.selected_option_id)?.text || ansContent.selected_option_id;
                          return <p className="text-xs font-semibold text-foreground">Selected Option: <span className="font-medium text-primary">{optionText}</span></p>;
                        }
                        if (ansContent.selected_options !== undefined) return <p className="text-xs font-medium text-foreground">Selected: {JSON.stringify(ansContent.selected_options)}</p>;
                        return <pre className="text-[10px] bg-muted/60 border p-3 rounded-lg overflow-auto max-w-full font-mono text-foreground">{JSON.stringify(ansContent, null, 2)}</pre>;
                      };

                      return (
                        <div className="space-y-6">
                          {/* Response Trace */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <FileText className="size-3.5 text-primary" /> Group Collaborative Answer
                            </h4>
                            <div className="text-xs leading-relaxed border border-border/60 rounded-xl p-4 bg-background shadow-sm whitespace-pre-wrap text-foreground/90 min-h-[120px]">
                              {renderAnswerContent(answer?.answer_content)}
                            </div>
                          </div>

                          {/* AI Grading Integration */}
                          {answer && (
                            <div className="space-y-3">
                              <AIReviewPanel
                                queueItemId={selectedGroupSubmission.submission_id}
                                responseId={answer.id}
                                maxScore={activeQ.marks || 10}
                                onSuggestionApplied={(score) => {
                                  setGroupScore(score.toString());
                                  toast.success("AI suggested score applied to score field!");
                                }}
                              />
                              <AIFeedbackEditor
                                responseId={answer.id}
                                initialDraft={undefined}
                                onDraftApplied={(text) => setGroupFeedback(text)}
                              />
                            </div>
                          )}

                          {/* Group Scoring */}
                          <div className="border-t border-border/40 pt-4 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                              <Scale className="size-3.5 text-primary" /> Group Evaluation
                            </h4>

                            {/* Overrides Toggle */}
                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/10 border border-border/10">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-foreground">Individual Override</span>
                                <span className="text-[9px] text-muted-foreground/75 mt-0.5 leading-none">Differentiate score per member</span>
                              </div>
                              <input
                                type="checkbox"
                                id="override-toggle"
                                checked={isOverrideEnabled}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setIsOverrideEnabled(checked);
                                  if (checked) {
                                    const overrides: Record<string, string> = {};
                                    selectedGroupSubmission.members.forEach((m: any) => {
                                      overrides[m.student_id] = memberScoreOverrides[m.student_id] || groupScore;
                                    });
                                    setMemberScoreOverrides(overrides);
                                  }
                                }}
                                className="size-4 rounded border-border bg-background cursor-pointer"
                              />
                            </div>

                            {/* Scoring Inputs */}
                            {!isOverrideEnabled ? (
                              <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-foreground">Uniform Group Score (Out of {selectedGroupSubmission.assessment?.total_marks || 100})</Label>
                                <Input
                                  type="number"
                                  step="0.5"
                                  value={groupScore}
                                  onChange={(e) => setGroupScore(e.target.value)}
                                  placeholder="e.g. 85"
                                  className="h-10 text-sm font-semibold"
                                />
                              </div>
                            ) : (
                              <div className="space-y-2 border border-border/50 rounded-xl p-3 bg-muted/10">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Member Override List</span>
                                <div className="space-y-2">
                                  {selectedGroupSubmission.members.map((m: any) => (
                                    <div key={m.student_id} className="flex items-center justify-between gap-3 text-xs">
                                      <span className="font-semibold truncate max-w-[120px]">{m.student_name}</span>
                                      <Input
                                        type="number"
                                        step="0.5"
                                        value={memberScoreOverrides[m.student_id] !== undefined ? memberScoreOverrides[m.student_id] : groupScore}
                                        onChange={(e) => setMemberScoreOverrides({ ...memberScoreOverrides, [m.student_id]: e.target.value })}
                                        placeholder={groupScore}
                                        className="h-8 w-20 text-xs text-right font-bold"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Feedback Textarea */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-foreground">Feedback for Group</Label>
                              <Textarea
                                rows={4}
                                value={groupFeedback}
                                onChange={(e) => setGroupFeedback(e.target.value)}
                                placeholder="Constructive comments for the team submission..."
                                className="text-xs"
                              />
                            </div>

                            {/* Evaluation Buttons */}
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                className="flex-1 h-9 text-xs font-semibold"
                                onClick={() => {
                                  submitGroupGrade();
                                }}
                                disabled={gradingGroup}
                              >
                                Save Draft
                              </Button>
                              <Button
                                className="flex-1 h-9 text-xs font-semibold"
                                onClick={() => {
                                  submitGroupGrade();
                                }}
                                disabled={gradingGroup}
                              >
                                {gradingGroup && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                                Confirm Evaluation
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Right Sidebar - Group Context (replaces integrity panel) */}
                <div className="w-80 border-l border-border/40 bg-muted/5 flex flex-col p-4 space-y-6 overflow-y-auto">
                  {/* Group Members List */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                      Team Members & Participation
                    </h3>
                    <div className="divide-y divide-border/20 border border-border/50 rounded-xl bg-background overflow-hidden">
                      {selectedGroupSubmission.members?.map((m: any) => (
                        <div key={m.student_id} className="p-3 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-semibold text-foreground flex items-center gap-1">
                              {m.student_name}
                              {m.is_leader && (
                                <Badge className="text-[8px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1 py-0">
                                  Leader
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Edits: <span className="font-bold text-foreground">{m.participation_count || 0}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submission Approval Timeline */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                      Approval Status Timeline
                    </h3>
                    <div className="divide-y divide-border/20 border border-border/50 rounded-xl bg-background overflow-hidden">
                      {selectedGroupSubmission.members?.map((m: any) => (
                        <div key={m.student_id} className="p-3 flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">{m.student_name}</span>
                          <Badge
                            className={cn(
                              "text-[8px] font-bold uppercase tracking-wider",
                              m.approval_status === "APPROVED" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                              m.approval_status === "REJECTED" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                              "bg-zinc-500/10 text-zinc-600 border-zinc-500/20"
                            )}
                          >
                            {m.approval_status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Condensed Activity Feed */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                      Workspace Activity
                    </h3>
                    <div className="border border-border/50 rounded-xl bg-background p-3 space-y-3 max-h-48 overflow-y-auto">
                      {selectedGroupSubmission.activity_log && selectedGroupSubmission.activity_log.length > 0 ? (
                        selectedGroupSubmission.activity_log.slice(0, 10).map((act: any) => (
                          <div key={act.id} className="text-[10px] space-y-0.5 leading-snug">
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span className="font-bold text-foreground">{act.student_name}</span>
                              <span>{formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}</span>
                            </div>
                            <p className="text-foreground/80 font-medium">
                              Modified shared answer for question details
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground/60 italic text-center py-2">No activity recorded</p>
                      )}
                    </div>
                  </div>

                  {/* More Actions Dropdown */}
                  <div className="pt-2 border-t border-border/20">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full text-xs font-semibold h-9 flex items-center justify-center gap-1">
                          More Actions <ChevronDown className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 bg-background rounded-lg border border-border shadow-md">
                        <DropdownMenuItem
                          onClick={async () => {
                            if (confirm("Are you sure you want to re-open this group submission? This will allow all group members to edit their answers again.")) {
                              try {
                                await groupWorkApi.assignReassessment(selectedGroupSubmission.assessment_id, selectedGroupSubmission.submission_id);
                                toast.success("Group submission re-opened successfully!");
                                setSelectedGroupSubmission(null);
                                if (selectedAssessment) fetchGroupQueue(selectedAssessment.id);
                              } catch (err: any) {
                                toast.error(err.message || "Failed to re-open submission");
                              }
                            }
                          }}
                          className="text-xs font-semibold flex items-center gap-2 cursor-pointer text-amber-600 hover:text-amber-700"
                        >
                          <RefreshCcw className="size-3.5" />
                          Re-open Group Submission
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* NAVIGATION HIERARCHY / DRILL DOWN */
            <>
              {!selectedWorkspace ? (
                /* STEP A: WORKSPACES LIST */
                <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
                  <Table>
                    <TableHeader className="bg-muted/15 border-b border-border/40">
                      <TableRow className="h-10 hover:bg-transparent border-none">
                        <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">Institution</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Teaching Workspace</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class Section</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Students</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Avg Perf.</TableHead>
                        <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workspaces.map((ws: WorkspaceListItem) => (
                        <TableRow 
                          key={ws.id} 
                          className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                          onClick={() => setSelectedWorkspace(ws)}
                        >
                          <TableCell className="px-6 py-2">
                            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20">
                              {ws.institution_name}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{ws.title}</span>
                          </TableCell>
                          <TableCell className="py-2 text-xs font-medium text-muted-foreground/80">{ws.class_name}</TableCell>
                          <TableCell className="py-2 text-center">
                            <span className="text-xs font-bold text-foreground/70 flex items-center justify-center gap-1.5">
                              <Users className="size-3.5 opacity-50" /> {ws.student_count}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs font-bold text-foreground/80">{ws.performance_avg}%</span>
                              <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${ws.performance_avg}%` }} />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-6 py-2">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronRight className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {workspaces.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="h-44 text-center text-sm font-medium text-muted-foreground">
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
              ) : !selectedAssessment ? (
                /* STEP B: ASSESSMENTS LIST */
                <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
                  <Table>
                    <TableHeader className="bg-muted/15 border-b border-border/40">
                      <TableRow className="h-10 hover:bg-transparent border-none">
                        <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">Type</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assessment Title</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Marks</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Grading Mode</TableHead>
                        <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deadline</TableHead>
                        <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assessments
                        .filter((a) => a.is_group_assessment)
                        .map((asmt) => (
                          <TableRow 
                            key={asmt.id} 
                            className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all cursor-pointer"
                            onClick={() => {
                              setSelectedAssessment(asmt);
                              fetchGroupQueue(asmt.id);
                            }}
                          >
                            <TableCell className="px-6 py-2">
                              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20">
                                {asmt.assessment_type.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2">
                              <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{asmt.title}</span>
                            </TableCell>
                            <TableCell className="py-2 text-center text-xs font-bold text-foreground/80">{asmt.total_marks} pts</TableCell>
                            <TableCell className="py-2 text-center text-xs font-medium text-muted-foreground/80">{asmt.grading_mode}</TableCell>
                            <TableCell className="py-2 text-xs font-medium text-muted-foreground/80">
                              {asmt.window_end ? new Date(asmt.window_end).toLocaleDateString() : "No Deadline"}
                            </TableCell>
                            <TableCell className="text-right pr-6 py-2">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      {assessments.filter((a) => a.is_group_assessment).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="h-44 text-center text-sm font-medium text-muted-foreground">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <Layers className="size-8 opacity-20" />
                              <p>No collaborative group assessments found.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                /* STEP C: GROUP SUBMISSIONS LIST */
                <div className="border border-border/50 rounded-xl overflow-hidden bg-card/30 backdrop-blur-sm shadow-none animate-in fade-in duration-300">
                  {groupQueueLoading ? (
                    <div className="p-16 text-center space-y-3">
                      <Loader2 className="size-8 text-primary animate-spin mx-auto" />
                      <p className="text-xs text-muted-foreground font-medium">Loading group submissions...</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/15 border-b border-border/40">
                        <TableRow className="h-10 hover:bg-transparent border-none">
                          <TableHead className="text-xs font-semibold px-6 text-muted-foreground uppercase tracking-wider">Group Name</TableHead>
                          <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members</TableHead>
                          <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Approvals</TableHead>
                          <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Status</TableHead>
                          <TableHead className="text-right text-xs font-semibold pr-6 text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupQueue.length > 0 ? (
                          groupQueue.map((item: any) => (
                            <TableRow
                              key={item.id}
                              className="group hover:bg-primary/[0.03] h-14 border-border/10 transition-all"
                            >
                              <TableCell className="px-6 py-2">
                                <span className="text-sm font-bold text-foreground">{item.group_name}</span>
                              </TableCell>
                              <TableCell className="py-2 text-xs font-semibold text-foreground/80">
                                {item.member_count} Members
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-[10px] font-bold text-muted-foreground">
                                    {item.approved_member_count} / {item.member_count} Approved
                                  </span>
                                  <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500 transition-all duration-300"
                                      style={{ width: `${item.member_count ? (item.approved_member_count / item.member_count) * 100 : 0}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Badge
                                  className={cn(
                                    "text-[9px] font-bold uppercase tracking-wider border",
                                    item.status === "GRADED"
                                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                      : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                  )}
                                >
                                  {item.status === "GRADED" ? `Graded (${item.score}/${item.max_score || 100})` : "Needs Review"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right pr-6 py-2">
                                <Button
                                  size="sm"
                                  onClick={() => openGroupSubmission(item.id)}
                                  className="h-8 font-semibold rounded-lg text-xs"
                                >
                                  Open Group
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="h-44 text-center text-sm font-medium text-muted-foreground"
                            >
                              <div className="flex flex-col items-center justify-center gap-3">
                                <Users className="size-8 opacity-20" />
                                <p>No submitted groups found for this assessment.</p>
                                <p className="text-xs text-muted-foreground/80 font-normal max-w-sm">
                                  Only groups that have finalized and submitted their work are listed here for grading.
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Bulk AI Grades Accept Preview Dialog */}
      <Dialog open={showAcceptAllPreview} onOpenChange={setShowAcceptAllPreview}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 rounded-xl border border-border shadow-2xl bg-background">
          <DialogHeader className="pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 text-primary">
              <BrainCircuit className="size-5" />
              <DialogTitle className="text-lg font-bold">Review & Approve AI Suggested Grades</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground/80 mt-1">
              You are bulk-approving AI suggested scores. In accordance with the institutional Human-in-the-Loop policy, please review the rationale and scores before finalizing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4">
            <div className="border border-border/60 rounded-xl overflow-hidden bg-muted/5">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="border-border/30 h-10">
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider pl-4">Student</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Question</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center">Score</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center">Confidence / Basis</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider pr-4">AI Suggested Rationale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acceptAllPreviewItems.map((item) => (
                    <TableRow key={item.id} className="border-border/10 hover:bg-muted/10 h-12">
                      <TableCell className="text-xs font-bold pl-4 text-foreground truncate max-w-[150px]">
                        {item.student_name}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-muted-foreground truncate max-w-[180px]">
                        {item.question_title || "Open-ended Question"}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-center text-primary tabular-nums">
                        {item.ai_suggested_score} pts
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1 justify-center">
                          <span className="text-[10px] font-semibold text-muted-foreground/80">
                            {Math.round((item.ai_confidence || 0) * 100)}%
                          </span>
                          {item.ai_grading_basis === "RUBRIC" ? (
                            <Badge variant="outline" className="text-[8px] py-0 font-bold bg-emerald-500/10 border-emerald-500/20 text-emerald-700 uppercase">
                              Rubric
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[8px] py-0 font-bold bg-amber-500/10 border-amber-500/20 text-amber-700 uppercase">
                              General
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground/90 pr-4 leading-relaxed max-w-[280px]">
                        <p className="line-clamp-2 hover:line-clamp-none transition-all cursor-pointer bg-muted/20 hover:bg-muted/50 p-1.5 rounded-lg border border-border/40" title="Click to expand rationale">
                          {item.ai_feedback_draft || item.feedback || "No rationale provided."}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border/40 flex justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAcceptAllPreview(false)}
              className="text-xs rounded-xl h-9"
            >
              Cancel & Edit Individually
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={commitAcceptAllAi}
              className="text-xs rounded-xl h-9 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
            >
              Confirm & Finalize {acceptAllPreviewItems.length} Grades
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Batch AI Grade Review Modal */}
      <Dialog open={showBatchReviewModal} onOpenChange={setShowBatchReviewModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-xl border border-border shadow-2xl bg-background">
          <DialogHeader className="pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 text-primary">
              <BrainCircuit className="size-5" />
              <DialogTitle className="text-lg font-bold">Review AI Suggestion</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground/80 mt-1">
              Verify the student response and AI feedback draft details below before finalizing this grade.
            </DialogDescription>
          </DialogHeader>

          {batchReviewLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="size-6 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">Retrieving grading details & rubric alignment...</p>
            </div>
          ) : batchReviewItem ? (
            <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4 text-left">
              {/* Student Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-muted/20 p-3 rounded-lg border border-border/40">
                <div>
                  <span className="font-semibold text-muted-foreground block mb-0.5">Student</span>
                  <span className="font-bold text-foreground">{batchReviewItem.student_name}</span>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground block mb-0.5">Suggested Score</span>
                  <span className="font-bold text-primary">{batchReviewItem.ai_suggested_score} pts</span>
                </div>
              </div>

              {/* Full Response Text */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Student Response</span>
                <div className="text-xs p-3 bg-muted/10 border border-border/60 rounded-xl whitespace-pre-wrap leading-relaxed max-h-[150px] overflow-y-auto font-mono">
                  {batchReviewItem.student_answer || <span className="italic text-muted-foreground">No response.</span>}
                </div>
              </div>

              {/* AI Details / Rubric / Basis */}
              <div className="space-y-3 border-t border-border/30 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">AI Grading Basis</span>
                  {batchReviewDetails?.ai_grading_basis === "RUBRIC" ? (
                    <Badge variant="outline" className="text-[10px] font-bold uppercase bg-emerald-500/10 border-emerald-500/20 text-emerald-700 shadow-none">
                      Rubric-Based AI Grading
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-bold uppercase bg-amber-500/10 border-amber-500/20 text-amber-700 shadow-none">
                      General Knowledge AI Grading
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">AI Grading Rationale & Feedback Draft</span>
                  <div className="text-xs p-3 bg-primary/[0.02] border border-primary/10 rounded-xl leading-relaxed">
                    {batchReviewDetails?.ai_feedback_draft || batchReviewDetails?.ai_rationale || "No rationale or feedback draft available."}
                  </div>
                </div>

                {batchReviewDetails?.rubric_scores && batchReviewDetails.rubric_scores.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Rubric Criterion Breakdown</span>
                    <div className="space-y-2">
                      {batchReviewDetails.rubric_scores.map((note: any, idx: number) => (
                        <div key={idx} className="bg-background rounded-lg border border-border/40 p-2.5 text-xs">
                          <div className="flex justify-between font-bold mb-1">
                            <span>{note.criterion}</span>
                            <span className="text-primary">{note.marks_awarded} pts</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-normal">{note.notes}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center py-6 text-sm text-muted-foreground">
              No response data selected.
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-border/40 flex justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBatchReviewModal(false)}
              className="text-xs rounded-xl h-9"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={batchReviewLoading || !batchReviewItem}
              onClick={() => {
                if (batchReviewItem) {
                  handleBatchApplyAi(batchReviewItem.response_id, batchReviewItem.ai_suggested_score!);
                  setShowBatchReviewModal(false);
                }
              }}
              className="text-xs rounded-xl h-9 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
            >
              Confirm & Save Grade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
