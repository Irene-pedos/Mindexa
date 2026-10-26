"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Attachment } from "@/components/ui/ai-chat-input";
import { studentApi } from "@/lib/api/student";
import { studentAiApi, type StudentConversationSummary } from "@/lib/api/student-ai";
import { buildAttachmentPrompt, splitAttachedFiles } from "@/lib/chat-attachments";
import {
  KINYARWANDA_DISABLED_MESSAGE,
  recordTurn,
  resolveScope,
  toHistoryPayload,
  turnsToMessages,
  type ScopeCatalog,
  type TutorMessage,
} from "@/lib/tutor-chat";

interface ApiErrorLike {
  name?: string;
  status?: number;
  code?: string;
  message?: string;
}

/** `crypto.randomUUID` only exists in secure contexts, so it is not safe for a LAN dev server. */
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const asApiError = (err: unknown): ApiErrorLike =>
  typeof err === "object" && err !== null ? (err as ApiErrorLike) : { message: String(err) };

const isLanguagePolicyError = ({ code, message }: ApiErrorLike) =>
  code === "AI_BLOCKED_LANGUAGE_POLICY" ||
  code === "AI_LANGUAGE_POLICY_RESTRICTED" ||
  (message ?? "").toLowerCase().includes("kinyarwanda") ||
  (message ?? "").toLowerCase().includes("language policy");

const isExamBlockError = ({ status, code, message }: ApiErrorLike) =>
  status === 403 || code === "AI_BLOCKED_DURING_ACTIVE_ASSESSMENT" || (message ?? "").includes("during an active");

interface UseTutorChatOptions {
  catalog: ScopeCatalog;
  selectedScope: string | null;
  scopeLoading: boolean;
  /** The remembered scope matches nothing loaded; clear it. */
  onStaleScope: () => void;
  /** The selected course is Kinyarwanda: the tutor is off for it. */
  scopeIsKinyarwanda: boolean;
  /** A conversation was opened or started: show the chat tab. */
  onShowChat: () => void;
}

export type SendParams = string | { input: string; attachments?: Attachment[] };

/**
 * The student tutor conversation: messages, the saved-conversation list, sending with
 * Stop/retry, and the notices (errors, language policy, open exam) that can switch it off.
 */
