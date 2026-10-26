// Rule-based checks that catch likely grading mistakes while a lecturer grades.
// Pure and dependency-free so it can be unit tested and reused for batch review.
// These are advisory only: they never change or block a grade.

export type GuardSeverity = "error" | "warning" | "info";

export interface GuardFinding {
  code: string;
  severity: GuardSeverity;
  message: string;
  /** What the lecturer can do about it. */
  suggestion?: string;
}

export interface GuardRubricScore {
  score?: number;
  marks_awarded?: number;
  max?: number;
  max_score?: number;
  criterion?: string;
  criterion_title?: string;
}

export interface GuardInput {
  /** Raw text from the score box; empty means not entered yet. */
  scoreText: string;
  maxMarks: number;
  /** Student's written answer; null/undefined for file or non-text answers. */
  answerText?: string | null;
  feedback?: string | null;
  rubricScores?: GuardRubricScore[] | null;
  aiScore?: number | null;
  aiConfidence?: number | null;
}

const NO_RESPONSE = /^\s*(no written response provided)?\s*$/i;
const POSITIVE = /\b(excellent|perfect|outstanding|full marks|well done|great (job|work)|fully correct)\b/i;
const NEGATIVE = /\b(incorrect|wrong|no answer|not answered|missing|irrelevant|fails? to)\b/i;

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const fmt = (n: number) => String(Math.round(n * 100) / 100);
const rubricValue = (r: GuardRubricScore) => r.score ?? r.marks_awarded;
const rubricMax = (r: GuardRubricScore) => r.max ?? r.max_score;

/** Mirrors GET /grading/response/{id}/consistency. */
export interface GuardConsistency {
  similar_answers: {
    label: string;
    similarity: number;
    score: number;
    max_score: number;
  }[];
  bias: { samples: number; mean_diff_ratio: number } | null;
}

const NEAR_DUPLICATE = 0.9;
const INCONSISTENT_GAP = 0.25;
const DRIFT_GAP = 0.15;

const bySeverity = (a: GuardFinding, b: GuardFinding) => {
  const order: Record<GuardSeverity, number> = { error: 0, warning: 1, info: 2 };
  return order[a.severity] - order[b.severity];
};

/** Checks against how other students' answers to the same question were marked. */
export function evaluateConsistency(
  scoreText: string,
  maxMarks: number,
  consistency: GuardConsistency | null | undefined,
): GuardFinding[] {
  const findings: GuardFinding[] = [];
  if (!consistency) return findings;

  // Near-identical text is worth surfacing even before a score is entered.
  const twin = consistency.similar_answers.find((p) => p.similarity >= NEAR_DUPLICATE);
  if (twin) {
    findings.push({
      code: "NEAR_DUPLICATE_ANSWER",
      severity: "warning",
      message: `This answer is ${Math.round(twin.similarity * 100)}% identical to ${twin.label}'s.`,
      suggestion: "If it was not a group task, consider flagging both attempts for integrity review.",
    });
  }

  const score = Number(scoreText);
  if (scoreText.trim() !== "" && Number.isFinite(score) && maxMarks > 0) {
    const ratio = score / maxMarks;
    const worst = consistency.similar_answers
      .filter((p) => p.max_score > 0)
      .map((p) => ({ p, gap: Math.abs(ratio - p.score / p.max_score) }))
      .filter(({ gap }) => gap >= INCONSISTENT_GAP)
      .sort((a, b) => b.gap - a.gap)[0];
    if (worst) {
      findings.push({
        code: "SIMILAR_ANSWER_SCORED_DIFFERENTLY",
        severity: "warning",
        message: `${worst.p.label} wrote a ${Math.round(worst.p.similarity * 100)}% similar answer and got ${fmt(worst.p.score)}/${fmt(worst.p.max_score)}; you are giving ${fmt(score)}/${fmt(maxMarks)}.`,
        suggestion: "Make sure the difference is deliberate, or align the two marks.",
      });
    }
  }

  const bias = consistency.bias;
  if (bias && Math.abs(bias.mean_diff_ratio) >= DRIFT_GAP) {
    const direction = bias.mean_diff_ratio < 0 ? "lower" : "higher";
    findings.push({
      code: "GRADER_DRIFT",
      severity: "info",
      message: `Across your last ${bias.samples} finalized answers to this question you scored on average ${Math.round(Math.abs(bias.mean_diff_ratio) * 100)}% of the marks ${direction} than the AI suggested.`,
      suggestion: "Fine if the AI is miscalibrated here; otherwise re-check you are applying the rubric evenly.",
    });
  }

  return findings.sort(bySeverity);
}

