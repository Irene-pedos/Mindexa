"use client";

import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GuardFinding, GuardSeverity } from "@/lib/grading-guard";

const STYLES: Record<GuardSeverity, { box: string; icon: string; Icon: typeof Info }> = {
  error: {
    box: "border-rose-500/30 bg-rose-500/5 text-rose-900 dark:text-rose-200",
    icon: "text-rose-600 dark:text-rose-400",
    Icon: AlertCircle,
  },
  warning: {
    box: "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200",
    icon: "text-amber-600 dark:text-amber-400",
    Icon: AlertTriangle,
  },
  info: {
    box: "border-sky-500/30 bg-sky-500/5 text-sky-900 dark:text-sky-200",
    icon: "text-sky-600 dark:text-sky-400",
    Icon: Info,
  },
};

/** Advisory grading checks shown next to the score box. Never blocks saving. */
export function GradingGuardAlerts({ findings }: { findings: GuardFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="space-y-1.5" role="status" aria-live="polite">
      {findings.map((f) => {
        const { box, icon, Icon } = STYLES[f.severity];
        return (
          <div
            key={f.code + f.message}
            className={cn("flex items-start gap-2 rounded-xl border px-2.5 py-2", box)}
          >
            <Icon className={cn("size-3.5 mt-0.5 shrink-0", icon)} />
            <div className="min-w-0 space-y-0.5">
              <p className="text-[11px] font-medium leading-snug">{f.message}</p>
              {f.suggestion && (
                <p className="text-[10px] leading-snug opacity-80">{f.suggestion}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
