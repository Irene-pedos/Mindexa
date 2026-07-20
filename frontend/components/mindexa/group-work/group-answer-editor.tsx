// components/mindexa/group-work/group-answer-editor.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  FileEdit, 
  Save, 
  User as UserIcon, 
  Clock, 
  AlertTriangle,
  Info,
  Sparkles,
  ArrowRight,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

// DnD Imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface GroupAnswer {
  question_id: string;
  answer_content: any;
  notes_content?: any;
  last_modified_at: string;
  last_modified_by_id: string;
  last_modified_by_name: string;
}

interface Question {
  id: string;
  text: string;
  type: string;
  marks: number;
  options?: any[];
  caseStudyContext?: string;
}

interface GroupAnswerEditorProps {
  question: Question;
  answer?: GroupAnswer;
  onSave: (questionId: string, content: any, notes?: any) => Promise<void>;
  currentUserId: string;
}

const normalizeType = (type: string) => {
  return (type || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
};

function seededShuffle<T>(array: T[], seed: string): T[] {
  const arr = [...array];
  let seedNum = 0;
  for (let i = 0; i < seed.length; i++) {
    seedNum += seed.charCodeAt(i);
  }
  const random = () => {
    const x = Math.sin(seedNum++) * 10000;
    return x - Math.floor(x);
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getDefaultContent(qType: string, options: any[], questionId: string) {
  if (["ordering", "ordered_list"].includes(qType)) {
    const rawIds = (options || []).map((o: any) => o.id) || [];
    return seededShuffle(rawIds, questionId);
  }
  if (["multiselect", "multi_correct", "multi_select", "checkbox"].includes(qType)) {
    return [];
  }
  if (["matching", "match_pairs", "fill_blank", "fillblank", "fillblanks", "casestudy", "case_study"].includes(qType)) {
    return {};
  }
  return "";
}

// --- DnD Sortable Item for Ordering ---
function SortableOrderItem({
  id,
  index,
  text,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  id: string;
  index: number;
  text: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border bg-background group transition-all duration-200",
        isDragging
          ? "shadow-md border-primary/45 bg-accent/40"
          : "hover:border-primary/10 hover:shadow-sm",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="size-7 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground cursor-grab active:cursor-grabbing"
      >
        {index + 1}
      </div>
      <div className="flex-1 text-sm font-semibold text-foreground/80">
        {text}
      </div>
      <div className="flex gap-1.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <Button
          variant="outline"
          size="icon"
          className="size-7 rounded-md"
          onClick={onMoveUp}
          disabled={isFirst}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-7 rounded-md"
          onClick={onMoveDown}
          disabled={isLast}
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// --- DnD Draggable Item for Matching Choices ---
function DraggableMatchResponse({
  id,
  text,
  isUsed,
}: {
  id: string;
  text: string;
  isUsed: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: { text },
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
        "px-3.5 py-2 rounded-lg bg-background border border-primary/20 text-primary font-medium text-xs cursor-grab active:cursor-grabbing hover:border-primary/45 hover:bg-primary/5 transition-all shadow-sm select-none",
        isDragging && "shadow-md border-primary scale-102",
        isUsed && "opacity-20 grayscale pointer-events-none border-dashed",
      )}
    >
      {text}
    </div>
  );
}

// --- DnD Droppable Target for Matching Premises ---
function DroppableMatchTarget({
  premiseId,
  premiseText,
  matchedValue,
  onRemove,
  optionsPool,
  onSelect,
  isDragging,
}: {
  premiseId: string;
  premiseText: string;
  matchedValue?: string;
  onRemove: () => void;
  optionsPool: string[];
  onSelect: (val: string) => void;
  isDragging?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `target-${premiseId}`,
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
            : "border-muted/70",
      )}
    >
      <div className="flex-1 text-sm font-semibold text-foreground/80">
        {premiseText}
      </div>
      <div className="shrink-0 text-muted-foreground/30">
        <ArrowRight className="size-4" />
      </div>
      <div
        className={cn(
          "w-[240px] h-10 rounded-lg border flex items-center justify-between px-3 transition-all relative group bg-muted/5",
          matchedValue
            ? "border-primary/30"
            : "border-dashed border-muted-foreground/20",
        )}
      >
        <select
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
            "bg-transparent border-none text-xs font-semibold text-foreground focus:outline-none cursor-pointer w-full pr-8 appearance-none",
            isDragging && "pointer-events-none",
          )}
        >
          <option value="" className="text-muted-foreground/60">
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
        {matchedValue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute right-3 text-[10px] font-bold text-destructive hover:text-destructive/80 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export function GroupAnswerEditor({ 
  question, 
  answer, 
  onSave, 
  currentUserId 
}: GroupAnswerEditorProps) {
  const getInitialContent = () => {
    const raw = answer?.answer_content;
    const qType = normalizeType(question.type);
    if (!raw) return getDefaultContent(qType, question.options || [], question.id);
    if (typeof raw === "object") {
      if (raw.selected_option_ids !== undefined) return raw.selected_option_ids;
      if (raw.ordered_option_ids !== undefined) return raw.ordered_option_ids;
      if (raw.match_pairs_json !== undefined) return raw.match_pairs_json;
      if (raw.fill_blank_answers !== undefined) return raw.fill_blank_answers;
      if (raw.case_study_answers !== undefined) return raw.case_study_answers;
      if (raw.selected_option_id !== undefined) return raw.selected_option_id;
      if (raw.text !== undefined) return raw.text;
      if (raw.answer_text !== undefined) return raw.answer_text;
    }
    return raw;
  };

  const getInitialNotes = () => {
    const raw = answer?.notes_content;
    if (!raw) return "";
    if (typeof raw === "object") {
      return raw.text || "";
    }
    return raw;
  };

  const [localContent, setLocalContent] = useState<any>(getInitialContent());
  const [localNotes, setLocalNotes] = useState<any>(getInitialNotes());
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const localContentRef = useRef<any>(localContent);
  const localNotesRef = useRef<any>(localNotes);

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  useEffect(() => {
    localNotesRef.current = localNotes;
  }, [localNotes]);

  useEffect(() => {
    const qType = normalizeType(question.type);
    
    if (answer?.answer_content !== undefined && answer.answer_content !== null) {
      const raw = answer.answer_content;
      if (typeof raw === "object") {
        if (raw.selected_option_ids !== undefined) setLocalContent(raw.selected_option_ids);
        else if (raw.ordered_option_ids !== undefined) setLocalContent(raw.ordered_option_ids);
        else if (raw.match_pairs_json !== undefined) setLocalContent(raw.match_pairs_json);
        else if (raw.fill_blank_answers !== undefined) setLocalContent(raw.fill_blank_answers);
        else if (raw.case_study_answers !== undefined) setLocalContent(raw.case_study_answers);
        else if (raw.selected_option_id !== undefined) setLocalContent(raw.selected_option_id);
        else if (raw.text !== undefined) setLocalContent(raw.text);
        else if (raw.answer_text !== undefined) setLocalContent(raw.answer_text);
        else setLocalContent(getDefaultContent(qType, question.options || [], question.id));
      } else {
        setLocalContent(raw);
      }
    } else {
      setLocalContent(getDefaultContent(qType, question.options || [], question.id));
    }

    if (answer?.notes_content !== undefined && answer.notes_content !== null) {
      const rawNotes = answer.notes_content;
      if (typeof rawNotes === "object") {
        setLocalNotes(rawNotes.text || "");
      } else {
        setLocalNotes(rawNotes);
      }
    } else {
      setLocalNotes("");
    }
    setIsDirty(false);
  }, [answer, question]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleContentChange = (val: any) => {
    setLocalContent(val);
    localContentRef.current = val;
    setIsDirty(true);
    
    const qType = normalizeType(question.type);
    if (["essay", "shortanswer", "short_answer", "casestudy", "case_study", "computational", "practical"].includes(qType)) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(async () => {
            try {
              await onSave(question.id, localContentRef.current, localNotesRef.current);
              setIsDirty(false);
            } catch (err) {
              console.error("Auto-save failed", err);
            }
        }, 3000);
    }
  };

  const handleNotesChange = (val: any) => {
    setLocalNotes(val);
    localNotesRef.current = val;
    setIsDirty(true);
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
        try {
          await onSave(question.id, localContentRef.current, localNotesRef.current);
          setIsDirty(false);
        } catch (err) {
          console.error("Notes auto-save failed", err);
        }
    }, 3000);
  };

  const handleManualSave = async () => {
    if (!isDirty && !isSaving) return;
    setIsSaving(true);
    try {
      await onSave(question.id, localContent, localNotes);
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to save shared answer", err);
    } finally {
      setIsSaving(false);
    }
  };

  const [isDndActive, setIsDndActive] = useState(false);

  const renderInput = () => {
    const qType = normalizeType(question.type);
    
    switch (qType) {
      case "mcq":
      case "multiplechoice":
      case "multiple_choice":
      case "truefalse":
      case "true_false":
        return (
          <RadioGroup 
            value={String(localContent)} 
            onValueChange={async (v) => {
              setLocalContent(v);
              localContentRef.current = v;
              setIsDirty(true);
              try {
                await onSave(question.id, v, localNotesRef.current);
                setIsDirty(false);
              } catch (err) {
                console.error(err);
              }
            }}
            className="space-y-3"
          >
            {(question.options || []).map((opt: any, idx: number) => (
              <div key={idx} className="flex items-center space-x-2 border rounded-xl p-4 hover:bg-muted/30 transition-all cursor-pointer">
                <RadioGroupItem value={String(opt.id)} id={`shared-opt-${question.id}-${idx}`} />
                <Label htmlFor={`shared-opt-${question.id}-${idx}`} className="flex-1 cursor-pointer text-[13px] font-medium leading-relaxed">
                  {opt.text || opt.option_text}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "multiselect":
      case "multicorrect":
      case "multi_correct":
      case "multi_select":
      case "checkbox": {
        const selectedIds = Array.isArray(localContent) ? localContent : [];
        return (
          <div className="space-y-3">
            {(question.options || []).map((opt: any, idx: number) => {
              const isChecked = selectedIds.includes(String(opt.id));
              return (
                <div
                  key={idx}
                  className="flex items-center space-x-3 border rounded-xl p-4 hover:bg-muted/30 transition-all cursor-pointer"
                  onClick={async () => {
                    let newSelected = [...selectedIds];
                    const optIdStr = String(opt.id);
                    if (isChecked) {
                      newSelected = newSelected.filter((id) => id !== optIdStr);
                    } else {
                      newSelected.push(optIdStr);
                    }
                    setLocalContent(newSelected);
                    localContentRef.current = newSelected;
                    setIsDirty(true);
                    try {
                      await onSave(question.id, newSelected, localNotesRef.current);
                      setIsDirty(false);
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                >
                  <Checkbox
                    checked={isChecked}
                    id={`shared-opt-${question.id}-${idx}`}
                    onCheckedChange={() => {}}
                  />
                  <Label
                    htmlFor={`shared-opt-${question.id}-${idx}`}
                    className="flex-1 cursor-pointer text-[13px] font-medium leading-relaxed"
                  >
                    {opt.text || opt.option_text}
                  </Label>
                </div>
              );
            })}
          </div>
        );
      }

      case "ordering":
      case "orderedlist":
      case "ordered_list": {
        const currentVal = Array.isArray(localContent) ? localContent : [];
        
        const moveItem = async (from: number, to: number) => {
          const newOrder = [...currentVal];
          const [removed] = newOrder.splice(from, 1);
          newOrder.splice(to, 0, removed);
          setLocalContent(newOrder);
          localContentRef.current = newOrder;
          setIsDirty(true);
          try {
            await onSave(question.id, newOrder, localNotesRef.current);
            setIsDirty(false);
          } catch (err) {
            console.error(err);
          }
        };

        const handleDragEnd = async (event: DragEndEvent) => {
          setIsDndActive(false);
          const { active, over } = event;
          if (active && over && active.id !== over.id) {
            const oldIndex = currentVal.indexOf(active.id as string);
            const newIndex = currentVal.indexOf(over.id as string);
            const newOrder = arrayMove(currentVal, oldIndex, newIndex);
            setLocalContent(newOrder);
            localContentRef.current = newOrder;
            setIsDirty(true);
            try {
              await onSave(question.id, newOrder, localNotesRef.current);
              setIsDirty(false);
            } catch (err) {
              console.error(err);
            }
          }
        };

        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground mb-2">
              Drag and drop options or use Up/Down buttons to reorder:
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => setIsDndActive(true)}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setIsDndActive(false)}
            >
              <SortableContext
                items={currentVal}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {currentVal.map((optId: string, idx: number) => {
                    const opt = (question.options || []).find((o: any) => String(o.id) === String(optId));
                    if (!opt) return null;
                    return (
                      <SortableOrderItem
                        key={optId}
                        id={optId}
                        index={idx}
                        text={opt.text || opt.option_text}
                        onMoveUp={() => moveItem(idx, idx - 1)}
                        onMoveDown={() => moveItem(idx, idx + 1)}
                        isFirst={idx === 0}
                        isLast={idx === currentVal.length - 1}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        );
      }

      case "matching":
      case "matchpairs":
      case "match_pairs": {
        const premises = (question.options || []).filter((o: any) => o.text || o.option_text);
        const responses = (question.options || []).map(
          (o: any) => o.option_text_right || o.match_value || o.text || o.option_text
        );
        const uniqueResponses = Array.from(new Set(responses)).filter(Boolean) as string[];
        const matchedPairs = typeof localContent === "object" && localContent !== null ? localContent : {};

        const handleDragEnd = async (event: DragEndEvent) => {
          setIsDndActive(false);
          const { active, over } = event;
          if (over && over.id.toString().startsWith("target-")) {
            const premiseId = over.id.toString().replace("target-", "");
            const droppedText = active.data.current?.text;
            if (droppedText) {
              const newPairs = { ...matchedPairs, [premiseId]: droppedText };
              setLocalContent(newPairs);
              localContentRef.current = newPairs;
              setIsDirty(true);
              try {
                await onSave(question.id, newPairs, localNotesRef.current);
                setIsDirty(false);
              } catch (err) {
                console.error(err);
              }
            }
          }
        };

        const removeMatch = async (premiseId: string) => {
          const newPairs = { ...matchedPairs };
          delete newPairs[premiseId];
          setLocalContent(newPairs);
          localContentRef.current = newPairs;
          setIsDirty(true);
          try {
            await onSave(question.id, newPairs, localNotesRef.current);
            setIsDirty(false);
          } catch (err) {
            console.error(err);
          }
        };

        const setMatchSelect = async (premiseId: string, val: string) => {
          const newPairs = { ...matchedPairs };
          if (val === "none") {
            delete newPairs[premiseId];
          } else {
            newPairs[premiseId] = val;
          }
          setLocalContent(newPairs);
          localContentRef.current = newPairs;
          setIsDirty(true);
          try {
            await onSave(question.id, newPairs, localNotesRef.current);
            setIsDirty(false);
          } catch (err) {
            console.error(err);
          }
        };

        const matchedValues = Object.values(matchedPairs) as string[];

        return (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => setIsDndActive(true)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setIsDndActive(false)}
          >
            <div className="space-y-6">
              <p className="text-xs text-muted-foreground">
                Drag matching items to targets on the left, or use Select menus:
              </p>
              <div className="grid gap-3">
                {premises.map((p: any) => (
                  <DroppableMatchTarget
                    key={p.id}
                    premiseId={p.id}
                    premiseText={p.text || p.option_text || ""}
                    matchedValue={matchedPairs[p.id]}
                    onRemove={() => removeMatch(p.id)}
                    optionsPool={uniqueResponses}
                    isDragging={isDndActive}
                    onSelect={(val) => setMatchSelect(p.id, val)}
                  />
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-2.5 p-4 rounded-xl bg-muted/10 border border-dashed border-muted">
                {uniqueResponses.map((resp, i) => (
                  <DraggableMatchResponse
                    key={i}
                    id={`resp-${i}`}
                    text={resp}
                    isUsed={matchedValues.includes(resp)}
                  />
                ))}
              </div>
            </div>
          </DndContext>
        );
      }

      case "fillblank":
      case "fill_blank":
      case "fillblanks": {
        const rawText = question.text || "";
        const parts = rawText.split("[blank]");
        const blankAnswers = typeof localContent === "object" && localContent !== null ? localContent : {};
        const pool = (question.options || []).map((o: any) => o.option_text || o.text || "");

        return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground mb-2">
              Select the correct option for each blank to complete the statement:
            </p>
            <div className="p-6 rounded-2xl border bg-background leading-[2.8] text-[15px] font-medium text-foreground/85 animate-in fade-in duration-200">
              {parts.map((part: string, idx: number) => (
                <React.Fragment key={idx}>
                  <span className="whitespace-pre-wrap">{part}</span>
                  {idx < parts.length - 1 && (
                    <span className="inline-block mx-2 min-w-[150px] relative top-[-1px]">
                      <select
                        value={blankAnswers[idx] || ""}
                        onChange={async (e) => {
                          const val = e.target.value;
                          const newAnswers = { ...blankAnswers };
                          if (val === "") {
                            delete newAnswers[idx];
                          } else {
                            newAnswers[idx] = val;
                          }
                          setLocalContent(newAnswers);
                          localContentRef.current = newAnswers;
                          setIsDirty(true);
                          try {
                            await onSave(question.id, newAnswers, localNotesRef.current);
                            setIsDirty(false);
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="w-full h-8 text-xs font-semibold px-2 py-0.5 border rounded-lg bg-muted/20 border-border focus:outline-none focus:ring-1 focus:ring-primary/45 text-primary text-center appearance-none cursor-pointer"
                      >
                        <option value="" className="text-muted-foreground/60">
                          [Select...]
                        </option>
                        {pool.map((opt: string, pIdx: number) => (
                          <option key={pIdx} value={opt} className="text-foreground bg-background text-left">
                            {opt}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        );
      }

      case "shortanswer":
      case "short_answer":
        return (
          <Textarea 
            value={String(localContent)} 
            onChange={(e) => handleContentChange(e.target.value)}
            className="min-h-[120px] text-sm leading-relaxed p-4 bg-muted/5 border focus:border-primary/50 rounded-xl animate-in fade-in duration-200"
            placeholder="Collaborate on short answer response here (2-4 sentences recommended)..."
          />
        );

      case "casestudy":
      case "case_study": {
        const answersObj = typeof localContent === "object" && localContent !== null ? localContent : {};
        const caseStudyContext = question.caseStudyContext || (question as any).content_context || "";
        const subQuestions = question.options || [];

        return (
          <div className="space-y-6 animate-in fade-in duration-200">
            {caseStudyContext && (
              <div className="p-4 rounded-xl border border-amber-500/15 bg-amber-500/[0.02] text-sm leading-relaxed italic text-foreground/80">
                <span className="block font-bold text-xs uppercase text-amber-600 mb-1.5 tracking-wider">
                  Case Study Context Reference
                </span>
                {caseStudyContext}
              </div>
            )}
            {subQuestions.length > 0 ? (
              <div className="space-y-6">
                {subQuestions.map((opt: any, idx: number) => {
                  const marksVal =
                    opt.match_key !== undefined && opt.match_key !== null
                      ? opt.match_key
                      : opt.match_value !== undefined && opt.match_value !== null
                        ? opt.match_value
                        : 5;
                  const subAnswer = answersObj[opt.id] || "";
                  return (
                    <div
                      key={opt.id}
                      className="space-y-2 p-4 rounded-xl border border-muted/50 bg-background/50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <h4 className="text-sm font-semibold text-foreground/90 leading-relaxed">
                          {idx + 1}. {opt.text || opt.option_text || "Sub-question"}
                        </h4>
                        <Badge
                          variant="secondary"
                          className="text-[10px] shrink-0 font-bold uppercase tracking-wider bg-muted/60"
                        >
                          {marksVal} Marks
                        </Badge>
                      </div>
                      <Textarea
                        value={subAnswer}
                        onChange={(e) => {
                          const newAnswers = { ...answersObj, [opt.id]: e.target.value };
                          setLocalContent(newAnswers);
                          localContentRef.current = newAnswers;
                          setIsDirty(true);
                          
                          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                          saveTimeoutRef.current = setTimeout(async () => {
                            try {
                              await onSave(question.id, newAnswers, localNotesRef.current);
                              setIsDirty(false);
                            } catch (err) {
                              console.error(err);
                            }
                          }, 3000);
                        }}
                        className="min-h-[120px] text-sm leading-relaxed p-4 bg-muted/5 border focus:border-primary/50 rounded-xl resize-none"
                        placeholder="Type answer to sub-question..."
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <Textarea
                value={String(localContent)}
                onChange={(e) => handleContentChange(e.target.value)}
                className="min-h-[200px] text-[15px] leading-relaxed p-6 bg-muted/5 border-2 focus:border-primary/50 rounded-2xl resize-none"
                placeholder="Collaborate on case study response here..."
              />
            )}
          </div>
        );
      }

      case "essay":
      case "computational":
      case "practical":
        return (
          <Textarea 
            value={String(localContent)} 
            onChange={(e) => handleContentChange(e.target.value)}
            className="min-h-[200px] text-[15px] leading-relaxed p-6 bg-muted/5 border border-border focus:border-primary/50 rounded-2xl resize-none"
            placeholder="Collaborate on a comprehensive response here..."
          />
        );

      default:
        return (
          <div className="p-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center gap-3 bg-muted/5">
            <AlertTriangle className="size-8 text-amber-500 opacity-50" />
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Unsupported Preview</p>
              <p className="text-xs text-muted-foreground max-w-xs">This question type requires specialized input. Please use the individual take page for complex inputs if needed, though they are synced here.</p>
            </div>
          </div>
        );
    }
  };

  const wasModifiedByMe = answer?.last_modified_by_id === currentUserId;

  return (
    <Card className="border shadow-none overflow-hidden group">
      <CardHeader className="py-4 px-6 border-b bg-muted/5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileEdit className="size-3.5 text-primary" />
              </div>
              <CardTitle className="text-base font-bold tracking-tight">Question Workspace</CardTitle>
              <Badge variant="outline" className="h-5 text-[9px] font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20">
                {question.type.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-[13px] leading-relaxed font-semibold text-foreground/90">
              {question.text}
            </p>
          </div>
          <Badge variant="outline" className="h-6 text-[10px] font-black uppercase tracking-widest bg-background">
            {question.marks} Marks
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="space-y-3">
           <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">Collective Response</Label>
           {renderInput()}
        </div>

        <div className="pt-6 border-t space-y-4">
           <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">Shared Draft / Notes</Label>
           <Textarea 
             value={localNotes}
             onChange={(e) => handleNotesChange(e.target.value)}
             className="min-h-[100px] text-xs leading-relaxed bg-amber-50/20 border-amber-200/50 rounded-xl"
             placeholder="Jot down ideas or rough drafts here. Visible to all members."
           />
        </div>
      </CardContent>
      <CardFooter className="py-3 px-6 border-t bg-muted/10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {answer ? (
            <div className="flex items-center gap-2 animate-in fade-in duration-200">
               <div className={cn(
                 "size-7 rounded-full flex items-center justify-center border shadow-none",
                 wasModifiedByMe ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
               )}>
                 <UserIcon className="size-3.5" />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-bold text-foreground leading-none">
                    {wasModifiedByMe ? "You" : answer.last_modified_by_name}
                 </span>
                 <span className="text-[9px] text-muted-foreground mt-0.5">
                    Edited {formatDistanceToNow(new Date(answer.last_modified_at), { addSuffix: true })}
                 </span>
               </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground italic text-[10px]">
              <Clock className="size-3" /> No edits yet
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isDirty && !isSaving && (
            <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1 uppercase tracking-wider animate-pulse">
              <Info className="size-3" /> Unsaved Changes
            </span>
          )}
          {isSaving ? (
             <Button disabled size="sm" className="h-8 rounded-lg text-[10px] uppercase font-black tracking-widest gap-2 bg-primary/80">
               <Sparkles className="size-3.5 animate-spin" /> Saving...
             </Button>
          ) : (
             <Button 
               onClick={handleManualSave} 
               disabled={!isDirty}
               size="sm" 
               className={cn(
                 "h-8 rounded-lg text-[10px] uppercase font-black tracking-widest gap-2 shadow-sm transition-all duration-300",
                 isDirty ? "bg-primary text-primary-foreground ring-2 ring-primary/30 shadow-md" : "bg-muted text-muted-foreground opacity-50"
               )}
             >
               <Save className="size-3.5" /> Save to Group
             </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
