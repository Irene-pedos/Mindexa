// frontend/lib/grading-utils.ts
// Shared utilities for grading pages and components.
// Previously these were incorrectly exported from the page component.

import { formatDistanceToNow } from "date-fns";

/**
 * Returns true if the question is auto-graded (closed/objective type),
 * meaning no manual lecturer review is required.
 */
export function isQuestionAutoGraded(q?: {
  type: string;
  question_type?: string;
  grading_mode?: string;
}): boolean {
  if (!q) return false;
  if (q.grading_mode) {
    return q.grading_mode.toUpperCase() === "AUTO";
  }
  const t = (q.type || q.question_type || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return [
    "mcq",
    "truefalse",
    "true_false",
    "matching",
    "fillblank",
    "fillblanks",
    "ordering",
  ].includes(t);
}

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
 * Returns Tailwind CSS class strings for a grading status badge based on the
 * normalized status string.
 */
export const getStatusStyles = (status: string): string => {
  const normalized = status.toLowerCase().replace(/_/g, " ");
  if (normalized === "released" || normalized === "finalized") {
    return "bg-emerald-500/5 text-emerald-600 border-emerald-500/20";
  }
  if (normalized === "pending release" || normalized === "reviewed") {
    return "bg-indigo-500/5 text-indigo-600 border-indigo-500/20";
  }
  if (normalized === "under review" || normalized === "draft") {
    return "bg-violet-500/5 text-violet-600 border-violet-500/20";
  }
  if (normalized === "lecturer reviewed" || normalized === "completed") {
    return "bg-emerald-500/5 text-emerald-600 border-emerald-500/20";
  }
  if (
    normalized === "ai suggested" ||
    normalized === "ai reviewed" ||
    normalized === "ai_suggested"
  ) {
    return "bg-blue-500/5 text-blue-600 border-blue-500/20";
  }
  return "bg-amber-500/5 text-amber-600 border-amber-500/20";
};
