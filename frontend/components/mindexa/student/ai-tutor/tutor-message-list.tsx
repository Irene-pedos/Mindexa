"use client";

import { useState } from "react";
import { Check, ChevronRight, Copy, Edit2, FileText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { RichMessageRenderer } from "@/components/mindexa/common/rich-message-renderer";
import type { TutorMessage } from "@/lib/tutor-chat";

const COLLAPSED_CITATIONS = 2;

interface TutorMessageListProps {
  messages: TutorMessage[];
  isThinking: boolean;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onEditMessage: (text: string) => void;
  onRegenerate: () => void;
}

const iconButton =
  "rounded p-1 text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function Citations({ message }: { message: TutorMessage }) {
  const [expanded, setExpanded] = useState(false);
  const citations = message.citations ?? [];
  if (citations.length === 0) return null;

  const hidden = citations.length - COLLAPSED_CITATIONS;
  const visible = expanded ? citations : citations.slice(0, COLLAPSED_CITATIONS);

  return (
    <div className="space-y-1.5 border-t border-border/40 pt-2">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="size-3 text-primary" />
          References ({citations.length})
        </span>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-center gap-0.5 text-[10px] font-semibold normal-case text-primary hover:underline"
          >
            {expanded ? (
              "Show less"
            ) : (
              <>
                <span>+{hidden} more</span>
                <ChevronRight className="size-3 rotate-90" />
              </>
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {visible.map((c, index) => (
          <div key={`${c.resource_id}-${c.chunk_index}-${index}`} className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-2 text-[10px]">
            <div className="truncate font-semibold text-foreground">
              {c.resource_name}
              {c.page_number ? ` (p. ${c.page_number})` : ""}
            </div>
            {c.excerpt && <div className="line-clamp-2 italic text-muted-foreground">&ldquo;{c.excerpt}&rdquo;</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The scrolling conversation: student bubbles, AI answers with references, and the thinking marker. */
export function TutorMessageList({
  messages,
  isThinking,
  copiedId,
  onCopy,
  onEditMessage,
  onRegenerate,
}: TutorMessageListProps) {
  return (
    <MessageScroller className="h-full">
      <MessageScrollerViewport className="scroll-fade">
        <MessageScrollerContent
          aria-busy={isThinking}
          className="mx-auto max-w-4xl space-y-4 px-3 py-4 pb-36 sm:px-6 md:px-8 lg:max-w-5xl 2xl:max-w-6xl"
        >
          {messages.map((msg, index) => {
            const isLatestUserTurn =
              msg.sender === "student" && (index === messages.length - 1 || index === messages.length - 2);

            return (
              <MessageScrollerItem key={msg.id} scrollAnchor={isLatestUserTurn} className="w-full">
                {msg.sender === "student" ? (
                  <div className="group ml-auto flex max-w-[85%] flex-col items-end space-y-1 sm:max-w-[80%]">
                    <div className="rounded-2xl rounded-tr-xs bg-primary px-4 py-2.5 text-xs font-medium leading-relaxed text-primary-foreground shadow-2xs sm:text-sm">
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pb-1.5">
                          {msg.attachments.map((att, attIndex) => (
                            <div
                              key={`${att.name}-${attIndex}`}
                              className="flex items-center gap-1.5 rounded-lg border border-primary-foreground/30 bg-primary-foreground/15 px-2 py-0.5 text-[11px] font-medium text-primary-foreground"
                            >
                              <FileText className="size-3 shrink-0" />
                              <span className="max-w-[160px] truncate">{att.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                    </div>

                    <div className="flex items-center gap-1 pr-1 text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => onCopy(msg.text, `copy-${msg.id}`)}
                        className={iconButton}
                        aria-label="Copy prompt"
                        title="Copy prompt"
                      >
                        {copiedId === `copy-${msg.id}` ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditMessage(msg.text)}
                        className={iconButton}
                        aria-label="Edit prompt in composer"
                        title="Edit prompt in composer"
                      >
                        <Edit2 className="size-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="group relative mr-auto flex max-w-[95%] flex-col space-y-2 whitespace-pre-wrap rounded-2xl rounded-tl-xs border border-border bg-card p-4 text-left leading-relaxed text-foreground shadow-2xs animate-in fade-in slide-in-from-bottom-2 duration-300 sm:max-w-[90%]">
                    <RichMessageRenderer content={msg.text} />
                    <Citations message={msg} />

                    <div className="flex items-center justify-between border-t border-border/30 pt-1.5 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCopy(msg.text, `ai-copy-${msg.id}`)}
                          className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          {copiedId === `ai-copy-${msg.id}` ? (
                            <>
                              <Check className="size-3 text-emerald-500" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </Button>
                        {index === messages.length - 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onRegenerate}
                            className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                            title="Regenerate this explanation"
                          >
                            <RotateCcw className="size-3" />
                            <span>Try Again</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </MessageScrollerItem>
            );
          })}

          {isThinking && (
            <div className="mr-auto max-w-[95%] py-2 sm:max-w-[90%]">
              <Marker role="status" className="rounded-2xl border border-border bg-card p-3 shadow-2xs">
                <MarkerIcon>
                  <Spinner />
                </MarkerIcon>
                <MarkerContent className="shimmer text-xs font-medium">
                  Study AI is formulating a tailored academic explanation...
                </MarkerContent>
              </Marker>
            </div>
          )}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton className="bottom-24 right-4 sm:bottom-28 sm:right-6 md:right-8" />
    </MessageScroller>
  );
}
