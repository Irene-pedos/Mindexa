"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, GraduationCap, Layers, Library } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompletedHub } from "@/components/mindexa/lecturer/question-generator/completed-hub";
import { ConfigForm } from "@/components/mindexa/lecturer/question-generator/config-form";
import { EditQuestionDialog } from "@/components/mindexa/lecturer/question-generator/edit-question-dialog";
import { GenerationProgress } from "@/components/mindexa/lecturer/question-generator/generation-progress";
import { ReviewQueue } from "@/components/mindexa/lecturer/question-generator/review-queue";
import { WorkflowStepper } from "@/components/mindexa/lecturer/question-generator/workflow-stepper";
import { useQuestionGeneration } from "@/hooks/use-question-generation";
import type { AIGeneratedQuestionResponse } from "@/lib/api/ai-generation";

interface QuestionGeneratorLauncherProps {
  workspaceId: string;
  workspaceName?: string;
  language?: string;
  isRwandaBlocked?: boolean;
  /** Switches the assistant to its chat module (used by the post-review "Copilot Chat" card). */
  onOpenChat?: () => void;
}

const QUESTION_BANK_PATH = "/lecturer/assessments/question-bank";

function PolicyNotice({ onOpenQuestionBank }: { onOpenQuestionBank: () => void }) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 sm:p-6">
      <Card className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-xs sm:p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-xl bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-5" />
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="text-sm font-bold text-foreground sm:text-base">Institutional Policy Notice</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Automated question generation is restricted for Kinyarwanda-medium curriculum units under institutional
              academic integrity governance.
            </p>
            <div className="pt-1">
              <Button size="sm" onClick={onOpenQuestionBank} className="h-8 cursor-pointer gap-2 rounded-lg text-xs font-semibold">
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

/**
 * Question Generator Studio: configure a batch, let the AI draft it in the background, then
 * audit every candidate (approve, edit or reject) before anything is stored. The workflow lives
 * in `useQuestionGeneration`; each stage is a component under `question-generator/`.
 */
export function QuestionGeneratorLauncher({
  workspaceId,
  workspaceName,
  language = "EN",
  isRwandaBlocked = false,
  onOpenChat,
}: QuestionGeneratorLauncherProps) {
  const router = useRouter();
  const generation = useQuestionGeneration({ workspaceId, workspaceName });
  const [editing, setEditing] = useState<AIGeneratedQuestionResponse | null>(null);

  if (isRwandaBlocked || language === "RW") {
    return <PolicyNotice onOpenQuestionBank={() => router.push(QUESTION_BANK_PATH)} />;
  }

  const { stage, form, destination, selectedAssessment, selectedAssessmentId } = generation;
  const draftTarget = destination === "assessment" && selectedAssessmentId ? selectedAssessmentId : null;

  return (
    <div className="narrow-scrollbar-dark mx-auto w-full max-w-6xl flex-1 space-y-3.5 overflow-y-auto p-3 sm:p-4 lg:p-5">
      <div className="flex flex-col items-start justify-between gap-2.5 border-b border-border/50 pb-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-2xs">
            <Layers className="size-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold leading-none tracking-tight text-foreground">
                Question Generator Studio
              </h2>
              <Badge variant="outline" className="h-4.5 border-primary/30 bg-primary/5 px-2 py-0 text-[10px] font-semibold text-primary">
                Curriculum Grounded
              </Badge>
              <Badge variant="secondary" className="h-4.5 px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                Human Sign-off
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-tight text-muted-foreground">
              Formulate syllabus-grounded assessment items held for your explicit sign-off.
            </p>
          </div>
        </div>

        {workspaceName && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
            <GraduationCap className="size-3.5 text-primary" />
            <span className="max-w-[200px] truncate text-[11px] font-semibold text-foreground">{workspaceName}</span>
          </div>
        )}
      </div>

      <WorkflowStepper stage={stage} />

      {stage === "configure" && (
        <ConfigForm
          form={form}
          onChange={generation.setForm}
          destination={destination}
          onDestinationChange={generation.setDestination}
          assessments={generation.assessments}
          selectedAssessmentId={selectedAssessmentId}
          onAssessmentChange={generation.setSelectedAssessmentId}
          error={generation.error}
          onSubmit={generation.start}
        />
      )}

      {stage === "generating" && (
        <GenerationProgress
          elapsedSeconds={generation.elapsed}
          bloomLevel={form.bloom_level}
          count={form.count}
          onCancel={generation.cancel}
        />
      )}

      {stage === "review" && (
        <ReviewQueue
          candidates={generation.candidates}
          targetName={destination === "assessment" && selectedAssessment ? selectedAssessment.title : "Question Bank"}
          progress={generation.progress}
          reviewingId={generation.reviewingId}
          onApprove={generation.approve}
          onReject={generation.reject}
          onApproveAll={generation.approveAll}
          onRejectAll={generation.rejectAll}
          onEdit={setEditing}
        />
      )}

      {stage === "completed" && (
        <CompletedHub
          approvedCount={generation.approvedCount}
          onAnotherBatch={generation.startAnotherBatch}
          onOpenQuestionBank={() => router.push(QUESTION_BANK_PATH)}
          onOpenDraft={draftTarget ? () => router.push(`/lecturer/assessments/${draftTarget}`) : undefined}
          onOpenChat={onOpenChat}
        />
      )}

      <EditQuestionDialog question={editing} onClose={() => setEditing(null)} onSave={generation.saveEdit} />
    </div>
  );
}
