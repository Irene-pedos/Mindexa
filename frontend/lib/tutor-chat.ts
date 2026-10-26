/**
 * Pure logic behind the student AI tutor chat: message shape, scope resolution, conversation
 * ordering and transcripts. Kept free of React so it can be unit tested.
 */

import type { Attachment } from "@/components/ui/ai-chat-input";
import type { LecturerMaterialResponse } from "@/lib/api/lecturer";
import type {
  SourceCitation,
  StudentChatHistoryItem,
  StudentConversationSummary,
} from "@/lib/api/student-ai";
import type { StudentCourseListItem, StudentResourceResponse } from "@/lib/api/student";

export interface TutorMessage {
  id: string;
  sender: "student" | "ai";
  text: string;
  attachments?: Attachment[];
  timestamp: Date;
  citations?: SourceCitation[];
  fallback_used?: boolean;
}

/** A course material tagged with the workspace it was loaded from. */
export type TutorMaterial = LecturerMaterialResponse & {
  workspace_id: string;
  teaching_workspace_id: string;
  course_code: string;
  course_name: string;
};

export const KINYARWANDA_DISABLED_MESSAGE =
  "AI Study Tutor is disabled for Kinyarwanda courses according to institutional academic policy.";

/**
 * Stored turns -> chat messages. The server keeps the full question, including the text of any
 * attached files, so that is split back out: the student sees what they typed plus file chips.
 * `split` is `splitAttachedFiles` from `chat-attachments` (passed in to keep this module free
 * of value imports, which the Node test runner cannot resolve through the `@/` alias).
 */
export function turnsToMessages(
  turns: StudentChatHistoryItem[],
  split: (question: string) => { text: string; fileNames: string[] }
): TutorMessage[] {
  return turns.flatMap((item) => {
    const { text, fileNames } = split(item.question);
    const created = new Date(item.created_at);
    return [
      {
        id: item.id + "-q",
        sender: "student" as const,
        text,
        attachments: fileNames.map((name) => ({
          name,
          url: "",
          contentType: "application/octet-stream",
          size: 0,
        })),
        timestamp: created,
      },
      {
        id: item.id + "-a",
        sender: "ai" as const,
        text: item.answer,
        citations: item.citations,
        timestamp: created,
      },
    ];
  });
}

export function formatHistoryDate(dateStr?: string, now: Date = new Date()): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Pinned conversations first, then most recent activity first. */
export function orderConversations(
  conversations: StudentConversationSummary[],
  pinnedIds: ReadonlySet<string>
): StudentConversationSummary[] {
  const activity = (c: StudentConversationSummary) =>
    new Date(c.last_activity_at || c.created_at).getTime();
  return [...conversations].sort((a, b) => {
    const aPinned = pinnedIds.has(a.conversation_id);
    const bPinned = pinnedIds.has(b.conversation_id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return activity(b) - activity(a);
  });
}

/** Matches the server's history limits (app/schemas/chat.py); sending more only wastes bandwidth. */
export const MAX_HISTORY_TURNS = 20;
export const MAX_TURN_CHARS = 4000;

/** The conversation so far, as the API's `conversation_history`. */
export function toHistoryPayload(messages: TutorMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => m.text.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({
      role: m.sender === "student" ? ("user" as const) : ("assistant" as const),
      content: m.text.slice(0, MAX_TURN_CHARS),
    }));
}

const PREVIEW_MAX = 80;

/** Record one more turn in a conversation, moving it to the top (or adding it). */
export function recordTurn(
  conversations: StudentConversationSummary[],
  conversationId: string,
  question: string,
  nowIso: string
): StudentConversationSummary[] {
  const existing = conversations.find((c) => c.conversation_id === conversationId);
  if (existing) {
    const updated = { ...existing, last_activity_at: nowIso, turn_count: existing.turn_count + 1 };
    return [updated, ...conversations.filter((c) => c.conversation_id !== conversationId)];
  }
  const created: StudentConversationSummary = {
    conversation_id: conversationId,
    preview:
      question.length > PREVIEW_MAX
        ? question.slice(0, PREVIEW_MAX - 3) + "..."
        : question || "New Conversation",
    created_at: nowIso,
    last_activity_at: nowIso,
    turn_count: 1,
  };
  return [created, ...conversations];
}

