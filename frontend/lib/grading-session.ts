// Local persistence that lets a lecturer pick grading back up after an
// unexpected refresh, a closed tab or a dropped connection.
//
//  - Draft backups: what is typed in the score/feedback boxes is written here on
//    every change, before the network is involved. It is removed once the same
//    values are saved on the server.
//  - Resume point: where the lecturer was (assessment, class, student, question).
//
// Storage is injected so this stays pure and testable. Every access is wrapped:
// storage can throw or be unavailable (private windows, blocked site data).

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface GradeDraft {
  score: string;
  feedback: string;
  rubricScores: unknown[];
  savedAt: number;
}

export interface ResumePoint {
  assessmentId: string;
  assessmentTitle: string;
  classId: string | null;
  className: string | null;
  attemptId: string | null;
  studentName: string | null;
  questionId: string | null;
  questionNumber: number | null;
  updatedAt: number;
}

const DRAFT_PREFIX = "mindexa.grading.draft.v1:";
const RESUME_KEY = "mindexa.grading.resume.v1";
// Backups older than this are ignored so stale work never overrides newer grading.
const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function writeDraft(storage: StorageLike, submissionId: string, draft: GradeDraft): void {
  safe(() => storage.setItem(DRAFT_PREFIX + submissionId, JSON.stringify(draft)), undefined);
}

export function readDraft(
  storage: StorageLike,
  submissionId: string,
  now: number = Date.now(),
): GradeDraft | null {
  return safe(() => {
    const raw = storage.getItem(DRAFT_PREFIX + submissionId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GradeDraft>;
    if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      storage.removeItem(DRAFT_PREFIX + submissionId);
      return null;
    }
    return {
      score: typeof parsed.score === "string" ? parsed.score : "",
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
      rubricScores: Array.isArray(parsed.rubricScores) ? parsed.rubricScores : [],
      savedAt: parsed.savedAt,
    };
  }, null);
}

export function clearDraft(storage: StorageLike, submissionId: string): void {
  safe(() => storage.removeItem(DRAFT_PREFIX + submissionId), undefined);
}

/**
 * Clear the backup only if it still matches what was just saved. If the lecturer
 * kept typing while the save was in flight, the newer text must survive.
 */
export function clearDraftIfSaved(
  storage: StorageLike,
  submissionId: string,
  saved: { score: string; feedback: string },
): void {
  const current = readDraft(storage, submissionId);
  if (!current) return;
  if (current.score.trim() === saved.score.trim() && current.feedback === saved.feedback) {
    clearDraft(storage, submissionId);
  }
}

/** Whether a stored backup holds work the server copy does not. */
export function draftDiffers(
  draft: GradeDraft,
  server: { score: string; feedback: string },
): boolean {
  return draft.score.trim() !== server.score.trim() || draft.feedback !== server.feedback;
}

export function listDraftIds(storage: StorageLike): string[] {
  return safe(() => {
    const ids: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(DRAFT_PREFIX)) ids.push(key.slice(DRAFT_PREFIX.length));
    }
    return ids;
  }, []);
}

export function writeResumePoint(storage: StorageLike, point: ResumePoint): void {
  safe(() => storage.setItem(RESUME_KEY, JSON.stringify(point)), undefined);
}

export function readResumePoint(storage: StorageLike): ResumePoint | null {
  return safe(() => {
    const raw = storage.getItem(RESUME_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ResumePoint>;
    if (typeof p.assessmentId !== "string" || typeof p.updatedAt !== "number") return null;
    return {
      assessmentId: p.assessmentId,
      assessmentTitle: p.assessmentTitle ?? "Assessment",
      classId: p.classId ?? null,
      className: p.className ?? null,
      attemptId: p.attemptId ?? null,
      studentName: p.studentName ?? null,
      questionId: p.questionId ?? null,
      questionNumber: p.questionNumber ?? null,
      updatedAt: p.updatedAt,
    };
  }, null);
}

export function clearResumePoint(storage: StorageLike): void {
  safe(() => storage.removeItem(RESUME_KEY), undefined);
}

/** URL query that reopens the exact spot (keeps deep links shareable and refresh-safe). */
export function resumeSearchParams(point: {
  assessmentId: string;
  classId?: string | null;
  attemptId?: string | null;
  questionId?: string | null;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("assessment", point.assessmentId);
  if (point.classId) params.set("class", point.classId);
  if (point.attemptId) params.set("attempt", point.attemptId);
  if (point.questionId) params.set("question", point.questionId);
  return params;
}

/** True when a network failure (offline, DNS, dropped connection) rather than a server answer. */
export function isNetworkFailure(err: unknown, online: boolean): boolean {
  if (!online) return true;
  if (err instanceof TypeError) return true; // fetch rejects with TypeError on network errors
  const message = err instanceof Error ? err.message.toLowerCase() : "";
  return /failed to fetch|network ?error|load failed|networkerror|timed? ?out|econn/.test(message);
}

// ── Per-user scoping ─────────────────────────────────────────────────────────
// localStorage belongs to the browser, not the person. On a shared computer one
// lecturer must never see another's resume point or restored drafts, so every key
// is namespaced by user id. Without an id nothing is persisted at all.

const SCOPE_PREFIX = "u:";
const LEGACY_PREFIX = "mindexa.grading.";

/** A view of `storage` where every key lives under this user's namespace. */
export function scopedStorage(storage: StorageLike, userId: string): StorageLike {
  const prefix = `${SCOPE_PREFIX}${userId}:`;
  const ownKeys = (): string[] => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  };
  return {
    getItem: (key) => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    removeItem: (key) => storage.removeItem(prefix + key),
    key: (index) => {
      const full = ownKeys()[index];
      return full === undefined ? null : full.slice(prefix.length);
    },
    get length() {
      return ownKeys().length;
    },
  };
}

/**
 * Remove grading data saved before keys were user-scoped. It cannot be attributed
 * to anyone, so it is dropped rather than shown to whoever opens the page next.
 */
export function purgeLegacyGradingData(storage: StorageLike): void {
  safe(() => {
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) stale.push(key);
    }
    stale.forEach((key) => storage.removeItem(key));
  }, undefined);
}
