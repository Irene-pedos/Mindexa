import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns a human-readable label for an assessment type.
 *
 * Because both "Practice" mode and "Formative" mode map to the `FORMATIVE`
 * backend enum, we rely on additional context flags to distinguish them:
 *   - `integrity_monitoring_enabled === false` → Practice
 *   - `is_supervised === false && allow_resume === true` → Practice
 *   Otherwise → "Formative"
 *
 * For all other types, we just prettify the enum string.
 */
export function formatAssessmentType(
  type?: string | null,
  opts?: {
    integrity_monitoring_enabled?: boolean | null;
    is_supervised?: boolean | null;
    allow_resume?: boolean | null;
  },
): string {
  if (!type) return "—";
  const t = type.toUpperCase();

  if (t === "FORMATIVE") {
    // Practice = FORMATIVE with integrity monitoring explicitly disabled
    const isPractice = opts?.integrity_monitoring_enabled === false;
    return isPractice ? "Practice" : "Formative";
  }

  const LABELS: Record<string, string> = {
    CAT: "CAT",
    SUMMATIVE: "Summative",
    HOMEWORK: "Homework",
    GROUP_WORK: "Group Work",
    REASSESSMENT: "Reassessment",
  };

  return LABELS[t] ?? t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
