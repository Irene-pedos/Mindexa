"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { studentAiApi, type SourceCitation, type StudentSupportRequest } from "@/lib/api/student-ai";
import { errorMessage } from "@/lib/error-message";

export type ThreadMessage<TExtra extends object = object> = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: SourceCitation[];
  /** The answer came from general knowledge, not the course material. */
  fallbackUsed?: boolean;
  createdAt: string;
} & TExtra;

interface Options<TExtra extends object> {
  /** Shown before the first question; never sent to the server as history. */
  initialMessages?: ThreadMessage<TExtra>[];
  /** How many of the latest turns to send as context. The server accepts at most 20. */
  maxHistoryTurns?: number;
}

interface SendArgs<TExtra extends object> {
  question: string;
  /** Everything about the request except the question and the history. */
  request: Omit<StudentSupportRequest, "question" | "conversation_history">;
  /** Extra fields stored on the user's message (a page number, a selected excerpt...). */
  userExtra?: TExtra;
  /** If set, a failed request adds this as an assistant message as well as a toast. */
  failureReply?: string;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * A short question-and-answer thread with the study tutor, used by the small embedded panels
 * (reader, assessment). One request at a time, history trimmed to the last few turns, and the
 * request is cancelled if the panel closes mid-answer.
 */
export function useSupportThread<TExtra extends object = object>({
  initialMessages = [],
  maxHistoryTurns = 10,
}: Options<TExtra> = {}) {
  const [messages, setMessages] = useState<ThreadMessage<TExtra>[]>(initialMessages);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const initialIds = useRef(new Set(initialMessages.map((m) => m.id)));

  // Never leave a request running after the panel is gone.
  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const send = useCallback(
    async ({ question, request, userExtra, failureReply }: SendArgs<TExtra>) => {
      const text = question.trim();
      if (!text || abortRef.current) return;

      const userMessage = {
        id: nextId("user"),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        ...(userExtra ?? {}),
      } as ThreadMessage<TExtra>;

      const history = messages
        .filter((m) => !initialIds.current.has(m.id))
        .slice(-maxHistoryTurns)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await studentAiApi.getSupport(
          { ...request, question: text, conversation_history: history },
          { signal: controller.signal }
        );
        setMessages((prev) => [
          ...prev,
          {
            id: nextId("ai"),
            role: "assistant",
            content: res.explanation,
            citations: res.citations ?? [],
            fallbackUsed: res.fallback_used,
            createdAt: new Date().toISOString(),
          } as ThreadMessage<TExtra>,
        ]);
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
        toast.error(errorMessage(err, "Failed to get a response from the AI tutor."));
        if (failureReply) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId("err"),
              role: "assistant",
              content: failureReply,
              createdAt: new Date().toISOString(),
            } as ThreadMessage<TExtra>,
          ]);
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [messages, maxHistoryTurns]
  );

  return { messages, loading, send, stop };
}