export function evaluateGrade(input: GuardInput): GuardFinding[] {
  const { maxMarks, answerText, aiScore, aiConfidence } = input;
  const feedback = (input.feedback ?? "").trim();
  const findings: GuardFinding[] = [];

  if (input.scoreText.trim() === "") return findings;
  const score = Number(input.scoreText);
  if (!Number.isFinite(score)) return findings;

  const ratio = maxMarks > 0 ? score / maxMarks : 0;

  if (score < 0 || score > maxMarks) {
    findings.push({
      code: "SCORE_OUT_OF_RANGE",
      severity: "error",
      message: `${fmt(score)} is outside the allowed range 0–${fmt(maxMarks)}.`,
      suggestion: `Enter a score between 0 and ${fmt(maxMarks)}.`,
    });
    // Everything below assumes a valid score.
    return findings;
  }

  if (Math.abs(score * 100 - Math.round(score * 100)) > 1e-6) {
    findings.push({
      code: "SCORE_PRECISION",
      severity: "info",
      message: "Score has more than 2 decimal places.",
      suggestion: `Round to ${fmt(score)}.`,
    });
  }

  const hasTextAnswer = answerText !== undefined && answerText !== null;
  if (hasTextAnswer) {
    const empty = NO_RESPONSE.test(answerText);
    const words = empty ? 0 : wordCount(answerText);
    if (empty && score > 0) {
      findings.push({
        code: "MARKS_FOR_EMPTY_ANSWER",
        severity: "error",
        message: `${fmt(score)} marks given but the student wrote no answer.`,
        suggestion: "Check whether the answer is in an attached file, otherwise award 0.",
      });
    } else if (!empty && score === 0 && words >= 25) {
      findings.push({
        code: "ZERO_FOR_LONG_ANSWER",
        severity: "warning",
        message: `0 marks for a ${words}-word answer.`,
        suggestion: "Confirm nothing in the answer deserves partial credit.",
      });
    } else if (!empty && score === maxMarks && words > 0 && words <= 5 && maxMarks >= 4) {
      findings.push({
        code: "FULL_MARKS_SHORT_ANSWER",
        severity: "warning",
        message: `Full marks for a ${words}-word answer worth ${fmt(maxMarks)} marks.`,
        suggestion: "Check the answer covers everything the question asks.",
      });
    }
  }

  // Rubric consistency
  const rubric = (input.rubricScores ?? []).filter((r) => typeof rubricValue(r) === "number");
  if (rubric.length > 0) {
    const sum = rubric.reduce((acc, r) => acc + (rubricValue(r) as number), 0);
    if (Math.abs(sum - score) > 0.01) {
      findings.push({
        code: "RUBRIC_SUM_MISMATCH",
        severity: "error",
        message: `Rubric criteria add up to ${fmt(sum)} but the score is ${fmt(score)}.`,
        suggestion: `Set the score to ${fmt(sum)} or adjust the criteria.`,
      });
    }
    for (const r of rubric) {
      const max = rubricMax(r);
      if (typeof max === "number" && (rubricValue(r) as number) > max) {
        findings.push({
          code: "RUBRIC_CRITERION_OVER_MAX",
          severity: "error",
          message: `"${r.criterion_title ?? r.criterion ?? "A criterion"}" is scored ${fmt(rubricValue(r) as number)} out of ${fmt(max)}.`,
        });
      }
    }
  }

  // Deviation from the AI suggestion without any explanation
  if (typeof aiScore === "number" && maxMarks > 0) {
    const gap = Math.abs(score - aiScore) / maxMarks;
    if (gap >= 0.3) {
      const confident = typeof aiConfidence === "number" && aiConfidence >= 0.8;
      findings.push({
        code: "AI_DEVIATION",
        severity: feedback.length < 20 ? "warning" : "info",
        message: `Your score differs from the AI suggestion (${fmt(aiScore)}) by ${Math.round(gap * 100)}% of the marks${confident ? ", and the AI was confident" : ""}.`,
        suggestion:
          feedback.length < 20
            ? "Add feedback explaining the difference — it helps if the student queries this mark."
            : "Re-read the AI rationale once to be sure you did not miss something.",
      });
    }
  }

  // Feedback that contradicts the score
  if (feedback) {
    if (ratio < 0.4 && POSITIVE.test(feedback)) {
      findings.push({
        code: "FEEDBACK_TOO_POSITIVE",
        severity: "warning",
        message: `Feedback is very positive but the score is only ${fmt(score)}/${fmt(maxMarks)}.`,
        suggestion: "Check the score or reword the feedback.",
      });
    } else if (ratio >= 0.85 && NEGATIVE.test(feedback)) {
      findings.push({
        code: "FEEDBACK_TOO_NEGATIVE",
        severity: "warning",
        message: `Feedback points out problems but the score is ${fmt(score)}/${fmt(maxMarks)}.`,
        suggestion: "Check whether marks should be deducted.",
      });
    }

    for (const m of feedback.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)) {
      const [, got, outOf] = m;
      if (Number(outOf) === maxMarks && Math.abs(Number(got) - score) > 0.01) {
        findings.push({
          code: "FEEDBACK_SCORE_MISMATCH",
          severity: "error",
          message: `Feedback says ${got}/${outOf} but the score is ${fmt(score)}.`,
          suggestion: "Update the feedback or the score so they agree.",
        });
        break;
      }
    }
  } else if (ratio < 0.5) {
    findings.push({
      code: "LOW_SCORE_NO_FEEDBACK",
      severity: "info",
      message: "No feedback on a below-half score.",
      suggestion: "A short reason now saves a re-mark request later.",
    });
  }

  const order: Record<GuardSeverity, number> = { error: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
