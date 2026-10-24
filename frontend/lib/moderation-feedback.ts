// Turns the automated pre-moderation checks that did not pass into the "What must change" text,
// so the moderator starts from what is actually missing and only adds their own words.

export interface FeedbackCheck {
  code: string;
  severity: string;
  passed: boolean;
  message: string;
}

const SECTION_LABELS: Record<string, string> = {
  STRUCTURE: "Structure",
  MARKS_TOTAL: "Marks total",
  MARKS_DISTRIBUTION: "Marks distribution",
  QUESTIONS_COMPLETE: "Incomplete questions",
};

export const FEEDBACK_HEADER = "Please fix the following before this paper can be approved:";

export function failedChecks<T extends FeedbackCheck>(items: T[]): T[] {
  return items.filter((c) => !c.passed);
}

function label(code: string): string {
  return SECTION_LABELS[code] ?? code.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Required (blocking) problems first, then advisory ones. Empty string when everything passed. */
export function buildFeedbackFromChecks(items: FeedbackCheck[]): string {
  const failed = failedChecks(items);
  if (failed.length === 0) return "";
  const ordered = [
    ...failed.filter((c) => c.severity === "BLOCKING"),
    ...failed.filter((c) => c.severity !== "BLOCKING"),
  ];
  const lines: string[] = [];
  for (const c of ordered) {
    // A check may report several problems separated by ";" — one bullet each.
    const parts = c.message
      .split(/;\s+/)
      .map((p) => p.trim().replace(/\.$/, ""))
      .filter(Boolean);
    const tag = c.severity === "BLOCKING" ? "" : " (advisory)";
    for (const p of parts) lines.push(`- [${label(c.code)}]${tag} ${p}.`);
  }
  return `${FEEDBACK_HEADER}\n${lines.join("\n")}\n\nAdditional comments from the moderator:\n`;
}

/** Keeps whatever the moderator already typed; adds the unmet checks only if they are not in there yet. */
export function mergeFeedback(current: string, items: FeedbackCheck[]): string {
  const generated = buildFeedbackFromChecks(items);
  if (!generated) return current;
  if (!current.trim()) return generated;
  if (current.includes(FEEDBACK_HEADER)) return current;
  return `${generated}${current}`;
}
