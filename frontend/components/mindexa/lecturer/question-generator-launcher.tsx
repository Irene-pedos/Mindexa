"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Layers,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Edit3,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
  RotateCcw,
  BookOpen,
  FileText,
  AlertCircle,
  AlertTriangle,
  Library,
  Clock,
  CheckCheck,
  Plus,
  ExternalLink,
  MessageSquare,
  HelpCircle,
  ListFilter,
  Check,
  Trash2,
  SlidersHorizontal,
  GraduationCap,
  Sparkle,
} from "lucide-react";
import { toast } from "sonner";
import {
  aiGenerationApi,
  AIGenerationBatchDetailResponse,
  AIGeneratedQuestionResponse,
  GenerateQuestionsRequest,
  ReviewAIQuestionRequest,
  GeneratedQuestionOptionResponse,
} from "@/lib/api/ai-generation";
import { assessmentApi } from "@/lib/api/assessment";
import { renderRichMathText } from "@/components/mindexa/common/math-renderer";
import { cn } from "@/lib/utils";

interface QuestionGeneratorLauncherProps {
  workspaceId: string;
  workspaceName?: string;
  language?: string;
  isRwandaBlocked?: boolean;
}

interface AssessmentOption {
  id: string;
  title: string;
  status: string;
  assessment_type: string;
}

const QUESTION_FORMATS = [
  {
    id: "mcq",
    title: "Multiple Choice",
    shortLabel: "MCQ",
    description: "4 options with 1 verified correct answer & plausible distractors",
    icon: CheckCircle2,
  },
  {
    id: "short_answer",
    title: "Short Answer",
    shortLabel: "Short Answer",
    description: "Direct response with model solution & grading criteria",
    icon: FileText,
  },
  {
    id: "true_false",
    title: "True / False",
    shortLabel: "True/False",
    description: "Binary conceptual statement testing core principles",
    icon: CheckCircle2,
  },
  {
    id: "essay",
    title: "Essay / Open",
    shortLabel: "Essay",
    description: "Comprehensive prompt with analytic rubric & expected arguments",
    icon: BookOpen,
  },
  {
    id: "computational",
    title: "Computational",
    shortLabel: "Problem",
    description: "Step-by-step mathematical, numerical, or algorithmic exercise",
    icon: Layers,
  },
  {
    id: "case_study",
    title: "Case Study",
    shortLabel: "Case Study",
    description: "Authentic scenario with contextual multi-part questions",
    icon: HelpCircle,
  },
] as const;

const ADDITIONAL_FORMATS = [
  { value: "fill_blank", label: "Fill in the Blanks", desc: "Uses ___ cloze notation" },
  { value: "matching", label: "Matching Pairs", desc: "Left-to-right concept associations" },
  { value: "ordering", label: "Ordering / Sequencing", desc: "Sequential workflow steps" },
  { value: "practical", label: "Practical / Lab", desc: "Hands-on procedure & outcome" },
];

const BLOOM_LEVELS = [
  { value: "remember", label: "Remember", desc: "Recall definitions, terminology & facts" },
  { value: "understand", label: "Understand", desc: "Explain concepts & interpret ideas" },
  { value: "apply", label: "Apply", desc: "Execute in new or concrete situations" },
  { value: "analyze", label: "Analyze", desc: "Examine relationships & structure" },
  { value: "evaluate", label: "Evaluate", desc: "Justify, critique & assess validity" },
  { value: "create", label: "Create", desc: "Design, synthesize & produce solutions" },
];

const DIFFICULTIES = [
  { value: "easy", label: "Easy", color: "text-emerald-700 dark:text-emerald-300 border-emerald-500/60 bg-emerald-500/10" },
  { value: "medium", label: "Medium", color: "text-amber-700 dark:text-amber-300 border-amber-500/60 bg-amber-500/10" },
  { value: "hard", label: "Hard", color: "text-rose-700 dark:text-rose-300 border-rose-500/60 bg-rose-500/10" },
] as const;

const SUGGESTED_TOPICS = [
  "Database Normalization (1NF, 2NF, BCNF)",
  "Data Structures & Big-O Complexity",
  "Software Architecture & Design Patterns",
  "Network Protocols & OSI Layers",
  "Cybersecurity & Cryptographic Protocols",
  "Concurrency & Race Conditions",
];

