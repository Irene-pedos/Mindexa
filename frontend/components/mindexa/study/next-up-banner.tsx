"use client";

import { Clock, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSessionRelativeTime } from "@/lib/date-utils";
import { sessionLabel, type SessionWithPlan } from "@/lib/study-sessions";

interface NextUpBannerProps {
  session: SessionWithPlan;
  onStart: (session: SessionWithPlan) => void;
  onReschedule: (session: SessionWithPlan) => void;
}

export function NextUpBanner({ session, onStart, onReschedule }: NextUpBannerProps) {
  return (
    <section
      aria-label="Next study session"
      className="rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-card p-3.5 shadow-2xs space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="secondary"
            className="text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground border-none px-1.5 py-0"
          >
            Up Next
          </Badge>
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
            <Clock className="size-2.5 text-primary" aria-hidden />
            {formatSessionRelativeTime(session.scheduled_start)}
          </span>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] font-semibold border-primary/30 text-primary bg-background/80 px-1.5 py-0"
        >
          {session.duration_minutes}m
        </Badge>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="space-y-0.5 min-w-0">
          <h3 className="text-xs sm:text-sm font-bold text-foreground truncate">{sessionLabel(session)}</h3>
          <p className="text-[10px] text-muted-foreground truncate">
            Plan:{" "}
            <span className="font-semibold text-foreground/80">{session.planTitle || "Active Plan"}</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReschedule(session)}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="size-2.5 mr-1" aria-hidden /> Reschedule
          </Button>
          <Button
            size="sm"
            onClick={() => onStart(session)}
            className="h-7 px-3 text-xs font-bold rounded-lg shadow-2xs gap-1 cursor-pointer"
          >
            <Play className="size-2.5 fill-current" aria-hidden /> Start Lesson
          </Button>
        </div>
      </div>
    </section>
  );
}
