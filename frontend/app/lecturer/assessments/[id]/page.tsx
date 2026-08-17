// app/lecturer/assessments/[id]/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Shield,
  Users,
  Layout,
  Cpu,
  Play,
  StopCircle,
  Lock,
  Unlock,
  FileText,
  ChevronRight,
  BarChart4,
  Flag,
  BookOpen,
  AlertCircle,
  Sparkles,
  Check,
  X,
  CheckSquare,
  Pencil,
  AlertTriangle,
  Award,
  Download,
  Loader2 as LoaderCircleIcon,
  CheckCircle2,
  Trash2,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import { assessmentApi } from "@/lib/api/assessment";
import { supervisionApi } from "@/lib/api/supervision";
import { resultApi } from "@/lib/api/result";
import { attemptApi } from "@/lib/api/attempt";
import { gradingApi } from "@/lib/api/grading";
import { aiGenerationApi } from "@/lib/api/ai-generation";
import { Skeleton } from "@/components/ui/interfaces-skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BlueprintSection {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  allocated_marks: number;
  question_count_target: number;
  allowed_question_types?: { types: string[] };
  difficultyDistribution?: {
    easy: number;
    medium: number;
    hard: number;
  };
  aiPromptHint?: string;
}

interface Question {
  id: string;
  sectionId: string;
  groupId?: string;
  text: string;
  imageUrl?: string;
  type: string;
  marks: number;
  options: any[];
  aiGenerated: boolean;
  is_required: boolean;
  bloom_level?: string;
}
const mapFrontendToBackendType = (type: string): string => {
  if (type === "truefalse") return "true_false";
  if (type === "shortanswer") return "short_answer";
  if (type === "fillblank") return "fill_blank";
  if (type === "casestudy") return "case_study";
  return type;
};

const mapBackendToFrontendType = (type: string): string => {
  const norm = (type || "").toLowerCase().replaceAll("_", "");
  if (norm === "truefalse") return "truefalse";
  if (norm === "shortanswer") return "shortanswer";
  if (norm === "fillblank") return "fillblank";
  if (norm === "casestudy" || norm === "casestudycontext" || norm === "case_study") return "casestudy";
  return norm;
};