export function QuestionGeneratorLauncher({
  workspaceId,
  workspaceName,
  language = "EN",
  isRwandaBlocked = false,
}: QuestionGeneratorLauncherProps) {
  const router = useRouter();

  // Wizard Stage: "configure" | "generating" | "review" | "completed"
  const [stage, setStage] = useState<"configure" | "generating" | "review" | "completed">("configure");

  // Destination: "bank" | "assessment"
  const [destination, setDestination] = useState<"bank" | "assessment">("bank");
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");

  // Configuration Form State
  const [formData, setFormData] = useState({
    topic: "",
    question_type: "mcq",
    difficulty: "medium" as "easy" | "medium" | "hard",
    bloom_level: "understand",
    count: 5,
    additional_context: "",
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Generation & Polling State
  const [polling, setPolling] = useState(false);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Review Queue State
  const [batch, setBatch] = useState<AIGenerationBatchDetailResponse | null>(null);
  const [candidateQuestions, setCandidateQuestions] = useState<AIGeneratedQuestionResponse[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [expandedRubrics, setExpandedRubrics] = useState<Record<string, boolean>>({});

  // Inline Question Editing Modal State
  const [editingQuestion, setEditingQuestion] = useState<AIGeneratedQuestionResponse | null>(null);
  const [editText, setEditText] = useState("");
  const [editExplanation, setEditExplanation] = useState("");
  const [editOptions, setEditOptions] = useState<GeneratedQuestionOptionResponse[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Load draft assessments for the workspace
  useEffect(() => {
    async function loadDraftAssessments() {
      try {
        setLoadingAssessments(true);
        const res: any = await assessmentApi.getAssessments({ status: "DRAFT" });
        const list = Array.isArray(res) ? res : res?.items || [];
        setAssessments(list);
        if (list.length > 0) {
          setSelectedAssessmentId((prev) => prev || list[0].id);
        }
      } catch (err) {
        console.error("Failed to load assessments", err);
      } finally {
        setLoadingAssessments(false);
      }
    }
    loadDraftAssessments();
  }, [workspaceId]);

  // Cleanup polling and timers on unmount
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPolling(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Start polling batch status
  const startPollingBatch = useCallback((batchId: string) => {
    setPolling(true);
    setGenerationElapsed(0);

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setGenerationElapsed((prev) => prev + 1);
    }, 1000);

    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 3 minutes maximum at 3s intervals

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const updated = await aiGenerationApi.getBatch(batchId);
        setBatch(updated);

        const status = updated.status?.toLowerCase();
        const isFinished = status === "completed" || status === "failed" || status === "partial_failure";

        if (isFinished || attempts >= MAX_ATTEMPTS) {
          stopPolling();

          if (status === "completed" || status === "partial_failure") {
            const list = updated.questions || [];
            if (list.length > 0) {
              setCandidateQuestions(list);
              setStage("review");
              toast.success(`${list.length} candidate questions generated! Review each before saving.`);
            } else {
              setGenerationError("AI returned 0 questions. Please refine your topic or additional guidance.");
              setStage("configure");
            }
          } else if (status === "failed") {
            setGenerationError(updated.error_message || "Generation encountered an issue in the AI worker. Please try again.");
            setStage("configure");
          } else if (attempts >= MAX_ATTEMPTS) {
            setGenerationError("Generation timed out. Please check if your background workers are active.");
            setStage("configure");
          }
        }
      } catch (err: any) {
        stopPolling();
        setGenerationError("Could not poll generation status. Please verify backend connectivity.");
        setStage("configure");
      }
    }, 3000);
  }, [stopPolling]);

  // Handle Form Submission -> AI Generation
  const handleStartGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.topic.trim()) {
      toast.error("Please enter a topic or concept to test.");
      return;
    }

    setGenerationError(null);
    setStage("generating");
    setApprovedCount(0);
    setRejectedCount(0);

    try {
      const payload: GenerateQuestionsRequest = {
        subject: workspaceName || formData.topic,
        topic: formData.topic.trim(),
        question_type: formData.question_type as any,
        difficulty: formData.difficulty,
        bloom_level: formData.bloom_level,
        count: formData.count,
        additional_context: formData.additional_context.trim() || undefined,
        target_assessment_id: destination === "assessment" && selectedAssessmentId ? selectedAssessmentId : undefined,
        workspace_id: workspaceId || undefined,
      };

      const res = await aiGenerationApi.generateQuestions(payload);
      setBatch(res);

      if (res.status === "pending" || res.status === "processing") {
        startPollingBatch(res.id);
      } else {
        const list = res.questions || [];
        if (list.length > 0) {
          setCandidateQuestions(list);
          setStage("review");
          toast.success(`${list.length} candidate questions generated!`);
        } else {
          setGenerationError("AI returned 0 questions. Please adjust your topic or context.");
          setStage("configure");
        }
      }
    } catch (err: any) {
      console.error("AI question generation failed", err);
      const msg = err?.message || "Failed to initiate AI question generation.";
      setGenerationError(msg);
      toast.error(msg);
      setStage("configure");
    }
  };

  // Handle Single Question Approval
  const handleApprove = async (questionId: string) => {
    setReviewingId(questionId);
    try {
      await aiGenerationApi.reviewQuestion(questionId, {
        decision: "approved",
        add_to_assessment_id: destination === "assessment" && selectedAssessmentId ? selectedAssessmentId : undefined,
        save_to_bank: true,
      });

      setCandidateQuestions((prev) => {
        const next = prev.filter((q) => q.id !== questionId);
        if (next.length === 0) {
          setStage("completed");
        }
        return next;
      });

      setApprovedCount((c) => c + 1);
      toast.success(
        destination === "assessment"
          ? "Approved & added to assessment draft and Question Bank!"
          : "Approved & saved to Question Bank!"
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve question.");
    } finally {
      setReviewingId(null);
    }
  };

  // Handle Single Question Rejection
  const handleReject = async (questionId: string) => {
    setReviewingId(questionId);
    try {
      await aiGenerationApi.reviewQuestion(questionId, { decision: "rejected" });
      setCandidateQuestions((prev) => {
        const next = prev.filter((q) => q.id !== questionId);
        if (next.length === 0) {
          setStage("completed");
        }
        return next;
      });
      setRejectedCount((c) => c + 1);
      toast.info("Candidate question rejected.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject question.");
    } finally {
      setReviewingId(null);
    }
  };

  // Handle Approve All Remaining Questions
  const handleApproveAll = async () => {
    if (candidateQuestions.length === 0) return;
    setReviewingId("ALL");
    try {
      for (const q of candidateQuestions) {
        await aiGenerationApi.reviewQuestion(q.id, {
          decision: "approved",
          add_to_assessment_id: destination === "assessment" && selectedAssessmentId ? selectedAssessmentId : undefined,
          save_to_bank: true,
        });
      }
      setApprovedCount((c) => c + candidateQuestions.length);
      setCandidateQuestions([]);
      setStage("completed");
      toast.success("All remaining questions approved and saved!");
    } catch (err: any) {
      toast.error("An error occurred while approving remaining questions.");
    } finally {
      setReviewingId(null);
    }
  };

  // Handle Reject All Remaining Questions
  const handleRejectAll = async () => {
    if (candidateQuestions.length === 0) return;
    setReviewingId("ALL");
    try {
      for (const q of candidateQuestions) {
        await aiGenerationApi.reviewQuestion(q.id, { decision: "rejected" });
      }
      setRejectedCount((c) => c + candidateQuestions.length);
      setCandidateQuestions([]);
      setStage("completed");
      toast.info("Remaining questions rejected.");
    } catch (err: any) {
      toast.error("Failed to reject remaining questions.");
    } finally {
      setReviewingId(null);
    }
  };

  // Open Edit Modal
  const openEditModal = (q: AIGeneratedQuestionResponse) => {
    setEditingQuestion(q);
    setEditText(q.parsed_question_text || "");
    setEditExplanation(q.parsed_explanation || "");
    setEditOptions(q._options ? JSON.parse(JSON.stringify(q._options)) : []);
  };

  // Save Inline Edit & Approve
  const handleSaveEdit = async () => {
    if (!editingQuestion) return;
    if (!editText.trim()) {
      toast.error("Question text cannot be blank.");
      return;
    }

    setIsSavingEdit(true);
    try {
      await aiGenerationApi.reviewQuestion(editingQuestion.id, {
        decision: "edited",
        modified_question_text: editText.trim(),
        modified_options_json: editOptions.length > 0 ? JSON.stringify(editOptions) : undefined,
        modified_explanation: editExplanation.trim() || undefined,
        add_to_assessment_id: destination === "assessment" && selectedAssessmentId ? selectedAssessmentId : undefined,
        save_to_bank: true,
      });

      setCandidateQuestions((prev) => {
        const next = prev.filter((q) => q.id !== editingQuestion.id);
        if (next.length === 0) {
          setStage("completed");
        }
        return next;
      });

      setApprovedCount((c) => c + 1);
      toast.success("Edited question saved and approved!");
      setEditingQuestion(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save edited question.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Toggle rubric accordion for a question
  const toggleRubric = (id: string) => {
    setExpandedRubrics((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Kinyarwanda Policy Block
  if (isRwandaBlocked || language === "RW") {
    return (
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto w-full max-w-3xl mx-auto">
        <Card className="border border-amber-500/30 bg-amber-500/5 rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div className="space-y-2 flex-1">
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                Institutional Policy Notice
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Automated question generation is restricted for Kinyarwanda-medium curriculum units under institutional academic integrity governance.
              </p>
              <div className="pt-1">
                <Button
                  size="sm"
                  onClick={() => router.push("/lecturer/assessments/question-bank")}
                  className="rounded-lg gap-2 text-xs font-semibold cursor-pointer h-8"
                >
                  <Library className="size-3.5" />
                  <span>Open Question Bank</span>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const selectedAssessmentObj = assessments.find((a) => a.id === selectedAssessmentId);
  const totalQuestionsInBatch = (candidateQuestions.length + approvedCount + rejectedCount) || 1;
  const progressPercent = Math.round(((approvedCount + rejectedCount) / totalQuestionsInBatch) * 100);

  return (
    <div className="flex-1 p-3 sm:p-4 lg:p-5 overflow-y-auto space-y-3.5 w-full max-w-6xl mx-auto narrow-scrollbar-dark">
      {/* ── COMPACT HEADER & CONTEXT ROW ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs shrink-0">
            <Layers className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-foreground tracking-tight leading-none">
                Question Generator Studio
              </h2>
              <Badge variant="outline" className="text-[10px] font-semibold border-primary/30 text-primary bg-primary/5 px-2 py-0 h-4.5">
                Curriculum Grounded
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-medium text-muted-foreground px-1.5 py-0 h-4.5">
                Human Sign-off
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-tight mt-1">
              Formulate syllabus-grounded assessment items held for your explicit sign-off.
            </p>
          </div>
        </div>

        {/* Workspace Context Chip */}
        {workspaceName && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground shrink-0">
            <GraduationCap className="size-3.5 text-primary" />
            <span className="font-semibold text-foreground truncate max-w-[200px] text-[11px]">{workspaceName}</span>
          </div>
        )}
      </div>

      {/* ── SLEEK WORKFLOW STEPPER ── */}
      <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/30 border border-border/60 rounded-xl">
        {/* Step 1 */}
        <div
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all text-xs font-semibold",
            stage === "configure"
              ? "bg-card text-foreground border border-border/80 shadow-2xs"
              : stage === "generating" || stage === "review" || stage === "completed"
              ? "text-primary/90 opacity-90"
              : "text-muted-foreground"
          )}
        >
          <div
            className={cn(
              "size-5 rounded-md flex items-center justify-center text-[10px] shrink-0 font-bold",
              stage === "configure"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : stage === "generating" || stage === "review" || stage === "completed"
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {stage === "review" || stage === "completed" ? <Check className="size-3" /> : "1"}
          </div>
          <span className="truncate text-xs font-semibold">1. Blueprint</span>
        </div>

        {/* Step 2 */}
        <div
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all text-xs font-semibold",
            stage === "generating"
              ? "bg-card text-foreground border border-border/80 shadow-2xs"
              : stage === "review" || stage === "completed"
              ? "text-primary/90 opacity-90"
              : "text-muted-foreground"
          )}
        >
          <div
            className={cn(
              "size-5 rounded-md flex items-center justify-center text-[10px] shrink-0 font-bold",
              stage === "generating"
                ? "bg-primary text-primary-foreground shadow-2xs animate-pulse"
                : stage === "review" || stage === "completed"
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {stage === "generating" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : stage === "review" || stage === "completed" ? (
              <Check className="size-3" />
            ) : (
              "2"
            )}
          </div>
          <span className="truncate text-xs font-semibold">2. Item Synthesis</span>
        </div>

        {/* Step 3 */}
        <div
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all text-xs font-semibold",
            stage === "review"
              ? "bg-card text-foreground border border-border/80 shadow-2xs"
              : stage === "completed"
              ? "bg-card text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs"
              : "text-muted-foreground"
          )}
        >
          <div
            className={cn(
              "size-5 rounded-md flex items-center justify-center text-[10px] shrink-0 font-bold",
              stage === "review"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : stage === "completed"
                ? "bg-emerald-600 text-white"
                : "bg-muted text-muted-foreground"
            )}
          >
            {stage === "completed" ? <CheckCheck className="size-3" /> : "3"}
          </div>
          <span className="truncate text-xs font-semibold">
            {stage === "completed" ? "3. Committed" : "3. Audit Queue"}
          </span>
        </div>
      </div>

      {/* ── STAGE 1: BENTO STUDIO CONFIGURATION ── */}
      {stage === "configure" && (
        <form onSubmit={handleStartGeneration} className="space-y-3.5">
          {/* Error Banner if prior attempt failed */}
          {generationError && (
            <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5 shadow-2xs">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold block">Generation Note</span>
                <p className="opacity-90">{generationError}</p>
              </div>
            </div>
          )}

          {/* Bento Studio Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
            {/* ── LEFT COLUMN: Topic & Format Specification (7 cols) ── */}
            <div className="lg:col-span-7 space-y-3.5">
              {/* Tile 1: Topic & Scope */}
              <Card className="bg-card border border-border/70 rounded-xl shadow-2xs p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Curriculum Topic / Concept</span>
                    <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-[10px] text-muted-foreground">Syllabus-aligned</span>
                </div>
                <Input
                  value={formData.topic}
                  onChange={(e) => setFormData((prev) => ({ ...prev, topic: e.target.value }))}
                  placeholder="e.g. Database Normalization (1NF, 2NF, BCNF) & Dependencies"
                  className="h-9 text-xs rounded-lg px-3 border-border/70 bg-background"
                  required
                />
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground">Presets:</span>
                  {SUGGESTED_TOPICS.slice(0, 4).map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => setFormData((prev) => ({ ...prev, topic: tag }))}
                      className="px-2 py-0.5 rounded-md bg-muted/40 hover:bg-muted border border-border/50 text-[10px] text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer"
                    >
                      {tag.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </Card>

              {/* Tile 2: Question Format Grid */}
              <Card className="bg-card border border-border/70 rounded-xl shadow-2xs p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Question Format</span>
                    <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-[10px] text-muted-foreground">Select structure</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {QUESTION_FORMATS.map((fmt) => {
                    const Icon = fmt.icon;
                    const isSelected = formData.question_type === fmt.id;
                    return (
                      <div
                        key={fmt.id}
                        onClick={() => setFormData((prev) => ({ ...prev, question_type: fmt.id }))}
                        className={cn(
                          "cursor-pointer rounded-lg p-2.5 border transition-all flex flex-col justify-between gap-1 text-left relative",
                          isSelected
                            ? "border-primary bg-primary/[0.04] ring-1 ring-primary/20 shadow-2xs text-foreground font-semibold"
                            : "border-border/60 hover:border-border hover:bg-muted/30 text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className={cn(
                              "size-6 rounded-md flex items-center justify-center shrink-0",
                              isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            )}
                          >
                            <Icon className="size-3.5" />
                          </div>
                          {isSelected && (
                            <span className="size-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-foreground block leading-tight">
                            {fmt.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground line-clamp-1 leading-tight mt-0.5">
                            {fmt.shortLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Tile 3: Advanced Pedagogical Instructions (Collapsible) */}
              <div className="px-1">
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <SlidersHorizontal className="size-3" />
                      <span>{showAdvanced ? "Hide" : "Add"} Pedagogical Instructions & Focus (Optional)</span>
                      {showAdvanced ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="p-3 bg-muted/25 border border-border/60 rounded-lg space-y-1.5">
                      <Label className="text-[11px] font-semibold text-foreground">
                        Custom Constraints & Rubric Focus
                      </Label>
                      <Textarea
                        value={formData.additional_context}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, additional_context: e.target.value }))
                        }
                        placeholder="e.g. Focus on edge cases. Ensure distractors address common student misconceptions."
                        className="min-h-[64px] text-xs rounded-lg resize-none p-2.5 bg-background"
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Destination & Tuning Parameters (5 cols) ── */}
            <div className="lg:col-span-5 space-y-3.5">
              {/* Tile 4: Question Destination */}
              <Card className="bg-card border border-border/70 rounded-xl shadow-2xs p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Destination</span>
                  </Label>
                  <span className="text-[10px] text-muted-foreground">Storage target</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setDestination("bank")}
                    className={cn(
                      "cursor-pointer rounded-lg p-2.5 border transition-all text-left flex items-center gap-2",
                      destination === "bank"
                        ? "border-primary bg-primary/[0.04] ring-1 ring-primary/20 shadow-2xs font-semibold"
                        : "border-border/60 hover:border-border hover:bg-muted/30 text-muted-foreground"
                    )}
                  >
                    <Library className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-foreground block truncate">Question Bank</span>
                      <span className="text-[10px] text-muted-foreground block truncate">Subject bank</span>
                    </div>
                  </div>

                  <div
                    onClick={() => setDestination("assessment")}
                    className={cn(
                      "cursor-pointer rounded-lg p-2.5 border transition-all text-left flex items-center gap-2",
                      destination === "assessment"
                        ? "border-primary bg-primary/[0.04] ring-1 ring-primary/20 shadow-2xs font-semibold"
                        : "border-border/60 hover:border-border hover:bg-muted/30 text-muted-foreground"
                    )}
                  >
                    <FileText className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-foreground block truncate">Exam Draft</span>
                      <span className="text-[10px] text-muted-foreground block truncate">Attach to paper</span>
                    </div>
                  </div>
                </div>

                {destination === "assessment" && (
                  <div className="pt-1">
                    <select
                      value={selectedAssessmentId}
                      onChange={(e) => setSelectedAssessmentId(e.target.value)}
                      className="w-full h-8.5 rounded-lg border border-border text-xs px-2.5 bg-background text-foreground outline-none font-medium cursor-pointer"
                    >
                      {assessments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title} ({a.assessment_type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </Card>

              {/* Tile 5: Tuning Parameters (Difficulty, Bloom, Count) */}
              <Card className="bg-card border border-border/70 rounded-xl shadow-2xs p-3.5 sm:p-4 space-y-3">
                {/* Difficulty Selector */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold text-foreground">Difficulty Level</Label>
                    <span className="text-[10px] text-muted-foreground capitalize">{formData.difficulty}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {DIFFICULTIES.map((diff) => {
                      const isSelected = formData.difficulty === diff.value;
                      return (
                        <button
                          type="button"
                          key={diff.value}
                          onClick={() => setFormData((prev) => ({ ...prev, difficulty: diff.value }))}
                          className={cn(
                            "h-8 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center",
                            isSelected
                              ? `${diff.color} ring-1 ring-primary/20 font-bold shadow-2xs`
                              : "border-border/60 text-muted-foreground hover:bg-muted/30"
                          )}
                        >
                          {diff.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bloom's Cognitive Level */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold text-foreground">Bloom&apos;s Taxonomy Level</Label>
                  </div>
                  <Select
                    value={formData.bloom_level}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, bloom_level: val }))}
                  >
                    <SelectTrigger className="h-8.5 rounded-lg text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOOM_LEVELS.map((bl) => (
                        <SelectItem key={bl.value} value={bl.value}>
                          <span className="font-semibold text-xs">{bl.label}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">({bl.desc})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Question Quantity */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-foreground">Batch Count</Label>
                  <div className="flex items-center gap-1.5">
                    {[3, 5, 10].map((num) => (
                      <button
                        type="button"
                        key={num}
                        onClick={() => setFormData((prev) => ({ ...prev, count: num }))}
                        className={cn(
                          "h-8 px-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex-1",
                          formData.count === num
                            ? "bg-primary text-primary-foreground border-primary shadow-2xs font-bold"
                            : "border-border/60 text-muted-foreground hover:bg-muted/30"
                        )}
                      >
                        {num}
                      </button>
                    ))}
                    <Input
                      type="number"
                      min={1}
                      max={15}
                      value={formData.count}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          count: Math.max(1, Math.min(15, parseInt(e.target.value) || 1)),
                        }))
                      }
                      className="h-8 w-14 text-center text-xs rounded-lg font-bold bg-background px-1"
                    />
                  </div>
                </div>
              </Card>

              {/* Action Submit Tile */}
              <div className="space-y-2 pt-0.5">
                <Button
                  type="submit"
                  size="default"
                  className="w-full h-10 rounded-xl font-bold gap-2 text-xs shadow-xs cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Sparkles className="size-3.5" />
                  <span>Synthesize Candidate Questions</span>
                  <ArrowRight className="size-3.5" />
                </Button>
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Mandatory audit: Staged for explicit sign-off</span>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ── STAGE 2: GENERATION IN PROGRESS (REAL-TIME STATUS) ── */}
      {stage === "generating" && (
        <Card className="bg-card border border-border/70 rounded-2xl shadow-xs p-6 sm:p-7 text-center space-y-4 max-w-lg mx-auto">
          <div className="size-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto shadow-2xs">
            <Layers className="size-6 animate-pulse" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-foreground">
              Formulating Candidate Assessment Items
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Retrieving syllabus handouts and calibrating distractors.
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border/60 text-[11px] font-mono text-muted-foreground">
              <Clock className="size-3 animate-spin text-primary" />
              <span>Elapsed: {generationElapsed}s (~20–30s typical)</span>
            </div>
          </div>

          {/* Stepper Checklist */}
          <div className="text-left space-y-2 p-3.5 rounded-xl bg-muted/25 border border-border/50 text-xs">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>Course context and syllabus indexed</span>
            </div>
            <div className="flex items-center gap-2 text-foreground font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>Bloom&apos;s level ({formData.bloom_level}) alignment verified</span>
            </div>
            <div className="flex items-center gap-2 text-primary font-semibold">
              <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
              <span>Drafting {formData.count} candidate items & rubrics...</span>
            </div>
          </div>

          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                stopPolling();
                setStage("configure");
                toast.info("Generation cancelled.");
              }}
              className="rounded-lg text-xs h-8 px-3.5 cursor-pointer"
            >
              Cancel & Adjust Blueprint
            </Button>
          </div>
        </Card>
      )}

      {/* ── STAGE 3: HUMAN AUDIT & APPROVAL QUEUE ── */}
      {stage === "review" && (
        <div className="space-y-3.5">
          {/* Audit Queue Sticky Header / Status Bar */}
          <Card className="bg-card border border-border/70 rounded-xl shadow-2xs p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-foreground">
                    Candidate Item Audit Queue
                  </h3>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10 text-[10px] font-semibold px-2 py-0 h-4.5">
                    {candidateQuestions.length} Pending Approval
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Target: <strong className="text-foreground">{destination === "assessment" && selectedAssessmentObj ? selectedAssessmentObj.title : "Question Bank"}</strong>
                </p>
              </div>

              {/* Progress and Bulk Actions */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRejectAll}
                  disabled={!!reviewingId}
                  className="rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 border-border/70 cursor-pointer h-8 px-3"
                >
                  <XCircle className="size-3.5 mr-1" />
                  <span>Reject All</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleApproveAll}
                  disabled={!!reviewingId}
                  className="rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer h-8 px-3.5 shadow-2xs"
                >
                  {reviewingId === "ALL" ? (
                    <Loader2 className="size-3 animate-spin mr-1" />
                  ) : (
                    <CheckCheck className="size-3 mr-1" />
                  )}
                  <span>Approve All</span>
                </Button>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="pt-1.5 border-t border-border/50 flex items-center justify-between gap-2.5">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                {approvedCount + rejectedCount}/{totalQuestionsInBatch} ({progressPercent}%)
              </span>
            </div>
          </Card>

          {/* List of Generated Candidate Questions */}
          <div className="space-y-3">
            {candidateQuestions.map((question, index) => {
              const isBusy = reviewingId === question.id;
              const isRubricOpen = !!expandedRubrics[question.id];

              return (
                <Card
                  key={question.id}
                  className="bg-card border border-border/70 rounded-xl shadow-2xs overflow-hidden transition-all hover:border-border/90"
                >
                  {/* Card Header Bar */}
                  <CardHeader className="bg-muted/20 border-b border-border/50 py-2.5 px-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] font-bold border-primary/30 text-primary bg-primary/5 px-2 py-0 h-4.5">
                          #{index + 1}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] uppercase font-semibold px-1.5 py-0 h-4.5">
                          {question.question_type?.replace("_", " ")}
                        </Badge>
                        {question.bloom_level && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground capitalize px-1.5 py-0 h-4.5">
                            {question.bloom_level}
                          </Badge>
                        )}
                        {question.difficulty && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] capitalize font-medium px-1.5 py-0 h-4.5",
                              question.difficulty === "hard"
                                ? "text-rose-700 border-rose-300 dark:border-rose-900 bg-rose-500/10"
                                : question.difficulty === "medium"
                                ? "text-amber-700 border-amber-300 dark:border-amber-900 bg-amber-500/10"
                                : "text-emerald-700 border-emerald-300 dark:border-emerald-900 bg-emerald-500/10"
                            )}
                          >
                            {question.difficulty}
                          </Badge>
                        )}
                      </div>

                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0 h-4.5">
                        Pending Sign-off
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-3.5 sm:p-4 space-y-3">
                    {/* Question Prompt */}
                    <div className="text-xs sm:text-sm font-medium text-foreground leading-relaxed">
                      {question.parsed_question_text
                        ? renderRichMathText(question.parsed_question_text)
                        : "⚠️ Could not parse question text."}
                    </div>

                    {/* Options (for MCQ or True/False) */}
                    {question._options && question._options.length > 0 && (
                      <div className="space-y-1.5 pt-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                          Answer Options & Key:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {question._options.map((opt, optIdx) => {
                            const optionLetter = String.fromCharCode(65 + optIdx);
                            return (
                              <div
                                key={optIdx}
                                className={cn(
                                  "p-2.5 rounded-lg border text-xs flex items-start gap-2 transition-all",
                                  opt.is_correct
                                    ? "bg-emerald-500/[0.06] border-emerald-500/50 text-foreground font-medium shadow-2xs"
                                    : "bg-muted/15 border-border/60 text-muted-foreground"
                                )}
                              >
                                <span
                                  className={cn(
                                    "size-5 rounded text-[10px] flex items-center justify-center font-bold shrink-0",
                                    opt.is_correct
                                      ? "bg-emerald-600 text-white"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {optionLetter}
                                </span>
                                <div className="flex-1 leading-snug pt-0.5 text-xs">
                                  {renderRichMathText(opt.text)}
                                </div>
                                {opt.is_correct && (
                                  <Badge className="text-[9px] font-bold bg-emerald-600 text-white shrink-0 px-1.5 py-0 h-4">
                                    Correct Key
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Collapsible Model Answer & Rubric */}
                    {question.parsed_explanation && (
                      <div className="pt-0.5">
                        <Collapsible open={isRubricOpen} onOpenChange={() => toggleRubric(question.id)}>
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
                            >
                              <BookOpen className="size-3.5" />
                              <span>{isRubricOpen ? "Hide" : "View"} Model Answer & Rubric</span>
                              {isRubricOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-2">
                            <div className="p-3 bg-muted/25 border border-border/60 rounded-lg text-xs text-foreground/90 leading-relaxed space-y-1">
                              <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider block">
                                Model Answer Rationale:
                              </span>
                              <div>{renderRichMathText(question.parsed_explanation)}</div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}
                  </CardContent>

                  {/* Actions Footer */}
                  <CardFooter className="bg-muted/15 border-t border-border/50 py-2.5 px-4 flex items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReject(question.id)}
                      disabled={isBusy}
                      className="rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10 border-border/70 cursor-pointer h-8 px-3"
                    >
                      <XCircle className="size-3.5 mr-1" />
                      <span>Reject</span>
                    </Button>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(question)}
                        disabled={isBusy}
                        className="rounded-lg text-xs font-semibold border-border/70 hover:bg-muted/50 cursor-pointer h-8 px-3"
                      >
                        <Edit3 className="size-3.5 mr-1" />
                        <span>Edit</span>
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleApprove(question.id)}
                        disabled={isBusy}
                        className="rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer h-8 px-3.5 shadow-2xs"
                      >
                        {isBusy ? (
                          <Loader2 className="size-3 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="size-3 mr-1" />
                        )}
                        <span>Approve & Store</span>
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STAGE 4: POST-REVIEW WHAT'S NEXT HUB ── */}
      {stage === "completed" && (
        <Card className="bg-card border border-border/70 rounded-2xl shadow-xs p-6 sm:p-7 space-y-5 text-center max-w-xl mx-auto">
          <div className="size-12 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto shadow-2xs">
            <CheckCheck className="size-6" />
          </div>

          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-foreground">
              Batch Review Completed
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Audited successfully. <strong className="text-emerald-600 font-semibold">{approvedCount} questions</strong> have been committed.
            </p>
          </div>

          {/* Guided Next Steps Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left pt-1">
            <div
              onClick={() => {
                setStage("configure");
                setFormData((prev) => ({ ...prev, topic: "" }));
              }}
              className="p-3 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/[0.03] transition-all cursor-pointer space-y-1.5"
            >
              <div className="size-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                <RotateCcw className="size-3.5" />
              </div>
              <h4 className="text-xs font-bold text-foreground">Another Batch</h4>
              <p className="text-[10px] text-muted-foreground leading-normal">
                Synthesize another batch for new topic.
              </p>
            </div>

            <div
              onClick={() => router.push("/lecturer/assessments/question-bank")}
              className="p-3 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/[0.03] transition-all cursor-pointer space-y-1.5"
            >
              <div className="size-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                <Library className="size-3.5" />
              </div>
              <h4 className="text-xs font-bold text-foreground">Question Bank</h4>
              <p className="text-[10px] text-muted-foreground leading-normal">
                Browse and organize subject bank items.
              </p>
            </div>

            {destination === "assessment" && selectedAssessmentId ? (
              <div
                onClick={() => router.push(`/lecturer/assessments/${selectedAssessmentId}`)}
                className="p-3 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/[0.03] transition-all cursor-pointer space-y-1.5"
              >
                <div className="size-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                  <FileText className="size-3.5" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Edit Draft</h4>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Open assessment with newly committed items.
                </p>
              </div>
            ) : (
              <div
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("module", "chat");
                  window.history.pushState({}, "", url.toString());
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
                className="p-3 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/[0.03] transition-all cursor-pointer space-y-1.5"
              >
                <div className="size-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                  <MessageSquare className="size-3.5" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Copilot Chat</h4>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Ask advice or rubric guidance.
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── INLINE QUESTION EDITING MODAL ── */}
      <Dialog open={!!editingQuestion} onOpenChange={(open) => !open && setEditingQuestion(null)}>
        <DialogContent className="sm:max-w-xl p-5 max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader className="space-y-0.5">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Edit3 className="size-4 text-primary" />
              <span>Edit Candidate Question</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Modify the question stem, answer choices, or model solution before approving.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            {/* Prompt Text */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Question Prompt Text</Label>
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="min-h-[80px] text-xs rounded-lg p-2.5"
                placeholder="Enter question text..."
              />
            </div>

            {/* Options Editing */}
            {editOptions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Multiple Choice Options</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEditOptions((prev) => [
                        ...prev,
                        { text: `Option ${prev.length + 1}`, is_correct: false },
                      ])
                    }
                    className="h-6 text-[11px] px-2 text-primary gap-1 cursor-pointer"
                  >
                    <Plus className="size-3" /> Add Choice
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {editOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct-option"
                        checked={opt.is_correct}
                        onChange={() => {
                          setEditOptions((prev) =>
                            prev.map((o, idx) => ({ ...o, is_correct: idx === i }))
                          );
                        }}
                        className="size-3.5 accent-emerald-600 cursor-pointer"
                        title="Mark as correct answer"
                      />
                      <Input
                        value={opt.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditOptions((prev) =>
                            prev.map((o, idx) => (idx === i ? { ...o, text: val } : o))
                          );
                        }}
                        className="h-8 text-xs rounded-lg flex-1 px-2.5"
                      />
                      {editOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setEditOptions((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-muted transition-colors cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Model Answer / Rubric */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Model Answer & Rubric Criteria</Label>
              <Textarea
                value={editExplanation}
                onChange={(e) => setEditExplanation(e.target.value)}
                className="min-h-[80px] text-xs rounded-lg p-2.5"
                placeholder="Model response and grading points..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingQuestion(null)}
              disabled={isSavingEdit}
              className="rounded-lg text-xs h-8 px-3 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveEdit}
              disabled={isSavingEdit}
              className="rounded-lg text-xs font-bold h-8 px-4 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs"
            >
              {isSavingEdit ? (
                <Loader2 className="size-3 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="size-3 mr-1" />
              )}
              <span>Save & Approve</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
