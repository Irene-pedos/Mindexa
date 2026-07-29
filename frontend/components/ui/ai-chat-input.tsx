"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { Lightbulb, Mic, Globe, Paperclip, Send, Square, X, FileText } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";

export interface Attachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
  extractedText?: string;
  resourceId?: string;
  file?: File;
}

const DEFAULT_PLACEHOLDERS = [
  "Ask anything or upload study materials...",
  "Summarize key concepts from course slides",
  "Explain Database Normalization step-by-step",
  "Draft an assessment question or rubric",
  "Analyze performance trends across quizzes",
];

interface AIChatInputProps {
  value?: string;
  onChange?: (val: string) => void;
  onSend?: (params: {
    input: string;
    attachments: Attachment[];
    isThinking?: boolean;
    isDeepSearch?: boolean;
  }) => void;
  isGenerating?: boolean;
  onStop?: () => void;
  thinkActive?: boolean;
  setThinkActive?: (active: boolean | ((prev: boolean) => boolean)) => void;
  deepSearchActive?: boolean;
  setDeepSearchActive?: (active: boolean | ((prev: boolean) => boolean)) => void;
  attachments?: Attachment[];
  setAttachments?: React.Dispatch<React.SetStateAction<Attachment[]>>;
  placeholders?: string[];
  className?: string;
  onUploadFile?: (file: File) => Promise<{ id?: string; text?: string } | void>;
}

