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
import { X } from "lucide-react";
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
}: FillInTheBlanksDndProps) {
  const rawText = questionText || "";
  const parts = rawText.split(/\[blank\]|_{3,4}/gi);
  const blankAnswers = currentVal || {};
  const [isDragging, setIsDragging] = useState(false);

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
                  value={blankAnswers[i] || blankAnswers[str(i)]}
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

        {pool.length > 0 && (
          <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-dashed border-border/60">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Word / Option Bank (Drag to blank or select in place)
            </div>
            <div className="flex flex-wrap gap-2">
              {pool.map((ans) => (
                <DraggableFillBlankAnswer
                  key={ans.id}
                  id={ans.id}
                  text={ans.text}
                  isUsed={Boolean(
                    poolCountsByText[ans.text] &&
                    usedAnswerCounts[ans.text] >= poolCountsByText[ans.text],
                  )}
                  disabled={disabled}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}

function str(val: any): string {
  return String(val);
}
