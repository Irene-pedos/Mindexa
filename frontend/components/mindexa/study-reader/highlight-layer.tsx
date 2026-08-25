// frontend/components/mindexa/study-reader/highlight-layer.tsx
"use client";

import React, { useState } from "react";
import { AnnotationColor, StudentAnnotation } from "./types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Check, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface HighlightLayerProps {
  pageNumber: number;
  annotations: StudentAnnotation[];
  pageWidth: number;
  pageHeight: number;
  onUpdateAnnotation: (
    id: string,
    updates: { color?: AnnotationColor; note_text?: string },
  ) => void;
  onDeleteAnnotation: (id: string) => void;
}

const COLOR_MAP: Record<
  AnnotationColor,
  { bg: string; border: string; label: string; dot: string }
> = {
  key_idea: {
    bg: "bg-amber-300/45 dark:bg-amber-400/40",
    border: "border-b-2 border-amber-500/60",
    label: "Key Idea",
    dot: "bg-amber-400",
  },
  definition: {
    bg: "bg-sky-300/45 dark:bg-sky-400/40",
    border: "border-b-2 border-sky-500/60",
    label: "Definition",
    dot: "bg-sky-400",
  },
  example: {
    bg: "bg-emerald-300/45 dark:bg-emerald-400/40",
    border: "border-b-2 border-emerald-500/60",
    label: "Example",
    dot: "bg-emerald-400",
  },
  confused: {
    bg: "bg-rose-300/45 dark:bg-rose-400/40",
    border: "border-b-2 border-rose-500/60",
    label: "Confused",
    dot: "bg-rose-400",
  },
};

export function HighlightLayer({
  pageNumber,
  annotations,
  pageWidth,
  pageHeight,
  onUpdateAnnotation,
  onDeleteAnnotation,
}: HighlightLayerProps) {
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(
    null,
  );
  const [editingNote, setEditingNote] = useState<string>("");

  const pageAnnotations = annotations.filter(
    (a) => a.page_number === pageNumber,
  );

  if (pageAnnotations.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden select-none">
      {pageAnnotations.map((ann) => {
        const colorConfig = COLOR_MAP[ann.color] || COLOR_MAP.key_idea;

        return (
          <React.Fragment key={ann.id}>
            {ann.rects.map((rect, idx) => {
              // Convert normalized 0..1 coordinates to pixels
              const left = rect.x * pageWidth;
              const top = rect.y * pageHeight;
              const width = rect.w * pageWidth;
              const height = rect.h * pageHeight;

              // Only render the interactive popover trigger on the first rect
              const isFirstRect = idx === 0;

              return (
                <div
                  key={`${ann.id}-rect-${idx}`}
                  style={{
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${width}px`,
                    height: `${height}px`,
                  }}
                  className={cn(
                    "absolute pointer-events-auto cursor-pointer rounded-xs transition-colors mix-blend-multiply dark:mix-blend-screen",
                    colorConfig.bg,
                    colorConfig.border,
                    "hover:opacity-90",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveAnnotationId(ann.id);
                    setEditingNote(ann.note_text || "");
                  }}
                >
                  {/* Note marker badge */}
                  {ann.note_text && isFirstRect && (
                    <div className="absolute -top-2 -right-2 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                      <MessageSquare className="size-2.5" />
                    </div>
                  )}

                  {isFirstRect && (
                    <Popover
                      open={activeAnnotationId === ann.id}
                      onOpenChange={(open) => {
                        if (!open) {
                          setActiveAnnotationId(null);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Open ${colorConfig.label.toLowerCase()} highlight note`}
                          className="size-full cursor-pointer bg-transparent"
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-72 p-3 bg-card/95 backdrop-blur-md shadow-2xl border border-border/70 rounded-xl space-y-3"
                        align="start"
                        side="top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Quote snippet */}
                        <div className="border-l-2 border-primary/50 pl-2 py-0.5">
                          <p className="text-[11px] text-foreground/90 font-serif italic line-clamp-3">
                            &ldquo;{ann.selected_text}&rdquo;
                          </p>
                        </div>

                        {/* Color Picker */}
                        <div className="flex items-center justify-between pt-1 border-t border-border/40">
                          <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                            Highlight
                          </span>
                          <div className="flex items-center gap-1.5">
                            {(Object.keys(COLOR_MAP) as AnnotationColor[]).map(
                              (c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() =>
                                    onUpdateAnnotation(ann.id, { color: c })
                                  }
                                  className={cn(
                                    "size-5 rounded-full flex items-center justify-center transition-transform",
                                    COLOR_MAP[c].dot,
                                    ann.color === c &&
                                      "ring-2 ring-foreground scale-110",
                                  )}
                                  title={COLOR_MAP[c].label}
                                >
                                  {ann.color === c && (
                                    <Check className="size-3 text-black" />
                                  )}
                                </button>
                              ),
                            )}
                          </div>
                        </div>

                        {/* Note Input */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                            Note
                          </label>
                          <Textarea
                            placeholder="Add study notes or questions…"
                            value={editingNote}
                            onChange={(e) => setEditingNote(e.target.value)}
                            className="min-h-16 text-xs resize-none bg-muted/40 rounded-lg"
                          />
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center justify-between pt-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10 rounded-lg"
                            onClick={() => {
                              onDeleteAnnotation(ann.id);
                              setActiveAnnotationId(null);
                            }}
                            title="Delete highlight"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs rounded-lg"
                              onClick={() => setActiveAnnotationId(null)}
                            >
                              Done
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs font-semibold rounded-lg"
                              onClick={() => {
                                onUpdateAnnotation(ann.id, {
                                  note_text: editingNote.trim(),
                                });
                                setActiveAnnotationId(null);
                              }}
                            >
                              Save Note
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}
