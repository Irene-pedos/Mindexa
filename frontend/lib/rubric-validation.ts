export interface RubricLevelInput {
  label: string;
  marks: number;
}

export interface RubricCriterionInput {
  title: string;
  max_marks: number;
  levels: RubricLevelInput[];
}

/**
 * Problems that would make the server reject a rubric (or make it unusable for marking), so the
 * lecturer sees them before saving instead of as an error afterwards. The server enforces the
 * same rules; this is only the early, friendly version.
 */
export function rubricProblems(criteria: RubricCriterionInput[], targetMarks: number): string[] {
  const problems: string[] = [];
  if (criteria.length === 0) return ["Add at least one criterion."];

  criteria.forEach((criterion, index) => {
    const name = criterion.title.trim() || `Criterion #${index + 1}`;
    if (!criterion.title.trim()) problems.push(`Criterion #${index + 1} needs a name.`);
    criterion.levels.forEach((level) => {
      if (level.marks > criterion.max_marks) {
        problems.push(
          `"${name}": level "${level.label || "unnamed"}" is worth ${level.marks}, more than the criterion maximum of ${criterion.max_marks}.`,
        );
      }
    });
  });

  const total = criteria.reduce((sum, c) => sum + c.max_marks, 0);
  if (total !== targetMarks) {
    problems.push(`Criteria add up to ${total} marks, but the question is worth ${targetMarks}.`);
  }
  return problems;
}
