"use client";

import { Calendar as CalendarIcon, Clock, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSessionRelativeTime } from "@/lib/date-utils";
import {
  isSessionCompleted,
  isSessionOverdue,
  sessionLabel,
  type CategorizedSessions,
  type SessionFilter,
  type SessionWithPlan,
} from "@/lib/study-sessions";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ id: Exclude<SessionFilter, "all">; label: string; active: string }> = [
  { id: "upcoming", label: "Upcoming", active: "border-primary bg-primary/10 text-primary" },
  {
    id: "missed",
    label: "Missed",
    active: "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  {
    id: "completed",
    label: "Completed",
    active: "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
];

function filterCount(categorized: CategorizedSessions, id: SessionFilter): number {
  if (id === "upcoming") return categorized.upcoming.length + (categorized.nextSession ? 1 : 0);
  if (id === "missed") return categorized.missedOrRescheduled.length;
  if (id === "completed") return categorized.completed.length;
  return categorized.all.length;
}

interface SessionAgendaProps {
  categorized: CategorizedSessions;
  sessions: SessionWithPlan[];
  filter: SessionFilter;
  onFilterChange: (filter: SessionFilter) => void;
  onReschedule: (session: SessionWithPlan) => void;
  onOpen: (session: SessionWithPlan) => void;
}

export function SessionAgenda({
  categorized,
  sessions,
  filter,
  onFilterChange,
  onReschedule,
  onOpen,
}: SessionAgendaProps) {
  return (
    <div className="space-y-2.5 pt-1">
      <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Clock className="size-3 text-primary" aria-hidden /> Session Agenda
        </span>

        <div className="flex items-center gap-1" role="group" aria-label="Filter sessions">
          {FILTERS.map(({ id, label, active }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => onFilterChange(id)}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-semibold border transition-all cursor-pointer",
                filter === id
                  ? cn(active, "font-bold shadow-2xs")
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {label} ({filterCount(categorized, id)})
            </button>
          ))}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-border/40 rounded-xl space-y-1 bg-muted/5">
          <p className="text-[11px] text-muted-foreground">No sessions in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} onReschedule={onReschedule} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SessionCardProps {
  session: SessionWithPlan;
  onReschedule: (session: SessionWithPlan) => void;
  onOpen: (session: SessionWithPlan) => void;
}

function SessionCard({ session, onReschedule, onOpen }: SessionCardProps) {
  const completed = isSessionCompleted(session);
  const overdue = isSessionOverdue(session);
  const hasScore = session.knowledge_check_score !== undefined && session.knowledge_check_score !== null;

  return (
    <div
      className={cn(
        "p-3 rounded-xl border bg-card shadow-2xs space-y-2 flex flex-col justify-between hover:border-primary/30 transition-all",
        completed
          ? "border-emerald-500/25 bg-emerald-500/5"
          : overdue
            ? "border-amber-500/25 bg-amber-500/5"
            : "border-border/50",
      )}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] font-semibold px-1.5 py-0",
              completed && "border-emerald-500/30 text-emerald-600 bg-emerald-500/10",
              overdue && "border-amber-500/30 text-amber-700 bg-amber-500/10",
              !completed && !overdue && "border-primary/20 text-primary bg-primary/5",
            )}
          >
            {completed ? "Completed" : overdue ? "Overdue" : "Scheduled"}
          </Badge>
          <span className="font-mono text-muted-foreground">{session.duration_minutes}m</span>
        </div>

        <div className="space-y-0.5">
          <h4 className="text-xs font-bold text-foreground truncate">{sessionLabel(session)}</h4>
          <p className="text-[10px] text-muted-foreground truncate">{session.planTitle || "Study Plan"}</p>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <CalendarIcon className="size-2.5 text-primary shrink-0" aria-hidden />
          <span>
            {session.scheduled_start ? formatSessionRelativeTime(session.scheduled_start) : "Unscheduled"}
          </span>
        </div>
      </div>

      <div className="pt-1.5 border-t border-border/30 flex items-center justify-between">
        {completed ? (
          <>
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              {hasScore ? `Score: ${Math.round(session.knowledge_check_score as number)}%` : "Reviewed"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpen(session)}
              className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Review
            </Button>
          </>
        ) : overdue ? (
          <>
            <span className="text-[9px] text-amber-700 dark:text-amber-300">Reschedule needed</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReschedule(session)}
              className="h-6 text-[10px] px-2 rounded-md border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/10 cursor-pointer"
            >
              <RotateCcw className="size-2.5 mr-1" aria-hidden /> Reschedule
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReschedule(session)}
              className="h-6 text-[10px] px-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Reschedule
            </Button>
            <Button
              size="sm"
              onClick={() => onOpen(session)}
              className="h-6 text-[10px] px-2.5 font-bold rounded-md gap-1 cursor-pointer"
            >
              <Play className="size-2 fill-current" aria-hidden /> Start
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
