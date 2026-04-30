// frontend/lib/api/gemini.ts
//
// Typed API client for the Gemini chat endpoint.
// Mirrors the backend schemas in app/schemas/gemini.py.
//
// Usage:
//   import { geminiApi } from "@/lib/api/gemini";
//
//   const response = await geminiApi.chat({
//     message: "Explain the concept of integration by parts.",
//     system_prompt: "You are a helpful academic study assistant.",
//   });
//   console.log(response.reply);

import { apiClient } from "./client";

// ─── Request / Response types ─────────────────────────────────────────────────

export interface ChatMessage {
  /** Must be "user" or "model" */
  role: "user" | "model";
  content: string;
}

export interface GeminiChatRequest {
  /** The current user message (required, max 8000 chars) */
  message: string;
  /** Optional system-level instruction prepended to the conversation */
  system_prompt?: string;
  /** Optional prior conversation turns for multi-turn context (max 20) */
  history?: ChatMessage[];
}

export interface GeminiChatResponse {
  /** Gemini's text reply */
  reply: string;
  /** The Gemini model variant that was used */
  model: string;
  /** Why generation stopped — e.g. "STOP" or "MAX_TOKENS" */
  finish_reason: string | null;
}

// ─── API client ───────────────────────────────────────────────────────────────

export const geminiApi = {
  /**
   * Send a message to Gemini and receive a structured reply.
   *
   * Requires authentication (Bearer token is added automatically by apiClient).
   * Access is restricted by the backend to:
   *   - Lecturers / Admins: always permitted.
   *   - Students: permitted outside of active exam sessions.
   *
   * @throws Error if the network fails, the user is unauthenticated,
   *         or Gemini returns a non-2xx status.
   */
  chat: async (request: GeminiChatRequest): Promise<GeminiChatResponse> => {
    return apiClient("/gemini/chat", {
      method: "POST",
      body: JSON.stringify(request),
    });
  },
};
