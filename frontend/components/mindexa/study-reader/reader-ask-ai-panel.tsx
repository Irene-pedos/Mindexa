// frontend/components/mindexa/study-reader/reader-ask-ai-panel.tsx
"use client";

import React, { useState } from "react";
import { ReaderSource, SkimBullet } from "./types";
import { studyReaderApi, AskAIReaderResponse } from "@/lib/api/study-reader";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import {
  Sparkles,
  Send,
  Loader2,
  X,
  BookOpen,
  Hash,
  ListFilter,
  Lightbulb,
  FileQuestion,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  page?: number;
  selectedText?: string;
  citations?: Array<{
    resource_id?: string;
    source_name?: string;
    page_number?: number;
    chunk_index?: number;
    matched_text?: string;
  }>;
  createdAt: string;
}

interface ReaderAskAiPanelProps {
  source: ReaderSource;
  currentPage: number;
  selectedText: string | null;
  onClearSelectedText: () => void;
  onSelectPage: (page: number) => void;
}

export function ReaderAskAiPanel({
  source,
  currentPage,
  selectedText,
  onClearSelectedText,
  onSelectPage,
}: ReaderAskAiPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "skim">("chat");

  // Skim state
  const [skimBullets, setSkimBullets] = useState<SkimBullet[]>([]);
  const [skimSummary, setSkimSummary] = useState<string>("");
  const [loadingSkim, setLoadingSkim] = useState(false);

  const handleSend = async (customPrompt?: string) => {
    const questionText = customPrompt || input.trim();
    if (!questionText || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: questionText,
      page: currentPage,
      selectedText: selectedText || undefined,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res: AskAIReaderResponse = await studyReaderApi.askAI({
        question: questionText,
        conversation_history: history,
        selected_resource_id: source.id,
        teaching_workspace_id: source.workspaceId,
        current_page: currentPage,
        selected_text: selectedText || undefined,
      });

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: res.explanation,
        citations: res.citations || [],
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      toast.error(err.message || "Failed to reach AI Tutor");
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "I'm having trouble analyzing this material right now. Please try again in a moment.",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSkim = async () => {
    setActiveView("skim");
    if (skimBullets.length > 0) return;

    setLoadingSkim(true);
    try {
      const res = await studyReaderApi.skimDocument(source.kind, source.id);
      setSkimSummary(res.summary);
      setSkimBullets(res.bullets || []);
    } catch {
      toast.error("Failed to generate document skim");
    } finally {
      setLoadingSkim(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full select-none">
      {/* Top Switcher: Tutor Chat vs Rapid Skim */}
      <div className="p-3 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveView("chat")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
              activeView === "chat"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="size-3.5 text-primary" />
            <span>AI Tutor</span>
          </button>
          <button
            type="button"
            onClick={handleLoadSkim}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
              activeView === "skim"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListFilter className="size-3.5" />
            <span>Quick Skim</span>
          </button>
        </div>

        <Badge variant="outline" className="text-[9px] font-mono h-5 px-1.5 border-border/60">
          p. {currentPage}
        </Badge>
      </div>

      {activeView === "skim" ? (
        /* Document Skim View */
        <ScrollArea className="flex-1 p-3">
          {loadingSkim ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Extracting key concepts from document…</p>
            </div>
          ) : skimBullets.length > 0 ? (
            <div className="space-y-4 pb-6">
              {skimSummary && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-primary tracking-wider">
                    Executive Summary
                  </span>
                  <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                    {skimSummary}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground block px-1">
                  Key Takeaways ({skimBullets.length})
                </span>

                {skimBullets.map((b, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-border/50 bg-card/60 hover:bg-card transition-colors flex items-start justify-between gap-2 shadow-xs"
                  >
                    <p className="text-xs text-foreground/90 leading-relaxed flex-1">
                      {b.bullet}
                    </p>

                    {b.page_number && (
                      <button
                        type="button"
                        onClick={() => onSelectPage(b.page_number!)}
                        className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground shrink-0 flex items-center gap-0.5 transition-colors"
                        title={`Jump to Page ${b.page_number}`}
                      >
                        <Hash className="size-2.5" />
                        <span>{b.page_number}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-xs text-muted-foreground">
              <p>Click Quick Skim to extract high-impact bullets.</p>
            </div>
          )}
        </ScrollArea>
      ) : (
        /* AI Tutor Chat View */
        <>
          {/* Chat Messages */}
          <ScrollArea className="flex-1 p-3 select-text">
            {messages.length === 0 ? (
              <div className="py-10 text-center space-y-4">
                <div className="size-10 rounded-full bg-primary/10 mx-auto flex items-center justify-center border border-primary/20">
                  <Sparkles className="size-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-foreground">Ask Your AI Study Tutor</h3>
                  <p className="text-[11px] text-muted-foreground max-w-[220px] mx-auto leading-relaxed">
                    Highlight text in the reader to ask targeted questions, or choose a prompt below.
                  </p>
                </div>

                {/* Quick Prompts */}
                <div className="space-y-1.5 max-w-xs mx-auto text-left pt-2">
                  {selectedText && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSend(`Explain this excerpt in simple terms: "${selectedText}"`)}
                      className="w-full justify-start h-auto py-2 px-2.5 text-xs text-left font-medium border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 rounded-lg gap-2"
                    >
                      <Lightbulb className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate">Explain this highlighted excerpt</span>
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSend(`Summarize the core takeaways on page ${currentPage} of this document.`)}
                    className="w-full justify-start h-auto py-2 px-2.5 text-xs text-left font-medium border-border/60 hover:bg-muted/50 rounded-lg gap-2"
                  >
                    <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
                    <span>Summarize page {currentPage}</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSend("What are the most likely exam topics or test questions from this material?")}
                    className="w-full justify-start h-auto py-2 px-2.5 text-xs text-left font-medium border-border/60 hover:bg-muted/50 rounded-lg gap-2"
                  >
                    <GraduationCap className="size-3.5 shrink-0 text-muted-foreground" />
                    <span>Likely exam questions</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSend(`Create 2 study flashcards (Question & Answer) based on page ${currentPage}.`)}
                    className="w-full justify-start h-auto py-2 px-2.5 text-xs text-left font-medium border-border/60 hover:bg-muted/50 rounded-lg gap-2"
                  >
                    <FileQuestion className="size-3.5 shrink-0 text-muted-foreground" />
                    <span>Create study flashcards</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex flex-col space-y-1.5",
                      m.role === "user" ? "items-end" : "items-start"
                    )}
                  >
                    {/* Excerpt attached pill */}
                    {m.selectedText && (
                      <div className="max-w-[85%] px-2.5 py-1 rounded-lg bg-muted/60 border border-border/40 text-[10px] text-muted-foreground italic font-serif truncate">
                        &ldquo;{m.selectedText}&rdquo;
                      </div>
                    )}

                    <div
                      className={cn(
                        "rounded-2xl p-3 text-xs leading-relaxed max-w-[92%]",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground font-medium rounded-br-xs shadow-xs"
                          : "bg-muted/40 border border-border/50 text-foreground rounded-bl-xs shadow-xs"
                      )}
                    >
                      {m.role === "user" ? (
                        <p>{m.content}</p>
                      ) : (
                        <RichMessageRenderer
                          content={m.content}
                        />
                      )}
                    </div>

                    {/* Citations with page jump links */}
                    {m.citations && m.citations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 max-w-[92%]">
                        {m.citations.map((c, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => c.page_number && onSelectPage(c.page_number)}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-card border border-border/60 hover:border-primary text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 shadow-2xs"
                            title={`Jump to Page ${c.page_number || 1}`}
                          >
                            <BookOpen className="size-2.5 text-primary" />
                            <span>{c.source_name || "Source"}</span>
                            {c.page_number && (
                              <span className="font-mono text-primary font-bold">
                                p. {c.page_number}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded-2xl bg-muted/30 border border-border/40 w-fit">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    <span>Analyzing course material…</span>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Active Context Chip */}
          {selectedText && (
            <div className="px-3 py-1.5 bg-primary/10 border-t border-primary/20 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="size-3 text-primary shrink-0" />
                <span className="text-[11px] font-medium text-foreground truncate">
                  Context: &ldquo;{selectedText}&rdquo;
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 text-muted-foreground hover:text-foreground rounded"
                onClick={onClearSelectedText}
                title="Clear selection context"
              >
                <X className="size-3" />
              </Button>
            </div>
          )}

          {/* Chat Input Bar */}
          <div className="p-3 border-t border-border/40 bg-card/60 shrink-0">
            <div className="relative flex items-center">
              <Textarea
                rows={1}
                placeholder="Ask about this material… (Enter to send)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pr-10 min-h-9 max-h-24 text-xs bg-muted/40 rounded-xl resize-none py-2"
                disabled={loading}
              />
              <Button
                type="button"
                size="icon"
                disabled={!input.trim() || loading}
                onClick={() => handleSend()}
                className="absolute right-1.5 size-7 rounded-lg shadow-none"
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
