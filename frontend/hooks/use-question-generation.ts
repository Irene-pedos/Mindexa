"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { QuestionFormatId } from "@/components/mindexa/lecturer/question-generator/constants";
import {
  aiGenerationApi,
  type AIGeneratedQuestionResponse,
  type GeneratedQuestionOptionResponse,
  type GenerateQuestionsRequest,
} from "@/lib/api/ai-generation";
import { assessmentApi } from "@/lib/api/assessment";
import { batchPhase } from "@/lib/ai-batch";
import { errorMessage } from "@/lib/error-message";

export type GeneratorStage = "configure" | "generating" | "review" | "completed";
export type Destination = "bank" | "assessment";

export interface GeneratorForm {
  topic: string;
  question_type: QuestionFormatId;
  difficulty: GenerateQuestionsRequest["difficulty"];
  bloom_level: string;
  count: number;
  additional_context: string;
}

export interface AssessmentOption {
  id: string;
  title: string;
  status: string;
  assessment_type: string;
}

export interface QuestionEdits {
  text: string;
  explanation: string;
  options: GeneratedQuestionOptionResponse[];
}

const INITIAL_FORM: GeneratorForm = {
  topic: "",
  question_type: "mcq",
  difficulty: "medium",
  bloom_level: "understand",
  count: 5,
  additional_context: "",
};

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // 3 minutes

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toAssessmentOptions(response: unknown): AssessmentOption[] {
  const list = Array.isArray(response)
    ? response
    : (response as { items?: unknown } | null)?.items;
  return Array.isArray(list) ? (list as AssessmentOption[]) : [];
}

interface Options {
  workspaceId: string;
  workspaceName?: string;
}

/**
 * The question-generation workflow: configure, generate (a background batch that is polled),
 * review each candidate, and commit. Cancel and restart are safe: every run has an id and a
 * result from an older run is dropped instead of flipping the screen back.
 */
