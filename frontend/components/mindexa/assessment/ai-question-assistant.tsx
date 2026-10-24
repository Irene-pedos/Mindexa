"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, Loader2, RefreshCw, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { lecturerAiApi, type EnhanceAction, type EnhanceQuestionResponse } from "@/lib/api/lecturer-ai";
import type { QuestionIssue } from "@/lib/assessment-readiness";
import { applySnapshot, toSnapshot, type WizardQuestionLike } from "@/lib/question-ai-mapping";

const ACTION_LABELS: Record<EnhanceAction, string> = {
  improve_wording: "Improve wording",
  fix_ambiguity: "Remove ambiguity",
  add_explanation: "Add model answer / explanation",
  add_distractors: "Add wrong-answer options",
  add_sub_questions: "Write sub-questions",
  complete_missing: "Complete everything missing",
  make_easier: "Make easier",
  make_harder: "Make harder",
};

const norm = (t: string): string => (t || "").toLowerCase().replace(/[^a-z]/g, "");

/** Actions that make sense for a question type, in menu order. */
function actionsFor(type: string): EnhanceAction[] {
  const t = norm(type);
  const common: EnhanceAction[] = ["complete_missing", "improve_wording", "fix_ambiguity", "make_easier", "make_harder"];
  if (t === "mcq") return ["add_distractors", ...common];
  if (t === "casestudy") return ["add_sub_questions", ...common];
  if (["shortanswer", "essay", "computational"].includes(t)) return ["add_explanation", ...common];
  return common;
}

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; action: EnhanceAction }
  | { kind: "proposal"; action: EnhanceAction; result: EnhanceQuestionResponse }
  | { kind: "error"; action: EnhanceAction; message: string };

const SEVERITY_STYLE: Record<QuestionIssue["severity"], string> = {
  blocking: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  suggestion: "border-border bg-muted/50 text-muted-foreground",
};

export function AiQuestionAssistant<Q extends WizardQuestionLike & { sectionId: string }>({
  question,
  issues,
  sectionName,
  subject,
  topic,
  workspaceId,
  onApply,
}: {
  question: Q;
  issues: QuestionIssue[];
  sectionName?: string;
  subject?: string;
  topic?: string;
  workspaceId?: string;
  onApply: (updated: Q) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "loading";

  const run = async (action: EnhanceAction) => {
    setPhase({ kind: "loading", action });
    try {
      const result = await lecturerAiApi.enhanceQuestion({
        question: toSnapshot(question, { section: sectionName }),
        action,
        subject,
        topic,
        workspace_id: workspaceId,
      });
      setPhase({ kind: "proposal", action, result });
    } catch (err) {
      setPhase({
        kind: "error",
        action,
        message: err instanceof Error && err.message ? err.message : "The AI could not respond. Try again.",
      });
    }
  };

  const accept = () => {
    if (phase.kind !== "proposal") return;
    onApply(applySnapshot(question, phase.result.question));
    toast.success("AI suggestion applied. Review it, then keep going.");
    setPhase({ kind: "idle" });
  };

  const visibleIssues = issues.filter((i) => i.code !== "AI_UNREVIEWED");

  return (
    <div className="space-y-2" data-testid="ai-question-assistant">
      <div className="flex flex-wrap items-center gap-1.5">
        {visibleIssues.map((issue) => (
          <span
            key={issue.code}
            className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]", SEVERITY_STYLE[issue.severity])}
          >
            {issue.severity === "blocking" ? <AlertTriangle className="size-3" /> : null}
            {issue.message}
            {issue.aiFixable && issue.fix && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(issue.fix as EnhanceAction)}
                className="ml-1 inline-flex items-center gap-0.5 rounded bg-violet-600 px-1.5 py-px text-[10px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                <Sparkles className="size-2.5" /> Fix with AI
              </button>
            )}
          </span>
        ))}
        {visibleIssues.length === 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
            <CheckCircle2 className="size-3" /> Looks complete
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={busy} className="ml-auto h-7 gap-1 text-xs">
              {busy ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
              AI assist
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              AI proposes a change; you review it before it is applied.
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {actionsFor(question.type).map((a) => (
              <DropdownMenuItem key={a} onSelect={() => run(a)} className="text-xs">
                {ACTION_LABELS[a]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {phase.kind === "loading" && (
        <div className="space-y-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-xs font-medium text-violet-700 dark:text-violet-300">
            <Loader2 className="size-3.5 animate-spin" /> {ACTION_LABELS[phase.action]}…
          </p>
          <div className="space-y-1.5">
            <div className="h-2.5 w-4/5 animate-pulse rounded bg-violet-500/15" />
            <div className="h-2.5 w-3/5 animate-pulse rounded bg-violet-500/15" />
          </div>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs">
          <AlertTriangle className="size-3.5 text-red-600" />
          <span className="min-w-0 flex-1 text-red-700 dark:text-red-300">{phase.message}</span>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => run(phase.action)}>
            <RefreshCw className="size-3" /> Retry
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPhase({ kind: "idle" })}>
            Dismiss
          </Button>
        </div>
      )}

      {phase.kind === "proposal" && <Proposal result={phase.result} onAccept={accept} onRetry={() => run(phase.action)} onDiscard={() => setPhase({ kind: "idle" })} />}
    </div>
  );
}

function Proposal({
  result,
  onAccept,
  onRetry,
  onDiscard,
}: {
  result: EnhanceQuestionResponse;
  onAccept: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const q = result.question;
  return (
    <div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-violet-700 dark:text-violet-300">
        <Sparkles className="size-3.5" /> AI suggestion
      </p>
      <p>{result.summary}</p>
      {result.changes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
          {result.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5 rounded-md border bg-background p-2.5">
        {q.case_study_context && <p className="italic text-muted-foreground">{q.case_study_context}</p>}
        {q.text && <p className="font-medium">{q.text}</p>}
        {q.options.length > 0 && (
          <ol className="space-y-0.5">
            {q.options.map((o, i) => (
              <li key={`${i}-${o.text}`} className="flex gap-1.5">
                <span className={cn("mt-px", o.is_correct ? "text-emerald-600" : "text-muted-foreground/50")}>
                  {o.is_correct ? <Check className="size-3" /> : <X className="size-3" />}
                </span>
                <span>
                  {o.text}
                  {o.match_key ? <span className="ml-1 text-muted-foreground">({o.match_key}m)</span> : null}
                  {o.explanation ? <span className="block text-muted-foreground">→ {o.explanation}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
        {q.explanation && <p className="text-muted-foreground">Model answer: {q.explanation}</p>}
      </div>

      {result.remaining_issues.length > 0 && (
        <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-px size-3 shrink-0" />
          Still missing after this change: {result.remaining_issues.join(" ")}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={onAccept}>
          <Check className="size-3" /> Apply
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onRetry}>
          <RefreshCw className="size-3" /> Try again
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