export const AIChatInput: React.FC<AIChatInputProps> = ({
  value: externalValue,
  onChange: externalOnChange,
  onSend,
  isGenerating = false,
  onStop,
  thinkActive: externalThinkActive,
  setThinkActive: externalSetThinkActive,
  deepSearchActive: externalDeepSearchActive,
  setDeepSearchActive: externalSetDeepSearchActive,
  attachments: externalAttachments,
  setAttachments: externalSetAttachments,
  placeholders = DEFAULT_PLACEHOLDERS,
  className,
  onUploadFile,
}) => {
  const [internalValue, setInternalValue] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [internalThinkActive, setInternalThinkActive] = useState(false);
  const [internalDeepSearchActive, setInternalDeepSearchActive] = useState(false);
  const [internalAttachments, setInternalAttachments] = useState<Attachment[]>([]);
  const [isReadingFile, setIsReadingFile] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputValue = externalValue !== undefined ? externalValue : internalValue;
  const setInputValue = (val: string) => {
    if (externalOnChange) externalOnChange(val);
    else setInternalValue(val);
  };

  const thinkActive = externalThinkActive !== undefined ? externalThinkActive : internalThinkActive;
  const setThinkActive = externalSetThinkActive || setInternalThinkActive;

  const deepSearchActive = externalDeepSearchActive !== undefined ? externalDeepSearchActive : internalDeepSearchActive;
  const setDeepSearchActive = externalSetDeepSearchActive || setInternalDeepSearchActive;

  const attachments = externalAttachments !== undefined ? externalAttachments : internalAttachments;
  const setAttachments = externalSetAttachments || setInternalAttachments;

  // Cycle placeholder text when input is inactive
  useEffect(() => {
    if (isActive || inputValue) return;

    const interval = setInterval(() => {
      setShowPlaceholder(false);
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
        setShowPlaceholder(true);
      }, 400);
    }, 3200);

    return () => clearInterval(interval);
  }, [isActive, inputValue, placeholders.length]);

  // Close input expansion when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        if (!inputValue && attachments.length === 0) setIsActive(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inputValue, attachments.length]);

  const handleActivate = () => setIsActive(true);

  // File Picker & Reading Handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsReadingFile(true);
    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let extractedText = "";
      let resourceId = "";

      // 1. If custom upload callback provided (e.g. backend resource upload)
      if (onUploadFile) {
        try {
          const result = await onUploadFile(file);
          if (result?.id) resourceId = result.id;
          if (result?.text) extractedText = result.text;
        } catch (err) {
          console.error("Backend file upload error:", err);
        }
      }

      // 2. Text extraction
      if (!extractedText) {
        try {
          if (
            file.type.includes("text") ||
            file.type.includes("json") ||
            file.type.includes("csv") ||
            file.name.endsWith(".txt") ||
            file.name.endsWith(".md") ||
            file.name.endsWith(".json") ||
            file.name.endsWith(".csv") ||
            file.name.endsWith(".js") ||
            file.name.endsWith(".ts") ||
            file.name.endsWith(".py")
          ) {
            extractedText = await file.text();
          } else {
            // For PDF, DOCX, and other binary documents: use backend PyMuPDF / docx text extraction endpoint
            const formData = new FormData();
            formData.append("file", file);
            const res = await apiClient("/resources/extract-text", {
              method: "POST",
              body: formData,
            });
            if (res && res.extracted_text) {
              extractedText = res.extracted_text;
            }
          }
        } catch (readErr) {
          console.warn("Document text extraction error:", readErr);
        }
      }

      newAttachments.push({
        url: URL.createObjectURL(file),
        name: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        extractedText,
        resourceId,
        file,
      });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsReadingFile(false);
    toast.success(`Attached ${files.length} file(s). Content ready for AI.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = () => {
    if ((!inputValue.trim() && attachments.length === 0) || isGenerating) return;

    if (onSend) {
      onSend({
        input: inputValue,
        attachments,
        isThinking: thinkActive,
        isDeepSearch: deepSearchActive,
      });
    }

    setInputValue("");
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const containerVariants = {
    collapsed: {
      height: attachments.length > 0 ? 104 : 68,
      boxShadow: "0 2px 8px 0 rgba(0,0,0,0.06)",
      transition: { type: "spring", stiffness: 140, damping: 20 },
    },
    expanded: {
      height: attachments.length > 0 ? 164 : 128,
      boxShadow: "0 8px 32px 0 rgba(0,0,0,0.12)",
      transition: { type: "spring", stiffness: 140, damping: 20 },
    },
  } as const;

  const placeholderContainerVariants = {
    initial: {},
    animate: { transition: { staggerChildren: 0.02 } },
    exit: { transition: { staggerChildren: 0.01, staggerDirection: -1 } },
  } as const;

  const letterVariants = {
    initial: { opacity: 0, filter: "blur(10px)", y: 8 },
    animate: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: {
        opacity: { duration: 0.2 },
        filter: { duration: 0.3 },
        y: { type: "spring", stiffness: 90, damping: 18 },
      },
    },
    exit: {
      opacity: 0,
      filter: "blur(10px)",
      y: -8,
      transition: {
        opacity: { duration: 0.15 },
        filter: { duration: 0.25 },
        y: { type: "spring", stiffness: 90, damping: 18 },
      },
    },
  } as const;

  return (
    <div className={cn("w-full flex justify-center items-center text-foreground font-sans", className)}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.png,.jpg,.jpeg,.svg,.webp"
      />

      <motion.div
        ref={wrapperRef}
        className="w-full max-w-3xl rounded-3xl border border-border/80 bg-card overflow-hidden"
        variants={containerVariants}
        animate={isActive || inputValue || attachments.length > 0 ? "expanded" : "collapsed"}
        initial="collapsed"
        onClick={handleActivate}
      >
        <div className="flex flex-col items-stretch w-full h-full p-2">
          
          {/* Attachment Previews */}
          {attachments.length > 0 && (
            <div className="flex items-center gap-2 px-3 pt-1 pb-1 overflow-x-auto">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-muted/30 text-xs text-foreground shrink-0"
                >
                  <FileText className="size-3.5 text-primary" />
                  <span className="max-w-[140px] truncate font-medium text-[11px]">{att.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveAttachment(idx);
                    }}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Row */}
          <div className="flex items-center gap-2 px-2 py-1 bg-card w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="p-2.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Attach file (PDF, Word, Excel, CSV, Images)"
              type="button"
              disabled={isReadingFile}
            >
              <Paperclip className={cn("size-4.5", isReadingFile && "animate-spin text-primary")} />
            </button>

            {/* Text Input & Animated Placeholder */}
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 border-0 outline-none py-2 px-1 text-sm bg-transparent w-full font-normal text-foreground"
                style={{ position: "relative", zIndex: 1 }}
                onFocus={handleActivate}
              />
              <div className="absolute left-0 top-0 w-full h-full pointer-events-none flex items-center px-1 py-2">
                <AnimatePresence mode="wait">
                  {showPlaceholder && !isActive && !inputValue && (
                    <motion.span
                      key={placeholderIndex}
                      className="absolute left-1 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-xs select-none pointer-events-none"
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        zIndex: 0,
                      }}
                      variants={placeholderContainerVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      {placeholders[placeholderIndex]
                        ?.split("")
                        .map((char, i) => (
                          <motion.span
                            key={i}
                            variants={letterVariants}
                            style={{ display: "inline-block" }}
                          >
                            {char === " " ? "\u00A0" : char}
                          </motion.span>
                        ))}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Stop or Send Action Button */}
            {isGenerating ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onStop) onStop();
                }}
                className="p-2.5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-xs"
                title="Stop generating"
                type="button"
              >
                <Square className="size-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSend();
                }}
                disabled={!inputValue.trim() && attachments.length === 0}
                className={cn(
                  "p-2.5 rounded-full transition-all font-medium justify-center shadow-xs",
                  inputValue.trim() || attachments.length > 0
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground/50 cursor-not-allowed"
                )}
                title="Send message"
                type="button"
              >
                <Send className="size-4" />
              </button>
            )}
          </div>

          {/* Expanded Controls Row */}
          <motion.div
            className="w-full flex justify-start px-2 items-center text-xs"
            variants={{
              hidden: {
                opacity: 0,
                y: 12,
                pointerEvents: "none" as const,
                transition: { duration: 0.2 },
              },
              visible: {
                opacity: 1,
                y: 0,
                pointerEvents: "auto" as const,
                transition: { duration: 0.25, delay: 0.05 },
              },
            }}
            initial="hidden"
            animate={isActive || inputValue || attachments.length > 0 ? "visible" : "hidden"}
            style={{ marginTop: 4 }}
          >
            <div className="flex gap-2 items-center">
              {/* Think Toggle */}
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full transition-all font-medium text-xs group border",
                  thinkActive
                    ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                    : "bg-muted/40 border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title="Enable Reasoning Mode"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setThinkActive((a) => !a);
                }}
              >
                <Lightbulb className={cn("size-3.5", thinkActive && "text-amber-500 fill-amber-400")} />
                Think
              </button>

              {/* Deep Search Toggle */}
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full transition-all font-medium text-xs border",
                  deepSearchActive
                    ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                    : "bg-muted/40 border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title="Enable Deep Context Search"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeepSearchActive((a) => !a);
                }}
              >
                <Globe className="size-3.5" />
                Deep Search
              </button>
            </div>
          </motion.div>

        </div>
      </motion.div>
    </div>
  );
};
