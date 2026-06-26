"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, BrainCircuit, AlertCircle, Sparkles, CheckCircle2, XCircle,
  Clock, Shield, BookOpen, FileText, Edit3, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  aiGenerationApi,
  AIGenerationBatchDetailResponse,
  AIGeneratedQuestionResponse,
  GenerateQuestionsRequest,
  ReviewAIQuestionRequest,
} from "@/lib/api/ai-generation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// ─── AI Safety Notice ─────────────────────────────────────────────────────────
function AISafetyNotice() {
  return (
    <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
      <Shield className="size-4 text-amber-600" />
      <AlertTitle className="text-amber-700 font-semibold">AI Draft Mode — Lecturer Review Required</AlertTitle>
      <AlertDescription className="text-amber-600 text-xs mt-1 space-y-1">
        <p>✅ Generated questions are <strong>drafts only</strong> — they will NOT be added to any assessment without your explicit approval.</p>
        <p>❌ AI cannot publish, schedule, or release assessments.</p>
        <p>❌ AI cannot override blueprint rules or add questions directly to official exams.</p>
      </AlertDescription>
    </Alert>
  );
}

// ─── Question Type Config ──────────────────────────────────────────────────────
const QUESTION_TYPES = [
  { value: "mcq",           label: "Multiple Choice (MCQ)",       hint: "4 options, 1 correct" },
  { value: "true_false",    label: "True / False",                hint: "2 options" },
  { value: "short_answer",  label: "Short Answer",                hint: "Model answer + rubric" },
  { value: "essay",         label: "Essay",                       hint: "Full rubric + key points" },
  { value: "fill_blank",    label: "Fill in the Blanks",          hint: "Uses ___ notation" },
  { value: "matching",      label: "Matching",                    hint: "Left → Right pairs" },
  { value: "case_study",    label: "Case Study",                  hint: "Scenario + questions" },
  { value: "computational", label: "Computational / Problem",     hint: "Step-by-step workings" },
  { value: "ordering",      label: "Ordering / Sequencing",       hint: "Correct order" },
  { value: "practical",     label: "Practical",                   hint: "Procedure + output" },
] as const;

type QuestionTypeValue = typeof QUESTION_TYPES[number]["value"];

const BLOOM_LEVELS = [
  { value: "remember",  label: "Remember",  desc: "Recall facts & definitions" },
  { value: "understand",label: "Understand",desc: "Explain concepts" },
  { value: "apply",     label: "Apply",     desc: "Use in new situations" },
  { value: "analyze",   label: "Analyze",   desc: "Break down & examine" },
  { value: "evaluate",  label: "Evaluate",  desc: "Justify & critique" },
  { value: "create",    label: "Create",    desc: "Design & synthesize" },
];

const DIFFICULTIES = [
  { value: "easy",   label: "Easy",   color: "text-emerald-600" },
  { value: "medium", label: "Medium", color: "text-amber-600" },
  { value: "hard",   label: "Hard",   color: "text-red-600" },
];

// ─── Props ────────────────────────────────────────────────────────────────────
export interface AIGeneratorPanelProps {
  /** ID of the draft assessment — AI will never touch finalized assessments */
  assessmentId?: string;
  /** Teaching workspace ID — used for RAG: retrieves lecturer's uploaded materials */
  workspaceId?: string;
  /** Target section ID to assign generated questions to */
  targetSectionId?: string;
  /** Pre-fill subject from assessment metadata */
  defaultSubject?: string;
  /** Pre-fill topic from section/assessment */
  defaultTopic?: string;
  /** Blueprint summary string for AI context */
  blueprintSummary?: string;
  /** Course learning outcomes for AI alignment */
  learningOutcomes?: string;
  /** Marks per question from blueprint */
  marksPerQuestion?: number;
  /** Called when a question is approved and promoted */
  onQuestionPromoted?: () => void;
  /** Called when editing a question before approval */
  onEditRequest?: (question: AIGeneratedQuestionResponse) => void;
}

