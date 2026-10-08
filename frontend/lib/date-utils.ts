// frontend/lib/date-utils.ts
import { format, parseISO, isToday, isTomorrow, formatDistanceToNow } from "date-fns";

/**
 * Formats a duration in seconds into a human-friendly string (e.g., "5m 30s", "45s").
 */
export function formatDurationSeconds(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/**
 * Formats an attempt or submission duration with fallback strategies.
 * Guarantees a meaningful duration string rather than raw seconds or undefined.
 */
export function formatAttemptDuration(
  attempt?: {
    time_taken_seconds?: number | null;
    started_at?: string | null;
    submitted_at?: string | null;
    duration_minutes?: number | null;
    [key: string]: any;
  } | null,
  submission?: {
    time_spent_seconds?: number | null;
    [key: string]: any;
  } | null,
): string {
  if (attempt?.time_taken_seconds && attempt.time_taken_seconds > 0) {
    return formatDurationSeconds(attempt.time_taken_seconds);
  }
  if (attempt?.started_at && attempt?.submitted_at) {
    const start = new Date(attempt.started_at).getTime();
    const end = new Date(attempt.submitted_at).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      const diffSecs = Math.floor((end - start) / 1000);
      return formatDurationSeconds(diffSecs);
    }
  }
  if (submission?.time_spent_seconds && submission.time_spent_seconds > 0) {
    return formatDurationSeconds(submission.time_spent_seconds);
  }
  if (attempt?.duration_minutes && attempt.duration_minutes > 0) {
    return `${attempt.duration_minutes}m`;
  }
  return "Standard session";
}

/**
 * Formats a study planner session timestamp into relative terms (e.g. "Today at 14:00", "Tomorrow at 09:30", "Mon, Sep 15 · 10:00").
 */
export function formatSessionRelativeTime(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    if (isToday(d)) {
      return `Today at ${format(d, "HH:mm")}`;
    }
    if (isTomorrow(d)) {
      return `Tomorrow at ${format(d, "HH:mm")}`;
    }
    return format(d, "EEE, MMM d · HH:mm");
  } catch {
    return dateStr;
  }
}

/**
 * Safely parses and formats a date string as relative to now (e.g. "2 hours ago").
 */
export function formatDistanceSafe(dateStr?: string | null): string {
  if (!dateStr) return "N/A";
  try {
    const parsed = Date.parse(dateStr);
    if (isNaN(parsed)) return "N/A";
    return formatDistanceToNow(new Date(parsed), { addSuffix: true });
  } catch {
    return "N/A";
  }
}