export function useQuestionGeneration({ workspaceId, workspaceName }: Options) {
  const [rawStage, setStage] = useState<GeneratorStage>("configure");
  const [form, setFormState] = useState<GeneratorForm>(INITIAL_FORM);
  const [destination, setDestination] = useState<Destination>("bank");
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");

  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<AIGeneratedQuestionResponse[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);

  // Bumped on every start, on Cancel and on unmount; async work compares the id it started with.
  const runRef = useRef(0);
  const startedAtRef = useRef(0);

  // Reviewing the last candidate completes the batch.
  const stage: GeneratorStage = rawStage === "review" && candidates.length === 0 ? "completed" : rawStage;

  const setForm = useCallback((patch: Partial<GeneratorForm>) => setFormState((prev) => ({ ...prev, ...patch })), []);

  // Draft assessments a batch can be attached to.
  useEffect(() => {
    let cancelled = false;
    assessmentApi
      .getAssessments({ status: "DRAFT" })
      .then((response: unknown) => {
        if (cancelled) return;
        const list = toAssessmentOptions(response);
        setAssessments(list);
        if (list.length > 0) setSelectedAssessmentId((prev) => prev || list[0].id);
      })
      .catch((err: unknown) => console.error("Failed to load assessments", err));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Invalidate in-flight work when the component goes away.
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    []
  );

  // Elapsed-seconds counter while generating.
  useEffect(() => {
    if (stage !== "generating") return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [stage]);

  const targetAssessmentId = destination === "assessment" && selectedAssessmentId ? selectedAssessmentId : undefined;

  const failToConfigure = useCallback((message: string) => {
    setError(message);
    setStage("configure");
  }, []);

  const showCandidates = useCallback(
    (list: AIGeneratedQuestionResponse[], successMessage: string, emptyMessage: string) => {
      if (list.length === 0) {
        failToConfigure(emptyMessage);
        return;
      }
      setCandidates(list);
      setStage("review");
      toast.success(successMessage);
    },
    [failToConfigure]
  );

  const pollBatch = useCallback(
    async (batchId: string, runId: number) => {
      for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
        await sleep(POLL_INTERVAL_MS);
        if (runId !== runRef.current) return;

        let batch;
        try {
          batch = await aiGenerationApi.getBatch(batchId);
        } catch {
          if (runId === runRef.current) {
            failToConfigure("Could not poll generation status. Please verify backend connectivity.");
          }
          return;
        }
        if (runId !== runRef.current) return; // cancelled or superseded while the request was in flight

        const phase = batchPhase(batch.status);
        if (phase === "ready") {
          const list = batch.questions || [];
          showCandidates(
            list,
            `${list.length} candidate questions generated! Review each before saving.`,
            "AI returned 0 questions. Please refine your topic or additional guidance."
          );
          return;
        }
        if (phase === "failed") {
          failToConfigure(batch.error_message || "Generation encountered an issue in the AI worker. Please try again.");
          return;
        }
      }
      if (runId === runRef.current) {
        failToConfigure("Generation timed out. Please check if your background workers are active.");
      }
    },
    [failToConfigure, showCandidates]
  );

  const start = useCallback(async () => {
    if (!form.topic.trim()) {
      toast.error("Please enter a topic or concept to test.");
      return;
    }
    if (destination === "assessment" && !selectedAssessmentId) {
      toast.error("Choose a draft assessment to add the questions to, or switch the destination to the Question Bank.");
      return;
    }

    setError(null);
    setStage("generating");
    setElapsed(0);
    startedAtRef.current = Date.now();
    setApprovedCount(0);
    setRejectedCount(0);
    const runId = ++runRef.current;

    try {
      const batch = await aiGenerationApi.generateQuestions({
        subject: workspaceName || form.topic,
        topic: form.topic.trim(),
        question_type: form.question_type,
        difficulty: form.difficulty,
        bloom_level: form.bloom_level,
        count: form.count,
        additional_context: form.additional_context.trim() || undefined,
        target_assessment_id: targetAssessmentId,
        workspace_id: workspaceId || undefined,
      });
      if (runId !== runRef.current) return;

      // A batch is generated by a background worker: unless it already finished, wait for it.
      const phase = batchPhase(batch.status);
      if (phase === "running") {
        void pollBatch(batch.id, runId);
      } else if (phase === "ready") {
        const list = batch.questions || [];
        showCandidates(
          list,
          `${list.length} candidate questions generated!`,
          "AI returned 0 questions. Please adjust your topic or context."
        );
      } else {
        failToConfigure(batch.error_message || "Generation failed. Please try again.");
      }
    } catch (err) {
      if (runId !== runRef.current) return;
      console.error("AI question generation failed", err);
      const message = errorMessage(err, "Failed to initiate AI question generation.");
      toast.error(message);
      failToConfigure(message);
    }
  }, [
    form,
    destination,
    selectedAssessmentId,
    targetAssessmentId,
    workspaceId,
    workspaceName,
    pollBatch,
    showCandidates,
    failToConfigure,
  ]);

  const cancel = useCallback(() => {
    runRef.current += 1; // invalidate anything still in flight
    setStage("configure");
    toast.info("Generation cancelled.");
  }, []);

  const dropCandidate = (id: string) => setCandidates((prev) => prev.filter((q) => q.id !== id));

  const approve = useCallback(
    async (questionId: string) => {
      setReviewingId(questionId);
      try {
        await aiGenerationApi.reviewQuestion(questionId, {
          decision: "approved",
          add_to_assessment_id: targetAssessmentId,
          save_to_bank: true,
        });
        dropCandidate(questionId);
        setApprovedCount((c) => c + 1);
        toast.success(
          destination === "assessment"
            ? "Approved & added to assessment draft and Question Bank!"
            : "Approved & saved to Question Bank!"
        );
      } catch (err) {
        toast.error(errorMessage(err, "Failed to approve question."));
      } finally {
        setReviewingId(null);
      }
    },
    [targetAssessmentId, destination]
  );

  const reject = useCallback(async (questionId: string) => {
    setReviewingId(questionId);
    try {
      await aiGenerationApi.reviewQuestion(questionId, { decision: "rejected" });
      dropCandidate(questionId);
      setRejectedCount((c) => c + 1);
      toast.info("Candidate question rejected.");
    } catch (err) {
      toast.error(errorMessage(err, "Failed to reject question."));
    } finally {
      setReviewingId(null);
    }
  }, []);

  const approveAll = useCallback(async () => {
    if (candidates.length === 0) return;
    if (destination === "assessment" && !selectedAssessmentId) {
      toast.error("Choose a draft assessment first, or switch the destination to the Question Bank.");
      return;
    }
    setReviewingId("ALL");
    const queue = [...candidates];
    let approved = 0;
    try {
      for (const q of queue) {
        await aiGenerationApi.reviewQuestion(q.id, {
          decision: "approved",
          add_to_assessment_id: targetAssessmentId,
          save_to_bank: true,
        });
        approved += 1;
        // Take each question out of the queue as soon as it is saved, so a failure part-way
        // leaves exactly the unsaved ones behind and a retry cannot approve a question twice.
        dropCandidate(q.id);
      }
      toast.success("All remaining questions approved and saved!");
    } catch {
      toast.error(
        approved > 0
          ? `Approved ${approved} of ${queue.length}, then stopped on an error. The rest are still in the queue.`
          : "An error occurred while approving the remaining questions."
      );
    } finally {
      if (approved > 0) setApprovedCount((c) => c + approved);
      setReviewingId(null);
    }
  }, [candidates, destination, selectedAssessmentId, targetAssessmentId]);

  const rejectAll = useCallback(async () => {
    if (candidates.length === 0) return;
    setReviewingId("ALL");
    const queue = [...candidates];
    let rejected = 0;
    try {
      for (const q of queue) {
        await aiGenerationApi.reviewQuestion(q.id, { decision: "rejected" });
        rejected += 1;
        dropCandidate(q.id);
      }
      toast.info("Remaining questions rejected.");
    } catch {
      toast.error(
        rejected > 0
          ? `Rejected ${rejected} of ${queue.length}, then stopped on an error. The rest are still in the queue.`
          : "Failed to reject remaining questions."
      );
    } finally {
      if (rejected > 0) setRejectedCount((c) => c + rejected);
      setReviewingId(null);
    }
  }, [candidates]);

  /** Save the lecturer's edits and approve the question. Returns whether it worked. */
  const saveEdit = useCallback(
    async (question: AIGeneratedQuestionResponse, edits: QuestionEdits): Promise<boolean> => {
      if (!edits.text.trim()) {
        toast.error("Question text cannot be blank.");
        return false;
      }
      try {
        await aiGenerationApi.reviewQuestion(question.id, {
          decision: "edited",
          modified_question_text: edits.text.trim(),
          modified_options_json: edits.options.length > 0 ? JSON.stringify(edits.options) : undefined,
          modified_explanation: edits.explanation.trim() || undefined,
          add_to_assessment_id: targetAssessmentId,
          save_to_bank: true,
        });
        dropCandidate(question.id);
        setApprovedCount((c) => c + 1);
        toast.success("Edited question saved and approved!");
        return true;
      } catch (err) {
        toast.error(errorMessage(err, "Failed to save edited question."));
        return false;
      }
    },
    [targetAssessmentId]
  );

  const startAnotherBatch = useCallback(() => {
    setStage("configure");
    setForm({ topic: "" });
  }, [setForm]);

  const selectedAssessment = assessments.find((a) => a.id === selectedAssessmentId);
  const progress = useMemo(() => {
    const total = candidates.length + approvedCount + rejectedCount || 1;
    const reviewed = approvedCount + rejectedCount;
    return { total, reviewed, percent: Math.round((reviewed / total) * 100) };
  }, [candidates.length, approvedCount, rejectedCount]);

  return {
    stage,
    form,
    setForm,
    destination,
    setDestination,
    assessments,
    selectedAssessmentId,
    setSelectedAssessmentId,
    selectedAssessment,
    elapsed,
    error,
    candidates,
    reviewingId,
    approvedCount,
    progress,
    start,
    cancel,
    approve,
    reject,
    approveAll,
    rejectAll,
    saveEdit,
    startAnotherBatch,
  };
}