// ─── Single Question Review Card ──────────────────────────────────────────────
function GeneratedQuestionCard({
  question,
  reviewingId,
  onApprove,
  onReject,
  onEdit,
}: {
  question: AIGeneratedQuestionResponse;
  reviewingId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit?: (q: AIGeneratedQuestionResponse) => void;
}) {
  const [showExplanation, setShowExplanation] = useState(false);
  const isLoading = reviewingId === question.id;

  return (
    <Card className="border-amber-200/60 shadow-sm relative overflow-hidden">
      {/* Draft stripe */}
      <div className="absolute top-0 left-0 w-1 h-full bg-amber-400/60" />

      <CardHeader className="pb-3 border-b bg-amber-50/40 dark:bg-amber-950/10 pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 items-center">
            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">
              AI Draft
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {question.question_type?.replace("_", " ").toUpperCase()}
            </Badge>
            {question.bloom_level && (
              <Badge variant="secondary" className="text-[10px]">
                {question.bloom_level}
              </Badge>
            )}
            {question.difficulty && (
              <Badge variant="outline" className={`text-[10px] ${
                question.difficulty === "hard" ? "text-red-600 border-red-200" :
                question.difficulty === "medium" ? "text-amber-600 border-amber-200" :
                "text-emerald-600 border-emerald-200"
              }`}>
                {question.difficulty}
              </Badge>
            )}
          </div>
          {!question.parsed_successfully && (
            <Badge variant="destructive" className="text-[10px]">Parse Error</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4 pl-5">
        {/* Question Text */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Question:</p>
          <p className="text-sm leading-relaxed">{question.parsed_question_text || "⚠️ Could not parse question text."}</p>
        </div>

        {/* Options */}
        {question._options && question._options.length > 0 && (
          <div className="space-y-1.5 pl-3 border-l-2 border-muted">
            {question._options.map((opt, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 text-sm ${
                  opt.is_correct ? "text-emerald-700 font-medium" : "text-muted-foreground"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {opt.is_correct
                    ? <CheckCircle2 className="size-3.5" />
                    : <XCircle className="size-3.5 opacity-40" />
                  }
                </div>
                <span>{opt.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Explanation collapsible */}
        {question.parsed_explanation && (
          <Collapsible open={showExplanation} onOpenChange={setShowExplanation}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showExplanation ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                {showExplanation ? "Hide" : "Show"} Model Answer / Rubric
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-3 bg-muted/30 rounded-md text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {question.parsed_explanation}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Parse error */}
        {question.parse_error && (
          <div className="text-xs text-destructive bg-destructive/5 p-2 rounded">
            <strong>Parse error:</strong> {question.parse_error}
          </div>
        )}
      </CardContent>

      <CardFooter className="bg-muted/10 border-t flex justify-end gap-2 py-3 pl-5">
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isLoading}
          onClick={() => onReject(question.id)}
        >
          Reject
        </Button>
        {onEdit && (
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => onEdit(question)}
          >
            <Edit3 className="size-3 mr-1" /> Edit
          </Button>
        )}
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={isLoading}
          onClick={() => onApprove(question.id)}
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : (
            <><CheckCircle2 className="size-3 mr-1" /> Approve & Add</>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function AIGeneratorPanel({
  assessmentId,
  workspaceId,
  targetSectionId,
  defaultSubject = "",
  defaultTopic = "",
  blueprintSummary,
  learningOutcomes,
  marksPerQuestion,
  onQuestionPromoted,
  onEditRequest,
}: AIGeneratorPanelProps) {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<AIGenerationBatchDetailResponse | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [formData, setFormData] = useState({
    topic: defaultTopic,
    question_type: "mcq" as QuestionTypeValue,
    difficulty: "medium" as "easy" | "medium" | "hard",
    bloom_level: "understand" as string,
    count: 5,
    additional_context: "",
  });

  // Sync defaults when parent changes (e.g. section selected)
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      topic: defaultTopic || prev.topic,
    }));
  }, [defaultTopic]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const startPolling = useCallback((batchId: string) => {
    setPolling(true);
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // ~3 minutes at 3s intervals

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const updated = await aiGenerationApi.getBatch(batchId);
        setBatch(updated);

        const status = updated.status?.toLowerCase();
        const isDone = status === "completed" || status === "failed" || status === "partial_failure";
        if (isDone || attempts >= MAX_ATTEMPTS) {
          stopPolling();
          if (status === "completed" || status === "partial_failure") {
            const count = (updated.questions ?? []).length;
            if (count > 0) {
              toast.success(`${count} question${count !== 1 ? "s" : ""} generated. Review each one before adding.`);
            } else {
              setError("AI returned 0 questions. Try adjusting the topic or additional context.");
            }
          } else if (status === "failed") {
            setError(updated.error_message || "Generation failed. Check Celery worker logs.");
          } else if (attempts >= MAX_ATTEMPTS) {
            setError("Generation is taking too long. Check if the Celery worker is running.");
          }
        }
      } catch {
        stopPolling();
        setError("Could not check generation status. Is the backend running?");
      }
    }, 3000);
  }, [stopPolling]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    stopPolling();
    setLoading(true);
    setError(null);
    setBatch(null);

    try {
      const payload: GenerateQuestionsRequest = {
        subject: defaultSubject || formData.topic,
        topic: formData.topic,
        question_type: formData.question_type,
        difficulty: formData.difficulty,
        bloom_level: formData.bloom_level,
        count: formData.count,
        additional_context: formData.additional_context || undefined,
        target_assessment_id: assessmentId,
        target_section_id: targetSectionId,
        // RAG source
        workspace_id: workspaceId,
        // Blueprint alignment
        blueprint_constraints: blueprintSummary,
        learning_outcomes: learningOutcomes,
        marks_per_question: marksPerQuestion,
      };

      const res = await aiGenerationApi.generateQuestions(payload);
      setBatch(res);

      if (res.status === "pending" || res.status === "processing") {
        toast.info("AI is generating questions from your course materials…");
        startPolling(res.id);
      } else {
        const count = (res.questions ?? []).length;
        if (count > 0) {
          toast.success(`${count} question${count !== 1 ? "s" : ""} generated. Review required.`);
        } else {
          setError("AI returned 0 questions. Try adjusting the topic or context.");
        }
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to generate questions.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (questionId: string) => {
    setReviewingId(questionId);
    try {
      await aiGenerationApi.reviewQuestion(questionId, {
        decision: "approved",
        add_to_assessment_id: assessmentId,
        add_to_section_id: targetSectionId,
        marks_if_added: marksPerQuestion,
        save_to_bank: true,
      });
      setBatch(prev => prev ? {
        ...prev,
        questions: (prev.questions ?? []).filter(q => q.id !== questionId),
      } : null);
      toast.success("Question approved and added to assessment.");
      onQuestionPromoted?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve question.");
    } finally {
      setReviewingId(null);
    }
  };

  const handleReject = async (questionId: string) => {
    setReviewingId(questionId);
    try {
      await aiGenerationApi.reviewQuestion(questionId, { decision: "rejected" });
      setBatch(prev => prev ? {
        ...prev,
        questions: (prev.questions ?? []).filter(q => q.id !== questionId),
      } : null);
      toast.info("Question rejected.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject question.");
    } finally {
      setReviewingId(null);
    }
  };

  const pendingQuestions = (batch?.questions ?? []).filter(
    q => q.review_status === "pending"
  );

  const hasWorkspace = !!workspaceId;
  const hasAssessment = !!assessmentId;

  return (
    <div className="space-y-5">
      {/* Safety banner */}
      <AISafetyNotice />

      {/* Context indicators */}
      {(hasWorkspace || blueprintSummary || learningOutcomes) && (
        <div className="flex flex-wrap gap-2">
          {hasWorkspace && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <BookOpen className="size-3" />
              RAG: Course materials linked
            </Badge>
          )}
          {blueprintSummary && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <FileText className="size-3" />
              Blueprint constraints active
            </Badge>
          )}
          {learningOutcomes && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <CheckCircle2 className="size-3" />
              Learning outcomes linked
            </Badge>
          )}
          {!hasWorkspace && (
            <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-300">
              <Info className="size-3" />
              No workspace linked — AI will generate without course material context
            </Badge>
          )}
        </div>
      )}

      {/* Generation Form */}
      <Card className="shadow-none border border-dashed border-primary/20 bg-muted/5">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-primary" />
            <CardTitle className="text-lg">AI Question Generator</CardTitle>
          </div>
          <CardDescription>
            {hasWorkspace
              ? "Questions will be grounded in your uploaded course materials (RAG)."
              : "No course workspace linked. Questions will be based on topic/subject only."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Topic */}
            <div className="space-y-2">
              <Label>Topic / Focus Area <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g., Database Normalization, Ethics in AI, Newton's Laws"
                value={formData.topic}
                onChange={e => setFormData(prev => ({ ...prev, topic: e.target.value }))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Be specific — the AI uses this to retrieve the right sections from your uploaded materials.
              </p>
            </div>

            {/* Type + Bloom */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Question Type <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.question_type}
                  onValueChange={(v: QuestionTypeValue) => setFormData(prev => ({ ...prev, question_type: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.map(qt => (
                      <SelectItem key={qt.value} value={qt.value}>
                        <span>{qt.label}</span>
                        <span className="ml-2 text-[10px] text-muted-foreground">({qt.hint})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bloom&apos;s Level</Label>
                <Select
                  value={formData.bloom_level}
                  onValueChange={v => setFormData(prev => ({ ...prev, bloom_level: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BLOOM_LEVELS.map(bl => (
                      <SelectItem key={bl.value} value={bl.value}>
                        {bl.label} <span className="text-[10px] text-muted-foreground ml-1">— {bl.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Difficulty + Count */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select
                  value={formData.difficulty}
                  onValueChange={(v: "easy" | "medium" | "hard") => setFormData(prev => ({ ...prev, difficulty: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map(d => (
                      <SelectItem key={d.value} value={d.value}>
                        <span className={d.color}>{d.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Number of Questions (1–15)</Label>
                <Input
                  type="number"
                  min="1"
                  max="15"
                  value={formData.count}
                  onChange={e => setFormData(prev => ({ ...prev, count: Math.max(1, Math.min(15, parseInt(e.target.value) || 1)) }))}
                  required
                />
              </div>
            </div>

            {/* Blueprint context (read-only display) */}
            {blueprintSummary && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded-md text-xs text-blue-700">
                <strong>Blueprint Rules (injected into AI prompt):</strong>
                <p className="mt-1 whitespace-pre-wrap">{blueprintSummary}</p>
              </div>
            )}

            {/* Learning outcomes display */}
            {learningOutcomes && (
              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 rounded-md text-xs text-purple-700">
                <strong>Learning Outcomes (injected into AI prompt):</strong>
                <p className="mt-1 whitespace-pre-wrap">{learningOutcomes}</p>
              </div>
            )}

            {/* Additional context */}
            <div className="space-y-2">
              <Label>Additional Instructions (Optional)</Label>
              <Textarea
                placeholder="e.g., Focus on Chapter 3 content. Avoid questions about X. Include practical examples from industry..."
                value={formData.additional_context}
                onChange={e => setFormData(prev => ({ ...prev, additional_context: e.target.value }))}
                className="h-20 resize-none"
              />
              <p className="text-xs text-muted-foreground">
                These notes are appended to the AI context alongside your course materials.
              </p>
            </div>

            {/* Warning if no assessment saved yet */}
            {!hasAssessment && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="size-4 text-amber-600" />
                <AlertDescription className="text-amber-700 text-xs">
                  Save the assessment draft first before generating questions. The AI needs an assessment ID to link questions to.
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={loading || polling || !hasAssessment}
              className="w-full"
            >
              {loading ? (
                <><Loader2 className="mr-2 size-4 animate-spin" />Submitting…</>
              ) : polling ? (
                <><Loader2 className="mr-2 size-4 animate-spin" />AI is generating…</>
              ) : (
                <><Sparkles className="mr-2 size-4" />Generate Questions from Course Materials</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Generation Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Polling indicator */}
      {polling && batch && (batch.status === "pending" || batch.status === "processing") && (
        <Alert>
          <Clock className="size-4" />
          <AlertTitle>AI is generating questions from your course materials…</AlertTitle>
          <AlertDescription>
            This may take 30–90 seconds. The Celery worker is retrieving context from your uploaded files and generating grounded questions.
          </AlertDescription>
        </Alert>
      )}

      {/* Review Queue */}
      {pendingQuestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Pending Review ({pendingQuestions.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Review each question before adding to assessment
            </p>
          </div>

          <div className="space-y-4">
            {pendingQuestions.map(q => (
              <GeneratedQuestionCard
                key={q.id}
                question={q}
                reviewingId={reviewingId}
                onApprove={handleApprove}
                onReject={handleReject}
                onEdit={onEditRequest}
              />
            ))}
          </div>

          {/* Bulk actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={!!reviewingId}
              onClick={async () => {
                for (const q of pendingQuestions) {
                  try {
                    await aiGenerationApi.reviewQuestion(q.id, { decision: "rejected" });
                  } catch {}
                }
                setBatch(null);
                toast.info("All questions rejected.");
              }}
            >
              <XCircle className="size-3 mr-1" /> Reject All
            </Button>
          </div>
        </div>
      )}

      {/* Empty state after review */}
      {batch && pendingQuestions.length === 0 && !polling && batch.status?.toLowerCase() === "completed" && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500" />
          All generated questions have been reviewed.
        </div>
      )}
    </div>
  );
}
