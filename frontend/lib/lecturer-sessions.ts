/**
 * Saved conversations of the lecturer AI assistant: types and the pure logic that keeps the list
 * consistent (parsing what is in localStorage, upserting, ordering, pinning). Kept free of React
 * and of storage access so it can be unit-tested; the hook in hooks/use-lecturer-sessions.ts owns
 * the state and the persistence.
 */
import type { SourceCitation } from "@/lib/api/student-ai";

export type AIModule = "chat" | "questions" | "slides" | "rubric" | "digest";

export const VALID_MODULES: readonly AIModule[] = ["chat", "questions", "slides", "rubric", "digest"];

export const SESSIONS_STORAGE_KEY = "mindexa_lecturer_ai_sessions";
export const PINNED_STORAGE_KEY = "mindexa_lecturer_pinned_sessions";

/** One chat turn. Assistant turns also carry what grounded the answer. */
export interface ChatMessage {
  /** "model" is what the Gemini-era history used for the assistant. */
  role: "user" | "model";
  content: string;
  attachments?: any[];
  citations?: SourceCitation[];
  /** True when no course material matched and the model answered from general knowledge. */
  fallbackUsed?: boolean;
}

export interface AISession {
  id: string;
  title: string;
  module: AIModule;
  workspaceId: string | null;
  history: ChatMessage[];
  created_at: string;
}

/** Maps module names written by older versions onto the current ones. */
export function sanitizeSessionModule(rawModule: unknown): AIModule {
  if (rawModule === "assessment") return "questions";
  if (rawModule === "content") return "slides";
  if (rawModule === "analytics" || rawModule === "insights") return "digest";
  if (typeof rawModule === "string" && (VALID_MODULES as readonly string[]).includes(rawModule)) {
    return rawModule as AIModule;
  }
  return "chat";
}

/**
 * Sessions from a raw localStorage value. Anything malformed (bad JSON, not an array, entries
 * without an id or history) is dropped rather than allowed to break the page.
 */
export function parseStoredSessions(raw: string | null): AISession[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((s): s is Record<string, any> => !!s && typeof s === "object" && typeof s.id === "string")
    .map((s) => ({
      id: s.id,
      title: typeof s.title === "string" ? s.title : "Untitled session",
      module: sanitizeSessionModule(s.module),
      workspaceId: typeof s.workspaceId === "string" ? s.workspaceId : null,
      history: Array.isArray(s.history) ? s.history : [],
      created_at: typeof s.created_at === "string" ? s.created_at : new Date(0).toISOString(),
    }));
}

export function parseStoredPins(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === "string")) : new Set();
  } catch {
    return new Set();
  }
}

/** Insert a session, or replace the one with the same id while keeping its original `created_at`. */
export function upsertSession(sessions: AISession[], session: AISession): AISession[] {
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index < 0) return [session, ...sessions];
  const next = [...sessions];
  // created_at orders the list; saving a reply is not creating the session.
  next[index] = { ...session, created_at: sessions[index].created_at };
  return next;
}

export function removeSession(sessions: AISession[], id: string): AISession[] {
  return sessions.filter((s) => s.id !== id);
}

/** Pinned sessions first, then newest first. Does not mutate the input. */
export function orderSessions(sessions: AISession[], pinned: ReadonlySet<string>): AISession[] {
  return [...sessions].sort((a, b) => {
    const aPinned = pinned.has(a.id);
    const bPinned = pinned.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function togglePinned(pinned: ReadonlySet<string>, id: string): { next: Set<string>; isPinned: boolean } {
  const next = new Set(pinned);
  if (next.has(id)) {
    next.delete(id);
    return { next, isPinned: false };
  }
  next.add(id);
  return { next, isPinned: true };
}

/** Drop a deleted session's id from the pinned set, returning the same set if it wasn't pinned. */
export function unpin(pinned: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!pinned.has(id)) return pinned;
  const next = new Set(pinned);
  next.delete(id);
  return next;
}

/** Title for a new session: the explicit one, else the first user message, else a dated label. */
export function sessionTitle(history: ChatMessage[], module: AIModule, customTitle?: string, now = new Date()): string {
  return (
    customTitle ||
    history.find((m) => m.role === "user")?.content.slice(0, 36) ||
    `${module.toUpperCase()} Session (${now.toLocaleDateString()})`
  );
}
