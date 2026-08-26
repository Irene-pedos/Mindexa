"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  X,
  Bot,
  User,
  Loader2,
  BookOpen,
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
import { Badge } from "@/components/ui/badge";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { studentAiApi, SourceCitation } from "@/lib/api/student-ai";
import { toast } from "sonner";
import { SparklesIcon } from "@/components/ui/sparkles-icon";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  citations?: SourceCitation[];
  timestamp: string;
  fallbackUsed?: boolean;
}

interface AssessmentAskAiPanelProps {
  assessmentTitle: string;
  currentQuestionText?: string;
  currentSectionTitle?: string;
  teachingWorkspaceId?: string;
  selectedResourceIds?: string[];
  attemptId?: string;
  questionId?: string;
  assessmentId?: string;
}

export function AssessmentAskAiPanel({
  assessmentTitle,
  currentQuestionText,
  currentSectionTitle,
  teachingWorkspaceId,
  selectedResourceIds,
  attemptId,
  questionId,
  assessmentId,
}: AssessmentAskAiPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "ai",
      text: `Hello! I am your AI Study Tutor. Ask me any conceptual question related to **${assessmentTitle}** or your course materials! I will reference your course resources and explain underlying principles.`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!inputQuestion.trim() || isLoading) return;

    const userText = inputQuestion.trim();
    setInputQuestion("");

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsLoading(true);

    try {
      const historyPayload = newHistory
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
        }));

      const res = await studentAiApi.getSupport({
        question: userText,
        source_surface: "assessment_inline",
        conversation_history: historyPayload,
        teaching_workspace_id: teachingWorkspaceId,
        selected_resource_ids: selectedResourceIds,
        attempt_id: attemptId,
        question_id: questionId,
        assessment_id: assessmentId,
        is_in_assessment: true,
      });

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: res.explanation,
        citations: res.citations,
        fallbackUsed: res.fallback_used,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      toast.error(err?.message || "Failed to get response from AI tutor");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 rounded-full h-11 px-4 bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center gap-2"
          title="Ask AI Study Tutor"
        >
          <SparklesIcon size={18} className="text-primary-foreground" />
          <span className="text-xs font-semibold">Ask AI Tutor</span>
        </Button>
      )}

      {/* Floating Chat Drawer / Panel */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 z-50 w-[92vw] max-w-[420px] h-[540px] max-h-[82vh] border border-border/80 bg-card shadow-2xl rounded-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <CardHeader className="p-3.5 border-b border-border/60 bg-muted/40 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <SparklesIcon size={16} className="text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-xs font-bold text-foreground truncate">
                    AI Study Tutor
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className="text-[9px] border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 py-0"
                  >
                    AI Enabled
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {currentSectionTitle
                    ? `Section: ${currentSectionTitle}`
                    : assessmentTitle}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="size-7 rounded-full text-muted-foreground hover:bg-muted shrink-0"
            >
              <X className="size-4" />
            </Button>
          </CardHeader>

          {/* Current Question Context Strip if present */}
          {currentQuestionText && (
            <div className="bg-muted/20 border-b border-border/40 px-3.5 py-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              <BookOpen className="size-3 text-primary shrink-0" />
              <span className="truncate">
                Focus: {currentQuestionText.slice(0, 70)}...
              </span>
            </div>
          )}

          {/* Messages Area */}
          <CardContent
            className="flex-1 p-3.5 overflow-y-auto space-y-3.5"
            ref={scrollRef}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.sender === "ai" && (
                  <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                    <SparklesIcon size={12} className="text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground font-medium rounded-tr-none"
                      : "bg-muted/60 text-foreground border border-border/40 rounded-tl-none space-y-2"
                  }`}
                >
                  {msg.sender === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <>
                      <RichMessageRenderer content={msg.text} />
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="pt-2 border-t border-border/30 space-y-1">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                            Source References:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {msg.citations.map((c, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[9px] py-0 font-normal bg-background/80 border border-border/50 text-foreground/80 flex items-center gap-1"
                                title={c.excerpt}
                              >
                                <BookOpen className="size-2.5 text-primary" />
                                <span className="max-w-[120px] truncate">
                                  {c.resource_name}
                                </span>
                                {c.page_number && `(p. ${c.page_number})`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {msg.fallbackUsed && (
                        <p className="text-[9px] text-muted-foreground/75 italic">
                          ℹ️ Sourced from general academic knowledge base.
                        </p>
                      )}
                    </>
                  )}

                  <div
                    className={`text-[9px] mt-1 ${
                      msg.sender === "user"
                        ? "text-primary-foreground/70 text-right"
                        : "text-muted-foreground text-right"
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
                {msg.sender === "user" && (
                  <div className="size-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                    <User className="size-3" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Bot className="size-3" />
                </div>
                <div className="bg-muted/60 p-2.5 rounded-2xl rounded-tl-none border border-border/40 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin text-primary" />
                  <span>AI Tutor is researching course materials...</span>
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
                placeholder="Ask about concepts or materials..."
                className="text-xs h-9 bg-background rounded-lg"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputQuestion.trim() || isLoading}
                className="h-9 w-9 shrink-0 rounded-lg"
              >
                <Send className="size-3.5" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </>
  );
}