export default function AssessmentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [assessment, setAssessment] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [supervisionStats, setSupervisionStats] = useState<any>(null);
  const [flags, setFlags] = useState<any[]>([]);
  const [gradingQueue, setGradingQueue] = useState<any[]>([]);
  const [releasingResults, setReleasingResults] = useState(false);

  // AI Generation State
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerationProgress, setAiGenerationProgress] = useState(0);
  const [aiGenerationConfig, setAiGenerationConfig] = useState({
    topic: "",
    question_type: "mcq",
    difficulty: "medium",
    bloom_level: "understand",
    count: 3,
    additional_context: "",
    easyPercent: 30,
    mediumPercent: 40,
    hardPercent: 30,
  });
  const [aiReviewDrawerOpen, setAiReviewDrawerOpen] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<any[]>([]);
  const [aiTargetSectionId, setAiTargetSectionId] = useState<string>("");
  const [aiPollingBatchId, setAiPollingBatchId] = useState<string | null>(null);

  // Stats on generation review session
  const [aiAcceptedCount, setAiAcceptedCount] = useState(0);
  const [aiRejectedCount, setAiRejectedCount] = useState(0);
  const [aiInitialBatchCount, setAiInitialBatchCount] = useState(0);

  // Editing Candidate State
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingExplanation, setEditingExplanation] = useState("");
  const [editingMarks, setEditingMarks] = useState(2);

  // Fetch full assessment data & statistics
  const fetchDetails = useCallback(async () => {
    try {
      const data = await assessmentApi.getAssessmentById(assessmentId);
      setAssessment(data);

      // Fetch validation
      try {
        const valRes = await apiClient(`/blueprint/${assessmentId}/validate`);
        setValidationResult(valRes);
      } catch (e) {
        console.error("Failed to load blueprint validation:", e);
      }

      // Fetch results
      try {
        const resData = await resultApi.getAssessmentResults(assessmentId);
        setResults(resData.items || []);
      } catch (e) {
        console.error("Failed to load results:", e);
      }

      // Fetch attempts
      try {
        const attData = await attemptApi.getAttemptsForAssessment(assessmentId);
        setAttempts(attData || []);
      } catch (e) {
        console.error("Failed to load attempts:", e);
      }

      // Fetch supervision stats and flags
      try {
        const supStats = await supervisionApi.getStats(assessmentId);
        setSupervisionStats(supStats);
      } catch (e) {
        console.error("Failed to load supervision stats:", e);
      }

      try {
        const supFlags = await supervisionApi.getFlags(assessmentId);
        setFlags(supFlags.flags || []);
      } catch (e) {
        console.error("Failed to load flags:", e);
      }

      // Fetch grading queue
      try {
        const gradingData = await gradingApi.getGradingQueue({ assessment_id: assessmentId });
        setGradingQueue(gradingData.items || []);
      } catch (e) {
        console.error("Failed to load grading queue:", e);
      }
    } catch (err) {
      toast.error("Failed to load assessment details.");
    } finally {
      setIsLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    if (assessmentId) {
      fetchDetails();
    }
  }, [assessmentId, fetchDetails]);

  // Derived Grading Stats
  const ungradedCount = useMemo(() => gradingQueue.length, [gradingQueue]);
  const gradedCount = useMemo(() => results.length, [results]);
  const totalSubmissions = useMemo(() => gradedCount + ungradedCount, [gradedCount, ungradedCount]);
  const gradingProgressPercent = useMemo(() => {
    if (totalSubmissions === 0) return 100;
    return Math.round((gradedCount / totalSubmissions) * 100);
  }, [gradedCount, totalSubmissions]);

  // Derived Attempt Stats
  const attemptStats = useMemo(() => {
    let started = 0;
    let submitted = 0;
    let other = 0;

    attempts.forEach((a) => {
      if (a.status === "IN_PROGRESS" || a.status === "PAUSED") {
        started++;
      } else if (a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED") {
        submitted++;
      } else {
        other++;
      }
    });

    return { started, submitted, other, total: attempts.length };
  }, [attempts]);

  // Derived Results for release
  const unreleasedResults = useMemo(() => {
    return results.filter((r) => !r.is_released && !r.integrity_hold);
  }, [results]);

  // Release Results Action
  const handleReleaseResults = async () => {
    if (unreleasedResults.length === 0) {
      toast.info("No unreleased results ready to release.");
      return;
    }
    setReleasingResults(true);
    try {
      const attemptIds = unreleasedResults.map((r) => r.attempt_id);
      await resultApi.releaseResults(assessmentId, attemptIds);
      toast.success(`Successfully released ${attemptIds.length} results to students.`);
      fetchDetails();
    } catch (err) {
      toast.error("Failed to release results.");
    } finally {
      setReleasingResults(false);
    }
  };

  // AI Generation Polling Loop
  const pollBatchStatus = useCallback((batchId: string, currentTick = 0) => {
    const maxTicks = 60; // 120 seconds max (2s interval)
    if (currentTick >= maxTicks) {
      setAiGenerating(false);
      toast.error("AI question generation timed out. Please try again.");
      return;
    }

    setTimeout(async () => {
      try {
        const batch = await aiGenerationApi.getBatch(batchId);
        setAiGenerationProgress(Math.min(95, Math.round(((currentTick + 1) / maxTicks) * 100)));
        const status = batch.status?.toLowerCase();

        if (status === "completed" || status === "partial_failure") {
          const generatedQuestions = batch.questions || [];
          if (generatedQuestions.length === 0) {
            setAiGenerating(false);
            toast.error("AI finished, but zero questions were successfully generated. Please check constraints.");
            return;
          }
          setAiCandidates(generatedQuestions);
          setAiInitialBatchCount(generatedQuestions.length);
          setAiAcceptedCount(0);
          setAiRejectedCount(0);
          setAiGenerating(false);
          setAiReviewDrawerOpen(true);
          toast.success(`AI generated ${generatedQuestions.length} question candidates!`);
        } else if (status === "failed") {
          setAiGenerating(false);
          toast.error(batch.error_message || "AI question generation failed on server.");
        } else {
          // Continue polling
          pollBatchStatus(batchId, currentTick + 1);
        }
      } catch (err) {
        console.error("Polling batch failed:", err);
        // Continue polling despite small errors
        pollBatchStatus(batchId, currentTick + 1);
      }
    }, 2000);
  }, []);

  // AI Generate Call
  const handleAIGenerate = async () => {
    // Verify constraints before API call
    const targetSection = assessment.sections?.find((s: any) => s.id === aiTargetSectionId);
    if (!targetSection) {
      toast.error("Invalid target section selected.");
      return;
    }

    const allowedTypes = targetSection.allowed_question_types?.types || [];
    if (allowedTypes.length === 0) {
      toast.error("Target section must have at least 1 question type selected.");
      return;
    }
    if (!targetSection.question_count_target || targetSection.question_count_target <= 0) {
      toast.error("Target section must have a question count target > 0.");
      return;
    }
    if (!targetSection.allocated_marks || targetSection.allocated_marks <= 0) {
      toast.error("Target section must have allocated marks > 0.");
      return;
    }

    setAiGenerating(true);
    setAiGenerationProgress(5);
    setAiDrawerOpen(false);

    try {
      const mappedType = mapFrontendToBackendType(aiGenerationConfig.question_type);

      const res = await aiGenerationApi.generateQuestions({
        subject: assessment.title || "Subject",
        topic: aiGenerationConfig.topic,
        question_type: mappedType as any,
        difficulty: aiGenerationConfig.difficulty as any,
        count: aiGenerationConfig.count,
        bloom_level: aiGenerationConfig.bloom_level as any,
        additional_context: aiGenerationConfig.additional_context,
        target_assessment_id: assessmentId,
        workspace_id: (assessment as any).teaching_workspace_id || undefined,
      });

      setAiPollingBatchId(res.id);
      pollBatchStatus(res.id);
    } catch (err) {
      setAiGenerating(false);
      toast.error("Failed to trigger AI generation.");
    }
  };

  // Accept single candidate
  const handleAcceptCandidate = async (candId: string) => {
    const candidate = aiCandidates.find((c) => c.id === candId);
    if (!candidate) return;

    try {
      // Target section mapping to backend
      const backendSectionId = candidate.target_section_id || (candidate as any)._sectionId || aiTargetSectionId;

      const res = await aiGenerationApi.reviewQuestion(candId, {
        decision: "approved",
        add_to_assessment_id: assessmentId,
        add_to_section_id: backendSectionId || undefined,
      });
      
      // Update assessment local questions list dynamically
      const qType = mapBackendToFrontendType(candidate.question_type) || "shortanswer";
      const promotedQId = res?.promoted_question?.id || candidate.id;
      const aq = res?.promoted_question?.assessment_question;

      const newQ: Question = {
        id: promotedQId,
        sectionId: backendSectionId,
        text: candidate.parsed_question_text || "",
        type: qType,
        marks: aq?.marks || 2,
        options: [],
        aiGenerated: true,
        is_required: true,
        bloom_level: candidate.bloom_level || undefined,
      };

      setAssessment((prev: any) => {
        const currentQuestions = prev.assessment_questions || [];
        return {
          ...prev,
          assessment_questions: [...currentQuestions, { 
            id: aq?.id || undefined,
            assessment_id: assessmentId,
            question_id: promotedQId,
            marks_override: aq?.marks || 2,
            assessment_section_id: backendSectionId,
            question: newQ 
          }],
        };
      });

      setAiCandidates((prev) => prev.filter((c) => c.id !== candId));
      setAiAcceptedCount((prev) => prev + 1);
      toast.success("Question accepted and added to section.");
      fetchDetails();
    } catch (err) {
      toast.error("Failed to accept question.");
    }
  };

  // Reject single candidate
  const handleRejectCandidate = async (candId: string) => {
    try {
      await aiGenerationApi.reviewQuestion(candId, {
        decision: "rejected",
      });
      setAiCandidates((prev) => prev.filter((c) => c.id !== candId));
      setAiRejectedCount((prev) => prev + 1);
      toast.info("Question rejected.");
    } catch (err) {
      toast.error("Failed to reject question.");
    }
  };

  // Save edited candidate
  const handleSaveEditedCandidate = async (candId: string) => {
    const candidate = aiCandidates.find((c) => c.id === candId);
    if (!candidate) return;

    try {
      const backendSectionId = candidate.target_section_id || (candidate as any)._sectionId || aiTargetSectionId;
      const res = await aiGenerationApi.reviewQuestion(candId, {
        decision: "edited",
        modified_question_text: editingText,
        modified_explanation: editingExplanation,
        add_to_assessment_id: assessmentId,
        add_to_section_id: backendSectionId || undefined,
      });

      const qType = mapBackendToFrontendType(candidate.question_type) || "shortanswer";
      const promotedQId = res?.promoted_question?.id || candidate.id;
      const aq = res?.promoted_question?.assessment_question;

      const newQ: Question = {
        id: promotedQId,
        sectionId: aiTargetSectionId,
        text: editingText,
        type: qType,
        marks: editingMarks,
        options: [],
        aiGenerated: true,
        is_required: true,
        bloom_level: candidate.bloom_level || undefined,
      };

      setAssessment((prev: any) => {
        const currentQuestions = prev.assessment_questions || [];
        return {
          ...prev,
          assessment_questions: [...currentQuestions, { 
            id: aq?.id || undefined,
            assessment_id: assessmentId,
            question_id: promotedQId,
            marks_override: editingMarks,
            assessment_section_id: aiTargetSectionId,
            question: newQ
          }],
        };
      });

      setAiCandidates((prev) => prev.filter((c) => c.id !== candId));
      setAiAcceptedCount((prev) => prev + 1);
      setEditingCandidateId(null);
      toast.success("Edited question accepted and added.");
      fetchDetails();
    } catch (err) {
      toast.error("Failed to save edited question.");
    }
  };

  // Bulk Accept All
  const handleAcceptAll = async () => {
    if (aiCandidates.length === 0) return;
    try {
      const results = await Promise.all(
        aiCandidates.map((c) => {
          const backendSectionId = c.target_section_id || (c as any)._sectionId || aiTargetSectionId;
          return aiGenerationApi.reviewQuestion(c.id, {
            decision: "approved",
            add_to_assessment_id: assessmentId,
            add_to_section_id: backendSectionId || undefined,
          });
        })
      );

      const addedQuestions = aiCandidates.map((c, index) => {
        const res = results[index];
        const promotedQId = res?.promoted_question?.id || c.id;
        const aq = res?.promoted_question?.assessment_question;
        const backendSectionId = c.target_section_id || (c as any)._sectionId || aiTargetSectionId;
        return {
          id: aq?.id || undefined,
          assessment_id: assessmentId,
          question_id: promotedQId,
          marks_override: aq?.marks || 2,
          assessment_section_id: backendSectionId,
          question: {
            id: promotedQId,
            sectionId: backendSectionId,
            text: c.parsed_question_text || "",
            type: mapBackendToFrontendType(c.question_type) || "shortanswer",
            marks: 2,
            options: [],
            aiGenerated: true,
            is_required: true,
            bloom_level: c.bloom_level || undefined,
          },
        };
      });

      setAssessment((prev: any) => ({
        ...prev,
        assessment_questions: [...(prev.assessment_questions || []), ...addedQuestions],
      }));

      setAiAcceptedCount((prev) => prev + aiCandidates.length);
      setAiCandidates([]);
      setAiReviewDrawerOpen(false);
      toast.success("All question candidates accepted successfully.");
      fetchDetails();
    } catch (err) {
      toast.error("Failed to accept all questions.");
    }
  };

  // Bulk Reject All
  const handleRejectAll = async () => {
    if (aiCandidates.length === 0) return;
    try {
      await Promise.all(
        aiCandidates.map((c) =>
          aiGenerationApi.reviewQuestion(c.id, {
            decision: "rejected",
          })
        )
      );

      setAiRejectedCount((prev) => prev + aiCandidates.length);
      setAiCandidates([]);
      setAiReviewDrawerOpen(false);
      toast.info("All question candidates rejected.");
    } catch (err) {
      toast.error("Failed to reject all questions.");
    }
  };

  if (isLoading) {
    return (
      <div className="w-full space-y-4 p-2 md:p-4 animate-pulse">
        <div className="flex items-center gap-4 pb-3 border-b">
          <Skeleton variant="title" className="h-6 w-6 rounded-full" />
          <Skeleton variant="title" className="h-9 w-64 rounded-md" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton variant="media" className="h-36 rounded-xl" />
          <Skeleton variant="media" className="h-36 rounded-xl" />
          <Skeleton variant="media" className="h-36 rounded-xl" />
        </div>
        <Skeleton variant="media" className="h-[400px] rounded-xl" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <AlertTriangle className="size-12 text-destructive" />
        <h2 className="text-base font-bold text-zinc-800">Assessment Not Found</h2>
        <p className="text-xs text-zinc-500 font-medium">This assessment does not exist or has been deleted.</p>
        <Button size="sm" className="h-8 text-xs rounded-lg" onClick={() => router.push("/lecturer/assessments")}>Back to Assessments</Button>
      </div>
    );
  }

  const isDraft = assessment.status === "DRAFT";
  const isActive = assessment.status === "ACTIVE";

  return (
    <div className="w-full space-y-3.5 p-1 md:p-2 animate-in fade-in duration-200">
      {/* Header card with gradient header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push("/lecturer/assessments")}
            className="h-8 w-8 rounded-lg shrink-0 border-zinc-200 bg-white hover:bg-zinc-50"
          >
            <ArrowLeft className="size-4 text-zinc-600" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 truncate">{assessment.title}</h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium">
              {assessment.course_name || "Course Not Linked"} · Created {format(new Date(assessment.created_at), "PPP")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Edit button */}
          <Button
            onClick={() => router.push(`/lecturer/assessments/${assessmentId}/edit`)}
            disabled={!isDraft && assessment.status !== "PUBLISHED" && assessment.status !== "SCHEDULED"}
            variant="outline"
            size="sm"
            className="h-8 text-[10px] font-bold uppercase tracking-wider rounded-lg border-zinc-200 bg-white"
          >
            <Pencil className="size-3.5 mr-1.5" />
            Edit Settings
          </Button>

          {/* Status Badge */}
          <Badge
            className={cn(
              "h-9 px-4 font-bold uppercase tracking-wider text-[11px] rounded-lg",
              assessment.status === "DRAFT" && "bg-slate-100 text-slate-700 border border-slate-300",
              assessment.status === "PUBLISHED" && "bg-blue-50 text-blue-700 border border-blue-200",
              assessment.status === "SCHEDULED" && "bg-amber-50 text-amber-700 border border-amber-200",
              assessment.status === "ACTIVE" && "bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse",
              assessment.status === "CLOSED" && "bg-rose-50 text-rose-700 border border-rose-200"
            )}
          >
            {assessment.status}
          </Badge>
        </div>
      </div>

      {/* Progress & statistics dashboard rows */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Grading widget */}
        <Card className="shadow-none border hover:border-primary/10 transition-colors">
          <CardHeader className="py-4 border-b bg-muted/5">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Grading Progress</span>
              <Badge variant="outline" className="text-[10px] font-bold">
                {gradingProgressPercent}% Graded
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-semibold text-foreground">
                  {gradedCount} / {totalSubmissions} submissions graded
                </span>
              </div>
              <Progress value={gradingProgressPercent} className="h-2" />
            </div>
            <Button
              className="w-full text-xs h-9 font-semibold"
              variant="outline"
              onClick={() => router.push(`/lecturer/grading?assessment_id=${assessmentId}`)}
            >
              <CheckSquare className="size-3.5 mr-2" /> View Grading Queue
            </Button>
          </CardContent>
        </Card>

        {/* Student Attempts statistics */}
        <Card className="shadow-none border hover:border-primary/10 transition-colors">
          <CardHeader className="py-4 border-b bg-muted/5">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Attempt Activity</span>
              <Badge variant="outline" className="text-[10px] font-bold">
                {attemptStats.total} total students
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 border rounded-lg bg-emerald-50/25 border-emerald-100">
                <span className="block text-lg font-extrabold text-emerald-600 tabular-nums">
                  {attemptStats.submitted}
                </span>
                <span className="text-[9px] font-semibold text-emerald-800 uppercase tracking-tight">Submitted</span>
              </div>
              <div className="p-2 border rounded-lg bg-blue-50/25 border-blue-100">
                <span className="block text-lg font-extrabold text-blue-600 tabular-nums">
                  {attemptStats.started}
                </span>
                <span className="text-[9px] font-semibold text-blue-800 uppercase tracking-tight">Started</span>
              </div>
              <div className="p-2 border rounded-lg bg-slate-50 border-slate-200">
                <span className="block text-lg font-extrabold text-slate-500 tabular-nums">
                  {attemptStats.other}
                </span>
                <span className="text-[9px] font-semibold text-slate-600 uppercase tracking-tight">Inactive</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integrity summary stats */}
        <Card className="shadow-none border hover:border-primary/10 transition-colors">
          <CardHeader className="py-4 border-b bg-muted/5">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Integrity Overview</span>
              <Badge variant="outline" className="text-[10px] font-bold text-amber-700 bg-amber-50">
                {(supervisionStats?.warning_count || 0)} warnings
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Flag className="size-4 text-red-500" />
                <span className="text-muted-foreground font-medium">Open Flags:</span>
              </div>
              <span className="font-bold text-red-600">
                {flags.filter((f) => f.status === "OPEN" || f.status === "UNDER_REVIEW").length}
              </span>
            </div>
            {isActive ? (
              <Button
                className="w-full text-xs h-9 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                onClick={() => router.push(`/lecturer/supervision?assessment=${assessmentId}`)}
              >
                <Play className="size-3.5 mr-2 fill-current" /> Live Supervision Panel
              </Button>
            ) : (
              <Button
                className="w-full text-xs h-9 font-semibold"
                variant="outline"
                onClick={() => router.push(`/lecturer/supervision?assessment=${assessmentId}`)}
              >
                <Eye className="size-3.5 mr-2" /> View Supervision Logs
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manual release results controls */}
      {assessment.result_release_mode === "MANUAL" && unreleasedResults.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/20 shadow-none border overflow-hidden">
          <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                <Award className="size-4 text-emerald-600" /> Results Pending Release
              </h4>
              <p className="text-xs text-emerald-800">
                Lecturers have graded and finalized <strong>{unreleasedResults.length}</strong> attempts. Results are not yet visible to students.
              </p>
            </div>
            <Button
              onClick={handleReleaseResults}
              disabled={releasingResults}
              className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shrink-0 px-6"
            >
              {releasingResults ? "Releasing..." : `Release ${unreleasedResults.length} Results`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Settings read-only display cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-none border">
            <CardHeader className="py-4 border-b bg-muted/5">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Assessments Environment & Security Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-dashed">
                    <span className="text-xs font-semibold text-muted-foreground">Proctored/Supervised:</span>
                    <Badge variant={assessment.is_supervised ? "default" : "outline"} className="text-[10px]">
                      {assessment.is_supervised ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-dashed">
                    <span className="text-xs font-semibold text-muted-foreground">Forced Fullscreen:</span>
                    <Badge variant={assessment.fullscreen_required ? "default" : "outline"} className="text-[10px]">
                      {assessment.fullscreen_required ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-dashed">
                    <span className="text-xs font-semibold text-muted-foreground">AI assistance allowed:</span>
                    <Badge variant={assessment.ai_assistance_allowed ? "default" : "outline"} className="text-[10px]">
                      {assessment.ai_assistance_allowed ? "Yes" : "No"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-dashed">
                    <span className="text-xs font-semibold text-muted-foreground">Open Book Exam:</span>
                    <Badge variant={assessment.is_open_book ? "default" : "outline"} className="text-[10px]">
                      {assessment.is_open_book ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-dashed">
                    <span className="text-xs font-semibold text-muted-foreground">Integrity Logs:</span>
                    <Badge variant={assessment.integrity_monitoring_enabled ? "default" : "outline"} className="text-[10px]">
                      {assessment.integrity_monitoring_enabled ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-dashed">
                    <span className="text-xs font-semibold text-muted-foreground">Password Lock:</span>
                    <Badge variant={assessment.is_password_protected ? "default" : "outline"} className="text-[10px]">
                      {assessment.is_password_protected ? "Yes" : "No"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Blueprint compliance details */}
          <Card className="shadow-none border">
            <CardHeader className="py-4 border-b bg-muted/5">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Blueprint Compliance Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {validationResult ? (
                <div className="space-y-3">
                  {validationResult.violations && validationResult.violations.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 px-3 bg-red-50 border border-red-200 text-xs font-semibold text-red-800 rounded-md">
                        <AlertTriangle className="size-4 text-red-600" />
                        <span>This assessment does not comply with the established blueprint rules.</span>
                      </div>
                      <div className="space-y-1.5 pl-3">
                        {validationResult.violations.map((v: any, idx: number) => (
                          <div key={idx} className="text-xs text-red-700 flex items-center gap-2">
                            <X className="size-3.5 text-red-500 shrink-0" />
                            <span>{v.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 rounded-md">
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      <span>Blueprint fully compliant! All rules verified.</span>
                    </div>
                  )}
                  {validationResult.warnings && validationResult.warnings.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <p className="text-xs font-bold text-amber-800">Compliance Warnings:</p>
                      {validationResult.warnings.map((w: any, idx: number) => (
                        <div key={idx} className="text-xs text-amber-700 flex items-center gap-2">
                          <AlertCircle className="size-3.5 text-amber-500 shrink-0" />
                          <span>{w.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Blueprint compliance report is currently unavailable.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Identity details panel */}
        <div className="space-y-6">
          <Card className="shadow-none border">
            <CardHeader className="py-4 border-b bg-muted/5">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Identity & Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-xs">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground font-medium">Type:</span>
                <span className="font-semibold text-foreground uppercase">{assessment.assessment_type}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground font-medium">Total Marks:</span>
                <span className="font-semibold text-foreground">{assessment.total_marks} Marks</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground font-medium">Passing Marks:</span>
                <span className="font-semibold text-foreground">
                  {assessment.passing_marks ?? Math.round(assessment.total_marks * 0.5)} Marks
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground font-medium">Duration:</span>
                <span className="font-semibold text-foreground">{assessment.duration_minutes || "Unlimited"}m</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground font-medium">Release mode:</span>
                <span className="font-semibold text-foreground uppercase">{assessment.result_release_mode}</span>
              </div>
              {assessment.window_start && (
                <div className="flex justify-between items-start py-2 border-b">
                  <span className="text-muted-foreground font-medium">Access Window:</span>
                  <div className="text-right">
                    <p className="font-semibold">{format(new Date(assessment.window_start), "PPp")}</p>
                    <p className="text-[10px] text-muted-foreground">to {format(new Date(assessment.window_end), "p")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sections and read-only questions list */}
      <div className="space-y-6">
        <h3 className="text-lg font-bold tracking-tight">Assessment Blueprint & Questions</h3>

        {assessment.sections?.map((sec: BlueprintSection, secIdx: number) => {
          const sectionQuestions = (assessment.assessment_questions || []).filter(
            (aq: any) => aq.assessment_section_id === sec.id
          );
          const currentSectionMarks = sectionQuestions.reduce((sum: number, aq: any) => sum + (aq.marks_override || 0), 0);

          return (
            <Card key={sec.id} className="shadow-none border overflow-hidden">
              <CardHeader className="bg-muted/30 border-b p-4 flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-bold text-[10px]">
                      {sec.title}
                    </Badge>
                    <span className="text-sm font-semibold">{sec.description || "General Topics"}</span>
                  </div>
                  {sec.instructions && (
                    <p className="text-xs text-muted-foreground mt-1">{sec.instructions}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs">
                    <span className="font-bold block text-sm">
                      {currentSectionMarks} / {sec.allocated_marks} Marks
                    </span>
                    <span className="text-muted-foreground">
                      {sectionQuestions.length} / {sec.question_count_target} questions
                    </span>
                  </div>

                  {/* AI Generation trigger inside draft */}
                  {isDraft && (
                    <Button
                      onClick={() => {
                        setAiTargetSectionId(sec.id);
                        setAiGenerationConfig({
                          topic: sec.description || "",
                          question_type: sec.allowed_question_types?.types?.[0] || "mcq",
                          difficulty: "medium",
                          bloom_level: "understand",
                          count: sec.question_count_target || 3,
                          additional_context: sec.aiPromptHint || "",
                          easyPercent: sec.difficultyDistribution?.easy ?? 30,
                          mediumPercent: sec.difficultyDistribution?.medium ?? 40,
                          hardPercent: sec.difficultyDistribution?.hard ?? 30,
                        });
                        setAiDrawerOpen(true);
                      }}
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px] font-semibold border-primary/30 text-primary hover:bg-primary/5"
                    >
                      <Sparkles className="size-3.5 mr-1" />
                      Generate questions for this section
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {sectionQuestions.map((aq: any, idx: number) => {
                  const q = aq.question;
                  return (
                    <div key={aq.id || q.id} className="flex gap-4 p-4 rounded-lg border bg-background group">
                      <span className="text-muted-foreground font-bold text-lg tabular-nums shrink-0">
                        {(idx + 1).toString().padStart(2, "0")}
                      </span>
                      <div className="space-y-3 flex-1">
                        <div>
                          <p className="font-semibold text-sm leading-relaxed">{q.content}</p>
                          {q.image_url && (
                            <div className="mt-3 inline-block p-1 border rounded-lg overflow-hidden bg-muted/10">
                              <Image
                                src={q.image_url}
                                alt="Question diagram"
                                width={800}
                                height={600}
                                unoptimized
                                className="max-h-48 rounded-md object-contain w-auto h-auto"
                              />
                            </div>
                          )}
                          {q.case_study_context && (
                            <div className="mt-2 p-3 bg-muted/20 border border-dashed rounded-lg text-xs leading-relaxed">
                              <span className="font-bold block text-[9px] uppercase tracking-wider text-primary mb-1">
                                Scenario Context
                              </span>
                              {q.case_study_context}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="h-5 text-[9px] uppercase font-bold">
                            {q.question_type}
                          </Badge>
                          <Badge variant="outline" className="h-5 text-[9px] font-medium">
                            {aq.marks_override || q.marks} Marks
                          </Badge>
                          {q.bloom_level && (
                            <Badge variant="outline" className="h-5 text-[9px] font-semibold text-primary capitalize">
                              {q.bloom_level}
                            </Badge>
                          )}
                          {q.difficulty && (
                            <Badge variant="outline" className="h-5 text-[9px] font-medium uppercase">
                              {q.difficulty}
                            </Badge>
                          )}
                        </div>

                        {/* Options / Grading Key Preview */}
                        <div className="space-y-2 pt-1">
                          {(q.question_type === "mcq" || q.question_type === "true_false") && q.options && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl">
                              {q.options.map((opt: any, oIdx: number) => (
                                <div
                                  key={oIdx}
                                  className={cn(
                                    "text-xs p-2.5 rounded-md border flex items-center justify-between",
                                    opt.is_correct
                                      ? "bg-emerald-50 border-emerald-100 text-emerald-900 font-medium"
                                      : "bg-background border-border"
                                  )}
                                >
                                  <span>{opt.content || opt.option_text}</span>
                                  {opt.is_correct && <CheckCircle2 className="size-3.5 text-emerald-500" />}
                                </div>
                              ))}
                            </div>
                          )}

                          {q.question_type === "matching" && q.options && (
                            <div className="space-y-1 max-w-xl">
                              {q.options.map((opt: any, oIdx: number) => (
                                <div key={oIdx} className="flex items-center gap-3 bg-muted/5 p-2 rounded-md border text-xs">
                                  <span className="font-medium flex-1">{opt.content || opt.option_text}</span>
                                  <ChevronRight className="size-3 text-primary shrink-0" />
                                  <span className="font-bold text-primary flex-1">{opt.match_value || opt.option_text_right}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {q.question_type === "ordering" && q.options && (
                            <div className="space-y-1 max-w-md">
                              {q.options.map((opt: any, oIdx: number) => (
                                <div key={oIdx} className="flex items-center gap-3 border p-2 rounded-md bg-background text-xs">
                                  <span className="size-5 bg-primary text-white rounded-full flex items-center justify-center text-[10px]">
                                    {oIdx + 1}
                                  </span>
                                  <span>{opt.content || opt.option_text}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {(q.question_type === "short_answer" ||
                            q.question_type === "essay" ||
                            q.question_type === "computational" ||
                            q.question_type === "case_study") && (
                            <div className="p-3 bg-muted/10 border-l-2 border-primary/20 rounded-r-md text-xs italic text-muted-foreground">
                              <span className="block text-[9px] font-bold uppercase tracking-wider text-primary not-italic mb-1">
                                Grading Key / Model Answer
                              </span>
                              {q.explanation || (q.options?.[0]?.content || q.options?.[0]?.option_text) || "No grading guide available."}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {sectionQuestions.length === 0 && (
                  <p className="text-xs text-center py-6 text-muted-foreground">
                    No questions have been added to this section yet.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* AI GENERATION CONFIG DRAWER */}
      <Sheet open={aiDrawerOpen} onOpenChange={setAiDrawerOpen}>
        <SheetContent side="right" className="w-[450px] sm:w-[540px] space-y-6">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary animate-pulse" /> AI Question Generator Settings
            </SheetTitle>
            <SheetDescription>
              Configure AI generation constraints. Questions will be appended to the selected section.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Subject / Topic Focus</Label>
              <Input
                value={aiGenerationConfig.topic}
                onChange={(e) => setAiGenerationConfig({ ...aiGenerationConfig, topic: e.target.value })}
                placeholder="e.g. SQL JOIN syntax, database index structures"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Question Type</Label>
                <Select
                  value={aiGenerationConfig.question_type}
                  onValueChange={(v: any) => setAiGenerationConfig({ ...aiGenerationConfig, question_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mcq">Multiple Choice (MCQ)</SelectItem>
                    <SelectItem value="truefalse">True / False</SelectItem>
                    <SelectItem value="shortanswer">Short Answer</SelectItem>
                    <SelectItem value="essay">Essay</SelectItem>
                    <SelectItem value="matching">Matching Pairs</SelectItem>
                    <SelectItem value="fillblank">Fill-in-the-Blank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Questions Count</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={aiGenerationConfig.count}
                  onChange={(e) => setAiGenerationConfig({ ...aiGenerationConfig, count: parseInt(e.target.value) || 3 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Difficulty Level</Label>
                <Select
                  value={aiGenerationConfig.difficulty}
                  onValueChange={(v: any) => setAiGenerationConfig({ ...aiGenerationConfig, difficulty: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{"Bloom's Taxonomy Level"}</Label>
                <Select
                  value={aiGenerationConfig.bloom_level}
                  onValueChange={(v: any) => setAiGenerationConfig({ ...aiGenerationConfig, bloom_level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remember">Remember</SelectItem>
                    <SelectItem value="understand">Understand</SelectItem>
                    <SelectItem value="apply">Apply</SelectItem>
                    <SelectItem value="analyze">Analyze</SelectItem>
                    <SelectItem value="evaluate">Evaluate</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Section difficulty breakdown display */}
            <div className="space-y-2 pt-2 border-t border-dashed">
              <Label className="text-xs font-semibold">Section Difficulty Ratios (Info)</Label>
              <div className="grid grid-cols-3 gap-4 text-center text-xs">
                <div className="p-2 border rounded-md bg-muted/10">
                  <span className="block font-bold text-foreground">{aiGenerationConfig.easyPercent}%</span>
                  <span className="text-[10px] text-muted-foreground">Easy Target</span>
                </div>
                <div className="p-2 border rounded-md bg-muted/10">
                  <span className="block font-bold text-foreground">{aiGenerationConfig.mediumPercent}%</span>
                  <span className="text-[10px] text-muted-foreground">Medium Target</span>
                </div>
                <div className="p-2 border rounded-md bg-muted/10">
                  <span className="block font-bold text-foreground">{aiGenerationConfig.hardPercent}%</span>
                  <span className="text-[10px] text-muted-foreground">Hard Target</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Additional Custom Context</Label>
              <Textarea
                placeholder="Include details about concepts to cover or expected code snippets..."
                className="min-h-[100px]"
                value={aiGenerationConfig.additional_context}
                onChange={(e) => setAiGenerationConfig({ ...aiGenerationConfig, additional_context: e.target.value })}
              />
            </div>
          </div>
          <SheetFooter className="pt-6 border-t">
            <Button variant="ghost" onClick={() => setAiDrawerOpen(false)}>Cancel</Button>
            <Button onClick={handleAIGenerate} className="font-semibold">
              <Sparkles className="mr-2 h-4 w-4" /> Start AI Generation
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* POLLING LOADING BAR OVERLAY */}
      {aiGenerating && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <Card className="max-w-md w-full border border-primary/20 shadow-2xl p-6 space-y-6">
            <div className="flex items-center gap-3">
              <LoaderCircleIcon className="size-6 text-primary animate-spin shrink-0" />
              <div>
                <h3 className="font-bold text-lg">AI Question Generation</h3>
                <p className="text-xs text-muted-foreground">Celery task dispatched. Polling for results...</p>
              </div>
            </div>
            <div className="space-y-2">
              <Progress value={aiGenerationProgress} className="h-2" />
              <div className="flex justify-between text-[10px] text-muted-foreground font-semibold uppercase">
                <span>Contacting Agent...</span>
                <span>{aiGenerationProgress}% Complete</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* AI REVIEW CANDIDATES DRAWER */}
      <Sheet open={aiReviewDrawerOpen} onOpenChange={setAiReviewDrawerOpen}>
        <SheetContent side="right" className="w-[550px] sm:w-[650px] space-y-6">
          <SheetHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-500" /> Review Generated Questions
              </SheetTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleAcceptAll} className="text-xs h-8 text-emerald-600 hover:bg-emerald-50">Accept All</Button>
                <Button variant="outline" size="sm" onClick={handleRejectAll} className="text-xs h-8 text-destructive hover:bg-destructive/5">Reject All</Button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1.5 font-semibold">
              <span>Candidates Remaining: {aiCandidates.length}</span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                {aiAcceptedCount} accepted • {aiRejectedCount} rejected
              </span>
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-220px)] pr-4 space-y-6">
            <div className="space-y-6 pt-2">
              {aiCandidates.map((cand, idx) => {
                const confidence = cand.confidence ?? cand.ai_confidence ?? 1.0;
                const isLowConfidence = confidence < 0.7;

                return (
                  <Card key={cand.id} className="shadow-none border hover:border-primary/20 transition-all">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[9px] font-bold uppercase">{cand.question_type}</Badge>
                          <Badge variant="secondary" className="text-[9px] uppercase">{cand.difficulty}</Badge>
                          {cand.bloom_level && (
                            <Badge variant="outline" className="text-[9px] font-semibold text-primary capitalize">
                              {cand.bloom_level}
                            </Badge>
                          )}
                          {isLowConfidence && (
                            <Badge variant="default" className="text-[9px] font-bold bg-amber-500 hover:bg-amber-600 text-white">
                              Low Confidence
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAcceptCandidate(cand.id)}
                            className="h-8 w-8 text-emerald-600 hover:bg-emerald-50"
                            title="Accept"
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingCandidateId(cand.id);
                              setEditingText(cand.parsed_question_text || "");
                              setEditingExplanation(cand.parsed_explanation || "");
                              setEditingMarks(2);
                            }}
                            className="h-8 w-8 text-primary hover:bg-primary/5"
                            title="Edit"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRejectCandidate(cand.id)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/5"
                            title="Reject"
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {editingCandidateId === cand.id ? (
                        <div className="space-y-3 pt-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Edit Question Text</Label>
                            <Textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="min-h-[80px]"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Override Marks</Label>
                              <Input
                                type="number"
                                value={editingMarks}
                                onChange={(e) => setEditingMarks(parseInt(e.target.value) || 2)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">Edit Explanation</Label>
                              <Textarea
                                value={editingExplanation}
                                onChange={(e) => setEditingExplanation(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" size="sm" onClick={() => setEditingCandidateId(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => handleSaveEditedCandidate(cand.id)}>Save & Accept</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-foreground leading-relaxed">{cand.parsed_question_text}</p>
                          {cand._options && cand._options.length > 0 && (
                            <div className="grid grid-cols-2 gap-2 pt-2">
                              {cand._options.map((opt: any, oIdx: number) => (
                                <div
                                  key={oIdx}
                                  className={cn(
                                    "text-[10px] p-2 rounded border flex items-center justify-between",
                                    opt.is_correct ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-muted/10 border-border"
                                  )}
                                >
                                  <span>{opt.text}</span>
                                  {opt.is_correct && <Check className="size-3 text-emerald-600" />}
                                </div>
                              ))}
                            </div>
                          )}
                          {cand.parsed_explanation && (
                            <div className="text-[10px] text-muted-foreground bg-muted/10 p-2.5 rounded border border-dashed mt-2">
                              <strong>Explanation:</strong> {cand.parsed_explanation}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {aiCandidates.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <CheckCircle2 className="size-10 text-emerald-500" />
                  <div>
                    <h4 className="font-bold">Candidates Review Finished</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Summary: {aiAcceptedCount} accepted, {aiRejectedCount} rejected.
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAiReviewDrawerOpen(false)}>
                      Close Reviewer
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setAiReviewDrawerOpen(false);
                        setAiDrawerOpen(true);
                      }}
                    >
                      <Sparkles className="size-3.5 mr-1.5" />
                      Generate More
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