export function useTutorChat({
  catalog,
  selectedScope,
  scopeLoading,
  onStaleScope,
  scopeIsKinyarwanda,
  onShowChat,
}: UseTutorChatOptions) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [conversations, setConversations] = useState<StudentConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languageBlocked, setLanguageBlocked] = useState(false);
  const [examBlockTitle, setExamBlockTitle] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Cancels the in-flight request on Stop; also marks "a request is running".
  const abortRef = useRef<AbortController | null>(null);

  // Restore the saved conversations and open the latest one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await studentAiApi.getConversations();
        if (cancelled || list.length === 0) return;
        setConversations(list);
        const latest = list[0].conversation_id;
        setCurrentConversationId(latest);
        const turns = await studentAiApi.getConversation(latest);
        if (!cancelled) setMessages(turnsToMessages(turns, splitAttachedFiles));
      } catch (err) {
        console.warn("Failed to restore tutor conversations:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const blockedByPolicy = scopeIsKinyarwanda || languageBlocked;

  /** Turn a failed API call into a notice (and the matching block, if it is a policy refusal). */
  const handleApiError = useCallback((err: unknown, fallbackMessage: string) => {
    const apiError = asApiError(err);
    const raw = apiError.message ?? "";
    const lower = raw.toLowerCase();

    if (isLanguagePolicyError(apiError)) {
      setLanguageBlocked(true);
      setError(KINYARWANDA_DISABLED_MESSAGE);
      toast.error(KINYARWANDA_DISABLED_MESSAGE);
      return;
    }

    const isNetwork =
      lower.includes("internet issue") ||
      lower.includes("timeout") ||
      lower.includes("could not reach the api") ||
      lower.includes("failed to fetch") ||
      lower.includes("networkerror");
    const isServer =
      lower.includes("internal server error") || apiError.code === "500" || apiError.code === "INTERNAL_SERVER_ERROR";

    const message = isNetwork
      ? "Internet issue: Connection to external service failed. Please check your network connection."
      : isServer
        ? "Our AI study service is temporarily unavailable. Please retry in a moment."
        : raw || fallbackMessage;

    setError(message);
    toast.error(isNetwork ? "Internet issue" : message);
  }, []);

  const send = useCallback(
    async (params: SendParams, options?: { replaceFromIndex?: number }) => {
      const rawInput = typeof params === "string" ? params : params.input || "";
      const attachmentList = typeof params === "string" ? [] : params.attachments || [];

      if (blockedByPolicy) {
        toast.error(KINYARWANDA_DISABLED_MESSAGE);
        return;
      }
      // One request at a time: a second send while one is in flight would interleave replies.
      if (abortRef.current) return;

      const question = rawInput.trim();
      if (!question && attachmentList.length === 0) return;

      let promptWithContext = question;
      if (attachmentList.length > 0) {
        const fileDetails = buildAttachmentPrompt(attachmentList);
        promptWithContext = question ? `${question}\n${fileDetails}` : fileDetails;

        // The chat input uploads a file when it is attached (it has a resourceId then); only
        // upload here for a file that somehow was not, so nothing is stored twice.
        for (const att of attachmentList) {
          if (att.file && !att.resourceId) {
            try {
              const formData = new FormData();
              formData.append("file", att.file);
              await studentApi.uploadPersonalResource(formData);
              toast.success(`Uploaded ${att.name} to personal study resources.`);
            } catch (uploadErr) {
              console.warn("Auto-upload error:", uploadErr);
            }
          }
        }
      }

      // On "Try Again" the previous exchange is replaced, not stacked below the retry.
      const prior = options?.replaceFromIndex !== undefined ? messages.slice(0, options.replaceFromIndex) : messages;
      const studentMessage: TutorMessage = {
        id: newId(),
        sender: "student",
        text: question,
        attachments: attachmentList,
        timestamp: new Date(),
      };

      setMessages([...prior, studentMessage]);
      setIsThinking(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const scope = resolveScope(selectedScope, catalog, scopeLoading);
        if (scope.stale) onStaleScope();

        const res = await studentAiApi.getSupport(
          {
            question: promptWithContext,
            source_surface: "study_tutor",
            conversation_id: currentConversationId || undefined,
            conversation_history: toHistoryPayload(prior),
            selected_resource_id: scope.selectedResourceId,
            teaching_workspace_id: scope.teachingWorkspaceId,
          },
          { signal: controller.signal }
        );

        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            sender: "ai",
            text: res.explanation,
            timestamp: new Date(),
            citations: res.citations,
            fallback_used: res.fallback_used,
          },
        ]);

        const conversationId = res.conversation_id || currentConversationId;
        if (conversationId) {
          setCurrentConversationId(conversationId);
          setConversations((prev) => recordTurn(prev, conversationId, question, new Date().toISOString()));
        }
      } catch (err) {
        const apiError = asApiError(err);
        // Stop was pressed: the request was cancelled on purpose, so it is not an error.
        if (apiError.name === "AbortError") return;
        if (isExamBlockError(apiError)) setExamBlockTitle((t) => t ?? "Active Assessment");
        if (isLanguagePolicyError(apiError)) setLanguageBlocked(true);
        handleApiError(err, "Failed to retrieve AI explanation.");
      } finally {
        // If Stop (or a new chat) already released this request, the state is not ours to touch.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsThinking(false);
        }
      }
    },
    [
      blockedByPolicy,
      messages,
      selectedScope,
      catalog,
      scopeLoading,
      onStaleScope,
      currentConversationId,
      handleApiError,
    ]
  );

  /** Stop: cancel the request, so the reply cannot land later or overlap the next question. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsThinking(false);
  }, []);

  const regenerate = useCallback(() => {
    const index = messages.map((m) => m.sender).lastIndexOf("student");
    if (index < 0) return;
    const last = messages[index];
    void send({ input: last.text, attachments: last.attachments }, { replaceFromIndex: index });
  }, [messages, send]);

  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsThinking(false);
    setCurrentConversationId(null);
    setMessages([]);
    setError(null);
    onShowChat();
  }, [onShowChat]);

  const openConversation = useCallback(
    async (conversationId: string) => {
      if (conversationId === currentConversationId) return;
      setLoadingConversation(true);
      setError(null);
      try {
        const turns = await studentAiApi.getConversation(conversationId);
        setCurrentConversationId(conversationId);
        setMessages(turnsToMessages(turns, splitAttachedFiles));
        onShowChat();
      } catch {
        toast.error("Failed to load conversation history.");
      } finally {
        setLoadingConversation(false);
      }
    },
    [currentConversationId, onShowChat]
  );

  const deleteConversation = useCallback(
    async (conversationId: string): Promise<boolean> => {
      try {
        await studentAiApi.deleteConversation(conversationId);
      } catch {
        toast.error("Failed to delete conversation.");
        return false;
      }
      setConversations((prev) => prev.filter((c) => c.conversation_id !== conversationId));
      if (currentConversationId === conversationId) startNewChat();
      toast.success("Conversation deleted.");
      return true;
    },
    [currentConversationId, startNewChat]
  );

  return {
    messages,
    conversations,
    currentConversationId,
    loadingConversation,
    isThinking,
    error,
    dismissError: () => setError(null),
    blockedByPolicy,
    examBlockTitle,
    blockForExam: (title: string) => setExamBlockTitle(title),
    attachments,
    setAttachments,
    send,
    stop,
    regenerate,
    startNewChat,
    openConversation,
    deleteConversation,
    handleApiError,
  };
}
