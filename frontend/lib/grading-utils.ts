// frontend/lib/grading-utils.ts
// Shared utilities for grading pages and components.
// Previously these were incorrectly exported from the page component.

import { formatDistanceToNow } from "date-fns";
export {
  isQuestionAutoGraded,
  isClosedQuestionType,
  isOpenQuestionType,
  isOpenEnded,
  normalizeQuestionType,
  getQuestionTypeLabel,
  isTrueFalseType,
  isMcqType,
  isMatchingType,
  isFillBlankType,
  isOrderingType,
  isClosedChoiceType,
  CLOSED_QUESTION_TYPES,
  OPEN_QUESTION_TYPES,
} from "./grading-architecture";

/**
 * Safely formats a date string as a relative time string (e.g. "2 hours ago").
 * Returns "N/A" if the date is missing or invalid.
 */
export const formatDistanceSafe = (dateStr?: string | null): string => {
  if (!dateStr) return "N/A";
  try {
    const parsed = Date.parse(dateStr);
    if (isNaN(parsed)) return "N/A";
    return formatDistanceToNow(new Date(parsed), { addSuffix: true });
  } catch {
    return "N/A";
  }
};

/**
 * Returns Tailwind CSS class strings for GradingQueueStatus enum values
 * (PENDING, ASSIGNED, AI_SUGGESTED, IN_PROGRESS, COMPLETED, CANCELLED, FAILED).
 */
export const getGradingQueueStatusStyles = (status?: string | null): string => {
  if (!status) return "bg-amber-500/5 text-amber-600 border-amber-500/20";
  const normalized = status.trim().toUpperCase().replace(/\s+/g, "_");
  switch (normalized) {
    case "COMPLETED":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "AI_SUGGESTED":
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    case "IN_PROGRESS":
    case "ASSIGNED":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "FAILED":
    case "CANCELLED":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
    case "PENDING":
    default:
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
  }
};

/**
 * Returns Tailwind CSS class strings for GradeStatus enum values
 * (PENDING, AUTO_GRADED, AI_SUGGESTED, AWAITING_REVIEW, LECTURER_REVIEWED, FINAL, RELEASED, UNDER_APPEAL).
 */
export const getGradeStatusStyles = (status?: string | null): string => {
  if (!status) return "bg-amber-500/5 text-amber-600 border-amber-500/20";
  const normalized = status.trim().toUpperCase().replace(/\s+/g, "_");
  switch (normalized) {
    case "RELEASED":
    case "FINAL":
    case "LECTURER_REVIEWED":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "AUTO_GRADED":
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20";
    case "AI_SUGGESTED":
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    case "AWAITING_REVIEW":
    case "DRAFT":
      return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
    case "UNDER_APPEAL":
      return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
    case "PENDING":
    default:
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
  }
};

/**
 * Returns Tailwind CSS class strings for Result Release Queue statuses
 * (RELEASED, INTEGRITY_HOLD, PENDING_RELEASE, INCOMPLETE).
 */
export const getReleaseStatusStyles = (status?: string | null): string => {
  if (!status) return "bg-muted/50 text-muted-foreground border-border/40";
  const normalized = status.trim().toUpperCase().replace(/\s+/g, "_");
  switch (normalized) {
    case "RELEASED":
    case "PUBLISHED":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "INTEGRITY_HOLD":
    case "HOLD":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
    case "PENDING_RELEASE":
    case "READY":
    case "REVIEWED":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "INCOMPLETE":
    case "IN_PROGRESS":
    default:
      return "bg-muted/50 text-muted-foreground border-border/40";
  }
};

/**
 * General polymorphic status styling helper that normalizes across legacy and unified statuses.
 */
export const getStatusStyles = (status: string): string => {
  const normalized = status.toLowerCase().replace(/_/g, " ");
  if (
    normalized === "released" ||
    normalized === "finalized" ||
    normalized === "final" ||
    normalized === "completed" ||
    normalized === "lecturer reviewed"
  ) {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  }
  if (
    normalized === "pending release" ||
    normalized === "reviewed" ||
    normalized === "ready"
  ) {
    return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
  }
  if (
    normalized === "under review" ||
    normalized === "draft" ||
    normalized === "awaiting review"
  ) {
    return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
  }
  if (
    normalized === "ai suggested" ||
    normalized === "ai reviewed" ||
    normalized === "ai_suggested"
  ) {
    return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
  }
  if (normalized === "integrity hold" || normalized === "flagged") {
    return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
  }
  if (normalized === "auto graded" || normalized === "auto") {
    return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20";
  }
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
};
