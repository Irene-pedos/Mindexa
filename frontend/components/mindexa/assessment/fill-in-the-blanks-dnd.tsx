"use client";

import React, { useState, useMemo } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  KeyboardSensor,
  useSensors,
  useSensor,
  closestCenter,
  DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { X, ListFilter, Move } from "lucide-react";
import { useAccessibility } from "@/components/providers/accessibility-provider";
import { cn } from "@/lib/utils";

export interface FillBlankOption {
  id?: string;
  text?: string;
  option_text?: string;
}

export interface FillInTheBlanksDndProps {
  questionText: string;
  options?: FillBlankOption[];
  questionId: string;
  attemptId?: string | null;
  currentVal?: Record<number | string, string>;
  onAnswerChange: (val: Record<number | string, string>) => void;
  disabled?: boolean;
  interactionMode?: "drag" | "list" | "auto";
}

function seededShuffle<T>(array: T[], seedStr: string): T[] {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const pseudoRand = Math.abs(Math.sin(hash + i));
    const j = Math.floor(pseudoRand * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function DraggableFillBlankAnswer({
  id,
  text,
  isUsed,
  disabled,
}: {
  id: string;
  text: string;
  isUsed: boolean;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: { text },
      disabled: disabled || isUsed,
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 100 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "inline-flex items-center px-3 py-1.5 rounded-md bg-background border border-primary/30 text-primary font-semibold text-xs transition-all shadow-sm select-none",
        !disabled &&
          !isUsed &&
          "cursor-grab active:cursor-grabbing hover:border-primary hover:bg-primary/5",
        isDragging && "shadow-md border-primary scale-105",
        isUsed && "opacity-25 grayscale pointer-events-none border-dashed",
        disabled && "opacity-60 pointer-events-none",
      )}
    >
      {text}
    </div>
  );
}

function DroppableBlank({
  index,
  value,
  onRemove,
  optionsPool,
  onSelect,
  isDragging,
  disabled,
}: {
  index: number;
  value?: string;
  onRemove: () => void;
  optionsPool: string[];
  onSelect: (val: string) => void;
  isDragging?: boolean;
  disabled?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `blank-${index}`,
    disabled,
  });

  return (
    <span
      ref={setNodeRef}
      className={cn(
        "inline-flex items-center mx-1.5 my-1 px-2.5 py-0.5 min-w-[130px] h-8 rounded-lg border transition-all relative align-middle bg-background/80",
        isOver
          ? "bg-primary/10 border-primary ring-2 ring-primary/20"
          : value
            ? "border-primary/40 bg-primary/5 text-primary font-semibold shadow-xs"
            : "border-dashed border-muted-foreground/40 bg-muted/20",
      )}
    >
      <select
        disabled={disabled}
        value={value || ""}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "") {
            onRemove();
          } else {
            onSelect(val);
          }
        }}
        className={cn(
          "bg-transparent border-none text-xs font-bold focus:outline-none cursor-pointer w-full pr-5 appearance-none",
          value ? "text-primary" : "text-muted-foreground",
          isDragging && "pointer-events-none",
        )}
      >
        <option value="" className="text-muted-foreground">
          [ Blank {index + 1} ]
        </option>
        {optionsPool.map((opt, i) => (
          <option key={i} value={opt} className="text-foreground bg-background">
            {opt}
          </option>
        ))}
      </select>
      {value && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-1.5 text-destructive hover:text-destructive/80 transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </span>
  );
}