export interface ScopeCatalog {
  workspaces: Pick<StudentCourseListItem, "id" | "code" | "title" | "language">[];
  materials: Pick<TutorMaterial, "id" | "workspace_id" | "teaching_workspace_id" | "display_name" | "original_filename" | "course_code">[];
  personal: Pick<StudentResourceResponse, "id" | "display_name" | "original_filename">[];
}

/** Whether the selected scope (a course, or a material inside one) is a Kinyarwanda course. */
export function isScopeKinyarwanda(selectedId: string | null, catalog: ScopeCatalog): boolean {
  if (!selectedId) return false;
  const workspace = catalog.workspaces.find((w) => w.id === selectedId);
  if (workspace) return workspace.language === "RW";
  const material = catalog.materials.find((m) => m.id === selectedId);
  if (material) {
    const workspaceId = material.workspace_id || material.teaching_workspace_id;
    return catalog.workspaces.find((w) => w.id === workspaceId)?.language === "RW";
  }
  return false;
}

/** Label for the active scope pill, or null for general knowledge. */
export function scopeLabel(selectedId: string | null, catalog: ScopeCatalog): string | null {
  if (!selectedId) return null;
  const workspace = catalog.workspaces.find((w) => w.id === selectedId);
  if (workspace) return `${workspace.code || workspace.title} (Course)`;
  const personal = catalog.personal.find((r) => r.id === selectedId);
  if (personal) return personal.display_name || personal.original_filename;
  const material = catalog.materials.find((m) => m.id === selectedId);
  if (material) {
    return `${material.display_name || material.original_filename} (${material.course_code || "Material"})`;
  }
  return "Context Selected";
}

export interface ResolvedScope {
  selectedResourceId?: string;
  teachingWorkspaceId?: string;
  /** The stored selection matches nothing that was loaded, so it should be cleared. */
  stale: boolean;
}

/**
 * Turn the picker selection into the ids the API expects: a course scopes retrieval to the
 * whole workspace, a lecturer material to that file within its workspace, a personal file to
 * itself. While lists are still loading an unknown id is passed through rather than dropped.
 */
export function resolveScope(
  selectedId: string | null,
  catalog: ScopeCatalog,
  stillLoading: boolean
): ResolvedScope {
  if (!selectedId) return { stale: false };
  const workspace = catalog.workspaces.find((w) => w.id === selectedId);
  if (workspace) return { teachingWorkspaceId: workspace.id, stale: false };

  const material = catalog.materials.find((m) => m.id === selectedId);
  if (material) {
    return {
      selectedResourceId: selectedId,
      teachingWorkspaceId: material.workspace_id || material.teaching_workspace_id,
      stale: false,
    };
  }
  if (catalog.personal.some((r) => r.id === selectedId)) {
    return { selectedResourceId: selectedId, stale: false };
  }
  return stillLoading ? { selectedResourceId: selectedId, stale: false } : { stale: true };
}

const time = (d: Date, options?: Intl.DateTimeFormatOptions) => d.toLocaleTimeString([], options);

export function buildTranscriptMarkdown(messages: TutorMessage[], now: Date = new Date()): string {
  const lines = [
    "# Mindexa AI Study Tutor - Conversation Transcript",
    `*Exported on ${now.toLocaleString()}*`,
    "",
    "---",
    "",
  ];
  const hhmm: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

  for (const msg of messages) {
    if (msg.sender === "student") {
      lines.push(`### Student (${time(msg.timestamp, hhmm)})`, msg.text);
      if (msg.attachments?.length) {
        lines.push(`*Attached: ${msg.attachments.map((a) => a.name).join(", ")}*`);
      }
    } else {
      lines.push(`### AI Study Tutor (${time(msg.timestamp, hhmm)})`, msg.text);
      if (msg.citations?.length) {
        lines.push("\n**References:**");
        for (const c of msg.citations) {
          lines.push(`- ${c.resource_name}${c.page_number ? ` (p. ${c.page_number})` : ""}`);
        }
      }
    }
    lines.push("", "---", "");
  }
  return lines.join("\n");
}

export function buildTranscriptPlainText(messages: TutorMessage[], now: Date = new Date()): string {
  const lines = [
    "MINDEXA AI STUDY TUTOR - CONVERSATION TRANSCRIPT",
    `Exported: ${now.toLocaleString()}`,
    "==================================================",
    "",
  ];
  for (const msg of messages) {
    const sender = msg.sender === "student" ? "STUDENT" : "AI TUTOR";
    lines.push(`[${time(msg.timestamp)}] ${sender}:`, msg.text, "");
  }
  return lines.join("\n");
}
