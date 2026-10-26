"use client";

import { Check, CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneratorStage } from "@/hooks/use-question-generation";

type StepState = "active" | "done" | "todo";

function stepStates(stage: GeneratorStage): [StepState, StepState, StepState] {
  switch (stage) {
    case "configure":
      return ["active", "todo", "todo"];
    case "generating":
      return ["done", "active", "todo"];
    case "review":
      return ["done", "done", "active"];
    case "completed":
      return ["done", "done", "done"];
  }
}

const STEP_BOX: Record<StepState, string> = {
  active: "border border-border/80 bg-card text-foreground shadow-2xs",
  done: "text-primary/90 opacity-90",
  todo: "text-muted-foreground",
};

const STEP_BADGE: Record<StepState, string> = {
  active: "bg-primary text-primary-foreground shadow-2xs",
  done: "bg-primary/20 text-primary",
  todo: "bg-muted text-muted-foreground",
};

/** Blueprint -> Item synthesis -> Audit queue progress strip. */
export function WorkflowStepper({ stage }: { stage: GeneratorStage }) {
  const [one, two, three] = stepStates(stage);
  const committed = stage === "completed";

  const box = "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all";
  const badge = "flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold";

  return (
    <ol
      aria-label="Question generation progress"
      className="grid grid-cols-3 gap-1.5 rounded-xl border border-border/60 bg-muted/30 p-1"
    >
      <li aria-current={one === "active" ? "step" : undefined} className={cn(box, STEP_BOX[one])}>
        <span className={cn(badge, STEP_BADGE[one])}>{one === "done" ? <Check className="size-3" /> : "1"}</span>
        <span className="truncate">1. Blueprint</span>
      </li>

      <li aria-current={two === "active" ? "step" : undefined} className={cn(box, STEP_BOX[two])}>
        <span className={cn(badge, STEP_BADGE[two], two === "active" && "animate-pulse")}>
          {two === "active" ? <Loader2 className="size-3 animate-spin" /> : two === "done" ? <Check className="size-3" /> : "2"}
        </span>
        <span className="truncate">2. Item Synthesis</span>
      </li>

      <li
        aria-current={three === "active" ? "step" : undefined}
        className={cn(
          box,
          committed ? "border border-emerald-500/30 bg-card text-emerald-700 shadow-2xs dark:text-emerald-400" : STEP_BOX[three]
        )}
      >
        <span className={cn(badge, committed ? "bg-emerald-600 text-white" : STEP_BADGE[three])}>
          {committed ? <CheckCheck className="size-3" /> : "3"}
        </span>
        <span className="truncate">{committed ? "3. Committed" : "3. Audit Queue"}</span>
      </li>
    </ol>
  );
}
