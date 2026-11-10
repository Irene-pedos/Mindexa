"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  X,
  Bot,
  User,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { studyPlannerApi, SourceCitation } from "@/lib/api/study-planner";
import { toast } from "sonner";
import { SparklesIcon } from "@/components/ui/sparkles-icon";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  citations?: SourceCitation[];
  /** AI answers only: no relevant course material was found, so it is general knowledge. */
  generalKnowledge?: boolean;
  /** Student messages only: the request failed, so the tutor never received this message. */
  failed?: boolean;
  timestamp: string;
}

type HistoryItem = {
  role: string;
  content: string;
  citations?: SourceCitation[];
  fallback_used?: boolean;
  timestamp?: string;
};

interface ContextualAskAiPanelProps {
  sessionId: string;
  currentSectionTitle: string;
  currentSectionContent: string;
  initialChatHistory?: HistoryItem[] | null;
  /** Controlled by the page so only one study tool is open at a time. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatTime = (iso?: string): string =>
  (iso ? new Date(iso) : new Date()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const toChatMessages = (history: HistoryItem[]): ChatMessage[] =>
  history.map((item, idx) => ({
    id: `hist-${idx}`,
    sender: item.role === "user" ? "user" : "ai",
    text: item.content,
    citations: item.citations,
    generalKnowledge: item.role !== "user" && item.fallback_used === true,
    timestamp: formatTime(item.timestamp),
  }));

export function ContextualAskAiPanel({
  sessionId,
  currentSectionTitle,
  currentSectionContent,
  initialChatHistory,
  open,
  onOpenChange,
}: ContextualAskAiPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialChatHistory && initialChatHistory.length > 0) {
      return toChatMessages(initialChatHistory);
    }
    return [
      {
        id: "welcome",
        sender: "ai",
        text: `Hello! I am your AI Guided Study Tutor. Ask me any question about **${currentSectionTitle}** or related concepts in your study material!`,
        timestamp: formatTime(),
      },
    ];
  });
  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // If the saved history arrives after this panel mounted, swap it in, but only while the
  // student has not started a conversation yet.
  useEffect(() => {
    if (
      initialChatHistory &&
      initialChatHistory.length > 0 &&
      messages.length === 1 &&
      messages[0]?.id === "welcome"
    ) {
      setMessages(toChatMessages(initialChatHistory));
    }
  }, [initialChatHistory, messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Sends one question. A failed send keeps the message on screen but marks it "not sent"
  // (the backend only stores a question once it has been answered), so what the student sees
  // never differs silently from what the tutor was told.
  const sendMessage = async (text: string, retryId?: string) => {
    if (!text.trim() || isLoading) return;

    const userId = retryId ?? `user-${Date.now()}`;
    if (retryId) {
      setMessages((prev) => prev.map((m) => (m.id === retryId ? { ...m, failed: false } : m)));
    } else {
      setMessages((prev) => [
        ...prev,
        { id: userId, sender: "user", text, timestamp: formatTime() },
      ]);
    }
    setIsLoading(true);

    try {
      const sectionContext = `Section Title: ${currentSectionTitle}\nContent: ${currentSectionContent}`;
      const res = await studyPlannerApi.askInSession(sessionId, text, sectionContext);

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: "ai",
          text: res.answer,
          citations: res.citations,
          generalKnowledge: res.fallback_used === true,
          timestamp: formatTime(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === userId ? { ...m, failed: true } : m)));
      toast.error(err instanceof Error ? err.message : "Failed to get response from AI tutor");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    const text = inputQuestion.trim();
    if (!text || isLoading) return;
    setInputQuestion("");
    void sendMessage(text);
  };

  const removeMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  if (!open) return null;

  return (
    <Card
      role="dialog"
      aria-label="AI Study Tutor"
      className="fixed bottom-[4.5rem] right-4 sm:bottom-[5.5rem] sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-[400px] h-[520px] max-h-[calc(100dvh-7rem)] border border-border/60 bg-card shadow-lg rounded-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      {/* Header */}
      <CardHeader className="p-4 border-b border-border/60 bg-muted/30 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <SparklesIcon size={16} className="text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-xs font-bold text-foreground">AI Study Tutor</CardTitle>
            <p className="text-[11px] text-muted-foreground truncate">
              Context: {currentSectionTitle}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close AI Tutor panel"
          onClick={() => onOpenChange(false)}
          className="size-7 rounded-full text-muted-foreground hover:bg-muted cursor-pointer"
        >
          <X className="size-4" />
        </Button>
      </CardHeader>

      {/* Messages Area */}
      <CardContent className="flex-1 p-4 overflow-y-auto space-y-4" ref={scrollRef}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.sender === "ai" && (
              <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                <SparklesIcon size={14} className="text-primary" />
              </div>
            )}
            <div className="max-w-[82%] space-y-1">
              <div
                className={`rounded-2xl p-3 text-xs leading-relaxed ${
                  msg.sender === "user"
                    ? msg.failed
                      ? "bg-destructive/10 text-foreground border border-destructive/40 rounded-tr-none font-medium"
                      : "bg-primary text-primary-foreground font-medium rounded-tr-none"
                    : "bg-muted/60 text-foreground border border-border/40 rounded-tl-none space-y-2"
                }`}
              >
                {msg.sender === "user" ? (
                  <p>{msg.text}</p>
                ) : (
                  <RichMessageRenderer content={msg.text} citations={msg.citations} />
                )}

                <div
                  className={`text-[10px] mt-1 ${
                    msg.sender === "user"
                      ? msg.failed
                        ? "text-muted-foreground text-right"
                        : "text-primary-foreground/70 text-right"
                      : "text-muted-foreground"
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === "ai" && msg.generalKnowledge && (
                <p className="flex items-start gap-1 text-[10px] text-muted-foreground leading-snug">
                  <Info className="size-3 shrink-0 mt-px" />
                  Nothing relevant was found in your course materials, so this answer is general
                  knowledge. Check it against your notes.
                </p>
              )}

              {msg.sender === "user" && msg.failed && (
                <div role="alert" className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[11px] text-destructive">
                  <span className="flex items-center gap-1 font-semibold">
                    <AlertCircle className="size-3" /> Not sent
                  </span>
                  <button
                    type="button"
                    onClick={() => void sendMessage(msg.text, msg.id)}
                    disabled={isLoading}
                    className="underline hover:no-underline font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMessage(msg.id)}
                    disabled={isLoading}
                    className="underline hover:no-underline text-muted-foreground disabled:opacity-50 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            {msg.sender === "user" && (
              <div className="size-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                <User className="size-3.5" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2.5 justify-start items-center">
            <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Bot className="size-3.5" />
            </div>
            <div className="bg-muted/60 p-3 rounded-2xl rounded-tl-none border border-border/40 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>AI Tutor is reasoning with section context...</span>
            </div>
          </div>
        )}
      </CardContent>

      {/* Footer Input */}
      <CardFooter className="p-3 border-t border-border/60 bg-muted/20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex w-full items-center gap-2"
        >
          <Input
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            placeholder="Ask about this section..."
            aria-label="Ask the AI tutor a question"
            className="text-xs h-9 bg-background"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send question"
            disabled={!inputQuestion.trim() || isLoading}
            className="h-9 w-9 shrink-0"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
