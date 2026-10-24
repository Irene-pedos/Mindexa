// lib/question-bank-ids.ts
// Questions imported from the bank get an editor id like `q-bank-<bankId>-<timestamp>` so the same
// bank question can be added to a paper twice by accident without colliding. The bank panel needs
// the original bank id to mark a question "In paper", so map it back here.

const IMPORTED = /^q-bank-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+$/i;

/** The bank id behind an editor question id (AI-accepted questions already use their bank id). */
export function bankIdOf(editorQuestionId: string): string {
  return IMPORTED.exec(editorQuestionId)?.[1] ?? editorQuestionId;
}
