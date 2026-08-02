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
import { ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MatchingOption {
  id?: string;
  text?: string;
  option_text?: string;
  option_text_right?: string;
  match_value?: string;
}

export interface MatchingDndProps {
  options: MatchingOption[];
  questionId: string;
  attemptId?: string | null;
  currentVal?: Record<string, string>;
  onAnswerChange: (val: Record<string, string>) => void;
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

function DraggableMatchResponse({
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
        "px-3.5 py-2 rounded-lg bg-background border border-primary/20 text-primary font-medium text-xs transition-all shadow-sm select-none",
        !disabled && !isUsed && "cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-primary/5",
        isDragging && "shadow-md border-primary scale-102",
        isUsed && "opacity-20 grayscale pointer-events-none border-dashed",
        disabled && "opacity-60 pointer-events-none"
      )}
    >
      {text}
    </div>
  );
}

function DroppableMatchTarget({
  premiseId,
  premiseText,
  matchedValue,
  onRemove,
  optionsPool,
  onSelect,
  isDragging,
  disabled,
}: {
  premiseId: string;
  premiseText: string;
  matchedValue?: string;
  onRemove: () => void;
  optionsPool: string[];
  onSelect: (val: string) => void;
  isDragging?: boolean;
  disabled?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `target-${premiseId}`,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 bg-background",
        isOver
          ? "bg-primary/5 border-primary"
          : matchedValue
          ? "border-primary/25 shadow-sm"
          : "border-muted/70"
      )}
    >
      <div className="flex-1 text-xs md:text-sm font-semibold text-foreground/90 leading-relaxed">
        {premiseText}
      </div>
      <div className="shrink-0 text-muted-foreground/30">
        <ArrowRight className="size-4" />
      </div>
      <div
        className={cn(
          "w-[220px] md:w-[240px] h-10 rounded-lg border flex items-center justify-between px-3 transition-all relative group bg-muted/5",
          matchedValue
            ? "border-primary/30"
            : "border-dashed border-muted-foreground/20"
        )}
      >
        <select
          disabled={disabled}
          value={matchedValue || ""}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "") {
              onRemove();
            } else {
              onSelect(val);
            }
          }}
          className={cn(
            "bg-transparent border-none text-xs font-semibold text-foreground focus:outline-none cursor-pointer w-full pr-8",
            isDragging && "pointer-events-none"
          )}
        >
          <option value="" className="text-muted-foreground">
            Select or Drop match...
          </option>
          {optionsPool.map((opt, i) => (
            <option
              key={i}
              value={opt}
              className="text-foreground bg-background"
            >
              {opt}
            </option>
          ))}
        </select>
        {matchedValue && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute right-3 text-destructive hover:text-destructive/80 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function SharedMatchingDnd({
  options,
  questionId,
  attemptId,
  currentVal,
  onAnswerChange,
  disabled,
}: MatchingDndProps) {
  const matchingAnswers = currentVal || {};
  const [isDragging, setIsDragging] = useState(false);

  const premises = useMemo(() => {
    return (options || []).filter(
      (o: MatchingOption) => o.text || o.option_text
    );
  }, [options]);

  const responses = useMemo(() => {
    const raw = (options || []).map(
      (o: MatchingOption) =>
        o.option_text_right || o.match_value || o.text || o.option_text
    );
    const uniqueRaw = Array.from(new Set(raw)).filter(Boolean);
    const shuffled = seededShuffle(uniqueRaw, `${attemptId || ""}-${questionId}`);
    return shuffled.map((text, i) => ({
      id: `resp-${i}`,
      text: text as string,
    }));
  }, [options, attemptId, questionId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && over.id.toString().startsWith("target-")) {
      const premiseId = over.id.toString().replace("target-", "");
      const responseText = active.data.current?.text;

      if (responseText) {
        onAnswerChange({
          ...matchingAnswers,
          [premiseId]: responseText,
        });
      }
    }
  };

  const removeAnswer = (premiseId: string) => {
    const newAnswers = { ...matchingAnswers };
    delete newAnswers[premiseId];
    onAnswerChange(newAnswers);
  };

  const usedResponses = Object.values(matchingAnswers);

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
        <div className="space-y-3">
          {premises.map((p, idx) => {
            const pId = p.id || `premise-${idx}`;
            const pText = (p.text || p.option_text || "") as string;
            return (
              <DroppableMatchTarget
                key={pId}
                premiseId={pId}
                premiseText={pText}
                matchedValue={matchingAnswers[pId]}
                onRemove={() => removeAnswer(pId)}
                optionsPool={responses.map((r) => r.text)}
                isDragging={isDragging}
                disabled={disabled}
                onSelect={(val) => {
                  onAnswerChange({
                    ...matchingAnswers,
                    [pId]: val,
                  });
                }}
              />
            );
          })}
        </div>

        <div className="space-y-2 p-4 rounded-xl bg-muted/10 border border-dashed border-border/60">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Available Matches (Drag or Select from dropdown)
          </div>
          <div className="flex flex-wrap gap-2">
            {responses.map((resp) => (
              <DraggableMatchResponse
                key={resp.id}
                id={resp.id}
                text={resp.text}
                isUsed={usedResponses.includes(resp.text)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}
