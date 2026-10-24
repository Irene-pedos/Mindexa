"use client";

import { useEffect, useState, type ReactElement } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AIGenerationBatchDetailResponse, BatchSectionProgress } from "@/lib/api/ai-generation";

export type GenerationPhase = "running" | "failed" | "timeout";

export interface GenerationRun {
  phase: GenerationPhase;
  batchId: string | null;
  /** Blueprint section id, or "all" */
  target: string;
  startedAt: number;
  batch?: AIGenerationBatchDetailResponse;
  error?: string;
}

function stageOf(run: GenerationRun): { label: string; step: 1 | 2 | 3 } {
  const status = run.batch?.status?.toUpperCase();
  if (!run.batchId || status === "PENDING") return { label: "Waiting for the AI worker", step: 1 };
  const done = (run.batch?.total_generated ?? 0) + (run.batch?.total_failed ?? 0);
  const total = run.batch?.total_requested ?? 0;
  if (total > 0 && done >= total) return { label: "Checking the questions", step: 3 };
  return { label: "Writing questions", step: 2 };
}

const SECTION_ICON: Record<BatchSectionProgress["status"], ReactElement> = {
  PENDING: <CircleDashed className="size-3.5 text-muted-foreground" />,
  RUNNING: <Loader2 className="size-3.5 animate-spin text-violet-600" />,
  DONE: <CheckCircle2 className="size-3.5 text-emerald-600" />,
  PARTIAL: <AlertTriangle className="size-3.5 text-amber-600" />,
  FAILED: <AlertTriangle className="size-3.5 text-red-600" />,
};

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function AiGenerationProgress({
  run,
  sectionNames,
  onRetry,
  onKeepWaiting,
  onDismiss,
}: {
  run: GenerationRun | null;
  /** Blueprint section id -> title, to label progress rows */
  sectionNames: Record<string, string>;
  onRetry: () => void;
  onKeepWaiting: () => void;
  onDismiss: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (run?.phase !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [run?.phase]);

  if (!run) return null;

  const batch = run.batch;
  const total = batch?.total_requested ?? 0;
  const done = (batch?.total_generated ?? 0) + (batch?.total_failed ?? 0);
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const stage = stageOf(run);
  const rows = batch?.sections_progress ?? [];
  const remaining = Math.max(0, Math.min(3, total - done));
  const reason = run.error || batch?.error_message || null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border/60 bg-card p-4 text-card-foreground shadow-2xl animate-in slide-in-from-bottom-5 duration-300"
    >
      <div className="mb-2 flex items-start gap-2">
        {run.phase === "running" ? (
          <Sparkles className="mt-0.5 size-4 animate-pulse text-violet-600" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 text-red-600" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {run.phase === "running" && "AI is writing your questions"}
            {run.phase === "failed" && "The AI could not finish"}
            {run.phase === "timeout" && "This is taking longer than expected"}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {run.phase === "running" ? (
              <>
                {stage.label} · step {stage.step} of 3 · <Clock className="size-3" /> {formatElapsed(now - run.startedAt)}
              </>
            ) : run.phase === "timeout" ? (
              "The request may still be running in the background."
            ) : (
              "Nothing was added to your paper."
            )}
          </p>
        </div>
        {run.phase !== "running" && (
          <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>

      {run.phase === "running" && (
        <>
          {total > 0 && done > 0 ? (
            <Progress value={percent} className="h-1.5" />
          ) : (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-violet-500/70" />
            </div>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {total > 0 ? `${batch?.total_generated ?? 0} written, ${batch?.total_failed ?? 0} failed, ${total} requested` : "Starting…"}
          </p>

          {rows.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {rows.map((r, i) => (
                <li key={`${r.section_id ?? i}-${r.question_type ?? ""}-${i}`} className="flex items-center gap-2 text-xs">
                  {SECTION_ICON[r.status]}
                  <span className="min-w-0 flex-1 truncate">
                    {(r.section_id && sectionNames[r.section_id]) || r.topic || `Section ${i + 1}`}
                    {r.question_type ? <span className="text-muted-foreground"> · {r.question_type.replace("_", " ")}</span> : null}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {r.status === "PENDING" ? "waiting" : `${r.generated}/${r.count ?? "?"}`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {remaining > 0 && (
            <div className="mt-3 space-y-1.5" aria-hidden="true">
              {Array.from({ length: remaining }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/70" />
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">You can keep editing other parts while this runs.</p>
        </>
      )}

      {run.phase !== "running" && (
        <div className="space-y-3">
          {reason && (
            <p className={cn("rounded-md bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300", "break-words")}>{reason}</p>
          )}
          {rows.some((r) => r.status === "FAILED" || r.status === "PARTIAL") && (
            <ul className="space-y-1 text-xs">
              {rows
                .filter((r) => r.status === "FAILED" || r.status === "PARTIAL")
                .map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {SECTION_ICON[r.status]}
                    <span>
                      {(r.section_id && sectionNames[r.section_id]) || r.topic || "Section"}: {r.error || "some questions were incomplete"}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={onRetry}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
            {run.phase === "timeout" && run.batchId && (
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onKeepWaiting}>
                Keep waiting
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={onDismiss}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
