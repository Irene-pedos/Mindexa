"use client";

import { CheckCheck, FileText, Library, MessageSquare, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";

interface NextStep {
  key: string;
  icon: typeof RotateCcw;
  title: string;
  text: string;
  onClick: () => void;
}

interface CompletedHubProps {
  approvedCount: number;
  onAnotherBatch: () => void;
  onOpenQuestionBank: () => void;
  /** Present when the batch was attached to a draft assessment. */
  onOpenDraft?: () => void;
  /** Present when the host can switch to the chat module. */
  onOpenChat?: () => void;
}

/** What to do after a batch has been reviewed. */
export function CompletedHub({
  approvedCount,
  onAnotherBatch,
  onOpenQuestionBank,
  onOpenDraft,
  onOpenChat,
}: CompletedHubProps) {
  const steps: NextStep[] = [
    {
      key: "another",
      icon: RotateCcw,
      title: "Another Batch",
      text: "Synthesize another batch for new topic.",
      onClick: onAnotherBatch,
    },
    {
      key: "bank",
      icon: Library,
      title: "Question Bank",
      text: "Browse and organize subject bank items.",
      onClick: onOpenQuestionBank,
    },
  ];
  if (onOpenDraft) {
    steps.push({
      key: "draft",
      icon: FileText,
      title: "Edit Draft",
      text: "Open assessment with newly committed items.",
      onClick: onOpenDraft,
    });
  } else if (onOpenChat) {
    steps.push({
      key: "chat",
      icon: MessageSquare,
      title: "Copilot Chat",
      text: "Ask advice or rubric guidance.",
      onClick: onOpenChat,
    });
  }

  return (
    <Card className="mx-auto max-w-xl space-y-5 rounded-2xl border border-border/70 bg-card p-6 text-center shadow-xs sm:p-7">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 shadow-2xs dark:text-emerald-400">
        <CheckCheck className="size-6" />
      </div>

      <div className="mx-auto max-w-md space-y-1">
        <h3 className="text-base font-bold text-foreground">Batch Review Completed</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Audited successfully.{" "}
          <strong className="font-semibold text-emerald-600">
            {approvedCount} question{approvedCount === 1 ? "" : "s"}
          </strong>{" "}
          {approvedCount === 1 ? "has" : "have"} been committed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 pt-1 text-left sm:grid-cols-3">
        {steps.map(({ key, icon: Icon, title, text, onClick }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            className="cursor-pointer space-y-1.5 rounded-xl border border-border/60 p-3 text-left transition-all hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-3.5" />
            </span>
            <span className="block text-xs font-bold text-foreground">{title}</span>
            <span className="block text-[10px] leading-normal text-muted-foreground">{text}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
