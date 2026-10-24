import { isBefore } from "date-fns";
import type { StudyPlan, StudySession } from "@/lib/api/study-planner";

export type SessionWithPlan = StudySession & { planTitle?: string };
export type SessionFilter = "upcoming" | "missed" | "completed" | "all";

/** Sessions that no longer take part in the schedule at all. */
const INACTIVE_STATUSES = new Set(["CANCELLED"]);

function startTime(session: StudySession): number {
  const t = new Date(session.scheduled_start).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function isSessionCompleted(session: StudySession): boolean {
  return session.status === "COMPLETED";
}

/** A session needs rescheduling when it was missed/skipped or its start time passed without it running. */
export function isSessionOverdue(session: StudySession, now: Date = new Date()): boolean {
  if (isSessionCompleted(session)) return false;
  if (session.status === "MISSED" || session.status === "SKIPPED") return true;
  if (session.status === "IN_PROGRESS") return false;
  const start = startTime(session);
  return Number.isFinite(start) && isBefore(start, now);
}

export interface CategorizedSessions {
  all: SessionWithPlan[];
  nextSession: SessionWithPlan | null;
  /** Pending sessions after `nextSession`. */
  upcoming: SessionWithPlan[];
  completed: SessionWithPlan[];
  missedOrRescheduled: SessionWithPlan[];
}

export function categorizeSessions(plans: StudyPlan[], now: Date = new Date()): CategorizedSessions {
  const all: SessionWithPlan[] = plans
    .flatMap((plan) => (plan.sessions ?? []).map((s) => ({ ...s, planTitle: plan.title })))
    .filter((s) => !INACTIVE_STATUSES.has(s.status))
    .sort((a, b) => startTime(a) - startTime(b));

  const completed: SessionWithPlan[] = [];
  const missedOrRescheduled: SessionWithPlan[] = [];
  const pending: SessionWithPlan[] = [];

  for (const session of all) {
    if (isSessionCompleted(session)) completed.push(session);
    else if (isSessionOverdue(session, now)) missedOrRescheduled.push(session);
    else pending.push(session);
  }

  return {
    all,
    nextSession: pending[0] ?? null,
    upcoming: pending.slice(1),
    completed,
    missedOrRescheduled,
  };
}

export function filterSessions(categorized: CategorizedSessions, filter: SessionFilter): SessionWithPlan[] {
  switch (filter) {
    case "upcoming":
      return categorized.nextSession
        ? [categorized.nextSession, ...categorized.upcoming]
        : categorized.upcoming;
    case "missed":
      return categorized.missedOrRescheduled;
    case "completed":
      return categorized.completed;
    default:
      return categorized.all;
  }
}

export function planProgress(plan: StudyPlan): { completed: number; total: number; percent: number } {
  const sessions = (plan.sessions ?? []).filter((s) => !INACTIVE_STATUSES.has(s.status));
  const total = sessions.length;
  const completed = sessions.filter(isSessionCompleted).length;
  return { completed, total, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

export function sessionLabel(session: Pick<StudySession, "topic" | "title">): string {
  return session.topic || session.title;
}