export function SharedFillInTheBlanksDnd({
  questionText,
  options,
  questionId,
  attemptId,
  currentVal,
  onAnswerChange,
  disabled,
  interactionMode = "auto",
}: FillInTheBlanksDndProps) {
  const { isSimpleMode, isScreenReaderMode } = useAccessibility();
  const rawText = questionText || "";
  const parts = useMemo(() => rawText.split(/\[blank\]|_{3,4}/gi), [rawText]);
  const blankAnswers = useMemo(() => currentVal || {}, [currentVal]);
  const [isDragging, setIsDragging] = useState(false);

  const defaultMode = useMemo<"dnd" | "list">(() => {
    if (interactionMode === "list") return "list";
    if (interactionMode === "drag") return "dnd";
    return isSimpleMode || isScreenReaderMode ? "list" : "dnd";
  }, [interactionMode, isSimpleMode, isScreenReaderMode]);

  const [viewMode, setViewMode] = useState<"dnd" | "list">(defaultMode);

  React.useEffect(() => {
    setViewMode(defaultMode);
  }, [defaultMode]);

  const pool = useMemo(() => {
    const raw = (options || [])
      .map((o: FillBlankOption, i: number) => ({
        id: o.id || `pool-${i}`,
        text: o.option_text || o.text || "",
      }))
      .filter((o) => o.text.trim().length > 0);

    return seededShuffle(raw, `${attemptId || ""}-${questionId}`);
  }, [options, attemptId, questionId]);

  const poolCountsByText = useMemo(() => {
    const counts: Record<string, number> = {};
    pool.forEach((entry) => {
      counts[entry.text] = (counts[entry.text] || 0) + 1;
    });
    return counts;
  }, [pool]);

  const usedAnswerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(blankAnswers).forEach((value) => {
      if (!value) return;
      const text = String(value);
      counts[text] = (counts[text] || 0) + 1;
    });
    return counts;
  }, [blankAnswers]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && over.id.toString().startsWith("blank-")) {
      const blankIndex = parseInt(over.id.toString().split("-")[1], 10);
      const droppedText = active.data.current?.text;

      if (droppedText) {
        onAnswerChange({
          ...blankAnswers,
          [blankIndex]: droppedText,
        });
      }
    }
  };

  const removeAnswer = (index: number | string) => {
    const newAnswers = { ...blankAnswers };
    delete newAnswers[index];
    onAnswerChange(newAnswers);
  };

  const usedAnswers = Object.values(blankAnswers) as string[];

  return (
    <div className="space-y-4">
      {/* Accessible Mode Switcher */}
      <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/40">
        <span className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
          {viewMode === "list" ? (
            <>
              <ListFilter className="size-3.5 text-primary" />
              <span>List Mode Active (Accessible Dropdowns)</span>
            </>
          ) : (
            <>
              <Move className="size-3.5 text-primary" />
              <span>Drag & Drop Mode Active</span>
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => setViewMode((prev) => (prev === "list" ? "dnd" : "list"))}
          className="text-xs font-medium text-primary hover:underline px-2 py-0.5 rounded focus:outline-none"
        >
          {viewMode === "list" ? "Switch to Drag & Drop" : "Switch to List Mode"}
        </button>
      </div>

      {viewMode === "list" ? (
        /* ACCESSIBLE LIST MODE */
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-border/70 bg-card text-xs md:text-sm font-medium leading-relaxed">
            <span className="font-bold text-muted-foreground block mb-2 text-[11px] uppercase tracking-wider">
              Question Text:
            </span>
            {parts.map((part, i) => (
              <React.Fragment key={i}>
                <span>{part}</span>
                {i < parts.length - 1 && (
                  <span className="inline-block mx-1 px-2 py-0.5 rounded font-bold bg-primary/10 text-primary border border-primary/20">
                    [Blank {i + 1}: {blankAnswers[i] || blankAnswers[String(i)] || "Unanswered"}]
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="space-y-3">
            {parts.slice(0, -1).map((_, i) => {
              const matchedVal = blankAnswers[i] || blankAnswers[String(i)];
              return (
                <div
                  key={i}
                  className="p-3.5 rounded-xl border border-border/70 bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="text-xs md:text-sm font-semibold text-foreground">
                    <span className="font-bold text-primary mr-2">Blank {i + 1}:</span>
                    Select the word or phrase to fill this position
                  </div>
                  <div className="w-full sm:w-64">
                    <select
                      disabled={disabled}
                      value={matchedVal || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          removeAnswer(i);
                        } else {
                          onAnswerChange({
                            ...blankAnswers,
                            [i]: val,
                          });
                        }
                      }}
                      className="w-full h-11 px-3 rounded-lg border border-border/80 bg-background text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary/20"
                      aria-label={`Select answer for Blank ${i + 1}`}
                    >
                      <option value="">-- Select blank option --</option>
                      {pool
                        .filter((opt, _, arr) => {
                          // Deduplicate: render each unique text once only
                          return arr.findIndex((x) => x.text === opt.text) === arr.indexOf(opt);
                        })
                        .map((opt, optIdx) => {
                          const totalAvailable = poolCountsByText[opt.text] || 1;
                          const timesUsed = usedAnswerCounts[opt.text] || 0;
                          // Show option if: it's the current selection for this blank,
                          // OR there are still unused copies left
                          const isCurrentSelection = matchedVal === opt.text;
                          const hasCapacityLeft = timesUsed < totalAvailable;
                          if (!isCurrentSelection && !hasCapacityLeft) return null;
                          return (
                            <option key={optIdx} value={opt.text}>
                              {opt.text}
                            </option>
                          );
                        })}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* INTERACTIVE DRAG & DROP MODE */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={(e) => {
            setIsDragging(false);
            handleDragEnd(e);
          }}
          onDragCancel={() => setIsDragging(false)}
        >
          <div className="space-y-6">
            <div className="p-5 md:p-6 rounded-xl border border-border/70 bg-card leading-[2.6] text-xs md:text-sm font-medium text-foreground/90 shadow-xs">
              {parts.map((part: string, i: number) => (
                <React.Fragment key={i}>
                  <span className="whitespace-pre-wrap">{part}</span>
                  {i < parts.length - 1 && (
                    <DroppableBlank
                      index={i}
                      value={blankAnswers[i] || blankAnswers[String(i)]}
                      onRemove={() => removeAnswer(i)}
                      optionsPool={pool.map((p) => p.text)}
                      isDragging={isDragging}
                      disabled={disabled}
                      onSelect={(val) => {
                        onAnswerChange({
                          ...blankAnswers,
                          [i]: val,
                        });
                      }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-dashed border-border/60">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Available Word Bank (Drag or Select from dropdown)
              </div>
              <div className="flex flex-wrap gap-2">
                {pool.map((opt) => (
                  <DraggableFillBlankAnswer
                    key={opt.id}
                    id={opt.id}
                    text={opt.text}
                    isUsed={Boolean(
                      poolCountsByText[opt.text] &&
                      usedAnswerCounts[opt.text] >= poolCountsByText[opt.text],
                    )}
                    disabled={disabled}
                  />
                ))}
              </div>
            </div>
          </div>
        </DndContext>
      )}
    </div>
  );
}

function str(val: any): string {
  return String(val);
}
