"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { Paperclip, Send, X, FileText } from "lucide-react";
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
  "Generate practice questions for upcoming quiz",
  "Break down algorithmic time complexity",
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
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onUploadFile?: (file: File) => Promise<{ id?: string; text?: string } | void>;
}

export const AIChatInput: React.FC<AIChatInputProps> = ({
  value: externalValue,
  onChange: externalOnChange,
  onSend,
  isGenerating = false,
  onStop,
  attachments: externalAttachments,
  setAttachments: externalSetAttachments,
  placeholders = DEFAULT_PLACEHOLDERS,
  placeholder,
  disabled = false,
  className,
  onUploadFile,
}) => {
  const [internalValue, setInternalValue] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [internalAttachments, setInternalAttachments] = useState<Attachment[]>([]);
  const [, setIsReadingFile] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const inputValue = externalValue !== undefined ? externalValue : internalValue;
  const setInputValue = (val: string) => {
    if (externalOnChange) externalOnChange(val);
    else setInternalValue(val);
  };

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
      }, 350);
    }, 3600);

    return () => clearInterval(interval);
  }, [isActive, inputValue, placeholders.length]);

  // Click outside listener
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

  const handleActivate = () => {
    setIsActive(true);
    inputRef.current?.focus();
  };

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

      // 1. If custom upload callback provided
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

  const placeholderContainerVariants = {
    initial: {},
    animate: { transition: { staggerChildren: 0.015 } },
    exit: { transition: { staggerChildren: 0.01, staggerDirection: -1 } },
  } as const;

  const letterVariants = {
    initial: { opacity: 0, filter: "blur(6px)", y: 6 },
    animate: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: {
        opacity: { duration: 0.18 },
        filter: { duration: 0.25 },
        y: { type: "spring", stiffness: 100, damping: 20 },
      },
    },
    exit: {
      opacity: 0,
      filter: "blur(6px)",
      y: -6,
      transition: {
        opacity: { duration: 0.12 },
        filter: { duration: 0.2 },
        y: { type: "spring", stiffness: 100, damping: 20 },
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

      <div
        ref={wrapperRef}
        onClick={handleActivate}
        className={cn(
          "w-full rounded-2xl sm:rounded-3xl border border-border/70 bg-card/90 dark:bg-card/95 backdrop-blur-md shadow-lg shadow-black/5 dark:shadow-black/25 overflow-hidden transition-all duration-200",
          isActive || inputValue || attachments.length > 0
            ? "border-primary/50 ring-2 ring-primary/10 shadow-xl"
            : "hover:border-border"
        )}
      >
        <div className="flex flex-col items-stretch w-full p-2 sm:p-2.5">
          {/* Attachment Previews */}
          {attachments.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 pt-1 pb-2 overflow-x-auto">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/60 border border-border/60 text-xs shrink-0 max-w-[200px]"
                >
                  <FileText className="size-3.5 text-primary shrink-0" />
                  <span className="truncate text-[11px] font-medium">{att.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveAttachment(idx);
                    }}
                    className="size-4 rounded-full flex items-center justify-center hover:bg-muted-foreground/20 text-muted-foreground transition-colors ml-0.5 shrink-0"
                    title="Remove attachment"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Main Input Row */}
          <div className="flex items-center gap-2 w-full">
            {/* Attachment Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) fileInputRef.current?.click();
              }}
              disabled={disabled}
              className="p-2 sm:p-2.5 rounded-full hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Attach study material or notes"
              type="button"
            >
              <Paperclip className="size-4" />
            </button>

            {/* Input field with dynamic animated placeholder */}
            <div className="flex-1 relative flex items-center min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={disabled ? (placeholder || "AI Assistant disabled for this workspace policy") : undefined}
                className="flex-1 border-0 outline-none py-2 px-1 text-xs sm:text-sm bg-transparent w-full font-normal text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ position: "relative", zIndex: 1 }}
                onFocus={() => {
                  if (!disabled) handleActivate();
                }}
              />
              {!disabled && (
                <div className="absolute left-0 top-0 w-full h-full pointer-events-none flex items-center px-1 py-2">
                  <AnimatePresence mode="wait">
                    {showPlaceholder && !isActive && !inputValue && (
                      <motion.span
                        key={placeholderIndex}
                        className="absolute left-1 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-xs sm:text-sm select-none pointer-events-none truncate pr-2"
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
              )}
            </div>

            {/* Stop or Send Action Button */}
            {isGenerating ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onStop) onStop();
                }}
                className="size-8 sm:size-9 rounded-full bg-foreground text-background hover:bg-foreground/85 active:scale-95 transition-all flex items-center justify-center shadow-xs shrink-0 group relative cursor-pointer"
                title="Stop generating"
                aria-label="Stop generating"
                type="button"
              >
                <span className="sr-only">Stop generating</span>
                <svg
                  className="size-3 sm:size-3.5 fill-current transition-transform duration-150 group-hover:scale-90"
                  viewBox="0 0 24 24"
                >
                  <rect x="5" y="5" width="14" height="14" rx="3" ry="3" />
                </svg>
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) handleSend();
                }}
                disabled={disabled || (!inputValue.trim() && attachments.length === 0)}
                className={cn(
                  "size-8 sm:size-9 rounded-full transition-all flex items-center justify-center font-medium shadow-xs shrink-0 active:scale-95",
                  !disabled && (inputValue.trim() || attachments.length > 0)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                    : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                )}
                title="Send message"
                aria-label="Send message"
                type="button"
              >
                <Send className="size-3.5 sm:size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
