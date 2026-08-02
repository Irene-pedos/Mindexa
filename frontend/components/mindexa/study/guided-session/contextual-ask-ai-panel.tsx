"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Sparkles,
  X,
  Bot,
  User,
  Loader2,
  FileText,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import { studyPlannerApi, SourceCitation } from "@/lib/api/study-planner";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  citations?: SourceCitation[];
  timestamp: string;
}

interface ContextualAskAiPanelProps {
  sessionId: string;
  currentSectionTitle: string;
  currentSectionContent: string;
  initialChatHistory?: Array<{
    role: string;
    content: string;
    citations?: SourceCitation[];
    timestamp?: string;
  }> | null;
}

export function ContextualAskAiPanel({
  sessionId,
  currentSectionTitle,
  currentSectionContent,
  initialChatHistory,
}: ContextualAskAiPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialChatHistory && initialChatHistory.length > 0) {
      return initialChatHistory.map((item, idx) => ({
        id: `hist-${idx}`,
        sender: item.role === "user" ? "user" : "ai",
        text: item.content,
        citations: item.citations,
        timestamp: item.timestamp
          ? new Date(item.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
      }));
    }
    return [
      {
        id: "welcome",
        sender: "ai",
        text: `Hello! I am your AI Guided Study Tutor. Ask me any question about **${currentSectionTitle}** or related concepts in your study material!`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ];
  });
  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      initialChatHistory &&
      initialChatHistory.length > 0 &&
      messages.length === 1 &&
      messages[0]?.id === "welcome"
    ) {
      const formatted = initialChatHistory.map((item, idx) => ({
        id: `hist-${idx}`,
        sender: (item.role === "user" ? "user" : "ai") as "user" | "ai",
        text: item.content,
        citations: item.citations,
        timestamp: item.timestamp
          ? new Date(item.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
      }));
      setMessages(formatted);
    }
  }, [initialChatHistory, messages.length, messages]);

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

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const sectionContext = `Section Title: ${currentSectionTitle}\nContent: ${currentSectionContent}`;
      const res = await studyPlannerApi.askInSession(
        sessionId,
        userText,
        sectionContext,
      );

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: res.answer,
        citations: res.citations,
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
          className="fixed bottom-6 right-6 z-50 rounded-full h-12 px-5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 text-primary-foreground shadow-xl flex items-center gap-2.5 transition-all duration-300 transform hover:scale-105"
        >
          <Sparkles className="size-5" />
          <span className="font-semibold text-xs">Ask AI Tutor</span>
          <Badge
            variant="secondary"
            className="bg-white/20 text-white text-[10px] px-1.5 py-0.2"
          >
            Contextual
          </Badge>
        </Button>
      )}

      {/* Floating Chat Drawer / Panel */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 z-50 w-[90vw] max-w-[420px] h-[580px] max-h-[80vh] border-border/80 bg-background/95 backdrop-blur-lg shadow-2xl rounded-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <CardHeader className="p-4 border-b border-border/60 bg-muted/30 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Bot className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-xs font-bold text-foreground">
                    AI Study Tutor
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  >
                    Live Session
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                  Context: {currentSectionTitle}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="size-7 rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </Button>
          </CardHeader>

          {/* Messages Area */}
          <CardContent
            className="flex-1 p-4 overflow-y-auto space-y-4"
            ref={scrollRef}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.sender === "ai" && (
                  <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
                    <Bot className="size-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl p-3 text-xs leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground font-medium rounded-tr-none"
                      : "bg-muted/60 text-foreground border border-border/40 rounded-tl-none space-y-2"
                  }`}
                >
                  {msg.sender === "user" ? (
                    <p>{msg.text}</p>
                  ) : (
                    <RichMessageRenderer content={msg.text} />
                  )}

                  {msg.citations && msg.citations.length > 0 && (
                    <div className="pt-2 border-t border-border/40 space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                        <FileText className="size-3 text-primary" /> Sources
                      </span>
                      {msg.citations.map((c, i) => (
                        <div
                          key={i}
                          className="text-[10px] text-muted-foreground bg-background/50 p-1.5 rounded border border-border/30"
                        >
                          <span className="font-medium">
                            {c.resource_name || c.title || "Source"}
                          </span>
                          {c.page_number ? ` (p. ${c.page_number})` : ""}
                          {c.excerpt || c.snippet
                            ? `: ${c.excerpt || c.snippet}`
                            : ""}
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={`text-[9px] mt-1 ${
                      msg.sender === "user"
                        ? "text-primary-foreground/70 text-right"
                        : "text-muted-foreground"
                    }`}
                  >
                    {msg.timestamp}
                  </div>
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
                className="text-xs h-9 bg-background"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!inputQuestion.trim() || isLoading}
                className="h-9 w-9 shrink-0"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </>
  );
}
