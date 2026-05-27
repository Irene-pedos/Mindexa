// app/student/assessments/[id]/take/page.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  Timer,
  Check,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Shield,
  Lock,
  Monitor,
  CheckCircle,
  PlayCircle,
  FileText,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { assessmentApi } from "@/lib/api/assessment";
import { attemptApi } from "@/lib/api/attempt";
import { submissionApi } from "@/lib/api/submission";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAssessmentProgressStatus, isHighSecurityAssessment } from "@/lib/grading-architecture";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

type Stage = "intro" | "password" | "readiness" | "taking" | "submitted" | "terminated";

// --- DnD Components for Matching Pairs ---

function DraggableMatchResponse({ id, text, isUsed }: { id: string, text: string, isUsed: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { text }
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
        "px-4 py-2.5 rounded-xl bg-background border-2 border-primary/20 text-primary font-bold text-sm cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-primary/5 transition-all shadow-sm",
        isDragging && "shadow-xl border-primary scale-105 -rotate-1",
        isUsed && "opacity-20 grayscale pointer-events-none border-dashed"
      )}
    >
      {text}
    </div>
  );
}

function DroppableMatchTarget({ premiseId, premiseText, matchedValue, onRemove }: { premiseId: string, premiseText: string, matchedValue?: string, onRemove: () => void }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `target-${premiseId}`,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-4 p-5 rounded-2xl border-2 transition-all",
        isOver ? "bg-primary/10 border-primary border-solid scale-[1.02]" : 
        matchedValue ? "bg-primary/5 border-primary/40 border-solid" : "bg-background border-muted/30 border-dashed hover:border-muted-foreground/20"
      )}
    >
      <div className="flex-1 text-sm font-semibold text-foreground/70 leading-relaxed">{premiseText}</div>
      <div className="shrink-0 text-muted-foreground/20"><ArrowRight className="size-4" /></div>
      <div className={cn(
        "w-[260px] h-12 rounded-xl flex items-center justify-center px-4 transition-all relative group",
        matchedValue ? "bg-primary text-white shadow-md" : "bg-muted/30 border-2 border-dashed border-muted-foreground/10"
      )}>
        {matchedValue ? (
            <>
                <span className="font-bold text-xs uppercase tracking-wider truncate">{matchedValue}</span>
                <button 
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="absolute -top-2 -right-2 size-5 rounded-full bg-destructive text-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <X className="size-3" />
                </button>
            </>
        ) : (
            <span className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-[0.15em] animate-pulse">Drop here</span>
        )}
      </div>
    </div>
  );
}

function MatchingDnd({ q, currentVal, setAnswers, renderDebugBadge }: any) {
  const matchingAnswers = currentVal || {};
  
  const premises = useMemo(() => {
    return (q.options || []).filter((o: any) => o.text || o.option_text);
  }, [q.options]);

  const responses = useMemo(() => {
    const raw = (q.options || []).map((o: any) => o.option_text_right || o.match_value || o.text || o.option_text);
    return Array.from(new Set(raw)).filter(Boolean).map((text, i) => ({
      id: `resp-${i}`,
      text: text as string
    }));
  }, [q.options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && over.id.toString().startsWith("target-")) {
      const premiseId = over.id.toString().replace("target-", "");
      const droppedText = active.data.current?.text;
      
      if (droppedText) {
        setAnswers((prev: any) => ({
          ...prev,
          [q.id]: { ...matchingAnswers, [premiseId]: droppedText }
        }));
      }
    }
  };

  const removeMatch = (premiseId: string) => {
    const newMatches = { ...matchingAnswers };
    delete newMatches[premiseId];
    setAnswers((prev: any) => ({
      ...prev,
      [q.id]: newMatches
    }));
  };

  const matchedValues = Object.values(matchingAnswers) as string[];

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-8 relative">
        {renderDebugBadge()}
        
        <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-primary">
            <span>Premise Matrix</span>
            <div className="flex items-center gap-2">
                <ChevronRight className="size-4 opacity-40" />
                <span>Target Correlation</span>
            </div>
        </div>

        <div className="grid gap-3">
          {premises.map((p: any) => (
            <DroppableMatchTarget 
                key={p.id} 
                premiseId={p.id} 
                premiseText={p.text || p.option_text} 
                matchedValue={matchingAnswers[p.id]} 
                onRemove={() => removeMatch(p.id)}
            />
          ))}
        </div>

        <div className="space-y-4 pt-6 border-t border-dashed">
            <div className="flex items-center justify-center gap-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Response Pool</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3 p-6 rounded-2xl bg-muted/5 border-2 border-dashed border-muted/40">
                {responses.map((r) => (
                    <DraggableMatchResponse 
                        key={r.id} 
                        id={r.id} 
                        text={r.text} 
                        isUsed={matchedValues.includes(r.text)} 
                    />
                ))}
            </div>
            <p className="text-center text-[10px] text-muted-foreground/60 font-medium uppercase tracking-tight italic">Associate each response node with its corresponding premise target</p>
        </div>
      </div>
    </DndContext>
  );
}

// --- DnD Components for Fill-in-the-Blanks ---

function DraggableFillBlankAnswer({ id, text, isUsed }: { id: string, text: string, isUsed: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { text }
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
        "px-4 py-2 rounded-xl bg-background border-2 border-primary/20 text-primary font-bold text-sm cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-primary/5 transition-all shadow-sm",
        isDragging && "shadow-xl border-primary scale-105 rotate-1",
        isUsed && "opacity-20 grayscale pointer-events-none border-dashed"
      )}
    >
      {text}
    </div>
  );
}

function DroppableBlank({ index, value, onRemove }: { index: number, value?: string, onRemove: () => void }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `blank-${index}`,
  });

  return (
    <span
      ref={setNodeRef}
      className={cn(
        "inline-flex items-center justify-center min-w-[140px] h-10 mx-1 border-b-2 transition-all rounded-t-xl px-3 relative top-1",
        isOver ? "bg-primary/20 border-primary shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)]" : 
        value ? "bg-primary/10 border-primary/60" : "bg-muted/40 border-muted-foreground/20",
      )}
    >
      {value ? (
        <span 
          className="text-primary font-bold text-[15px] flex items-center gap-2 cursor-pointer group"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          {value}
          <X className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary/60 hover:text-primary" />
        </span>
      ) : (
        <span className="text-muted-foreground/30 text-[10px] font-bold uppercase tracking-widest animate-pulse">Drop here</span>
      )}
    </span>
  );
}

function FillInTheBlanksDnd({ q, currentVal, setAnswers, renderDebugBadge }: any) {
  const rawText = q.text || q.content || "";
  const parts = rawText.split("[blank]");
  const blankAnswers = currentVal || {};
  
  const pool = useMemo(() => {
    return (q.options || []).map((o: any, i: number) => ({
      id: o.id || `pool-${i}`,
      text: o.option_text || o.text || ""
    }));
  }, [q.options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && over.id.toString().startsWith("blank-")) {
      const blankIndex = over.id.toString().split("-")[1];
      const droppedText = active.data.current?.text;
      
      if (droppedText) {
        setAnswers((prev: any) => ({
          ...prev,
          [q.id]: { ...blankAnswers, [blankIndex]: droppedText }
        }));
      }
    }
  };

  const removeAnswer = (index: number) => {
    const newAnswers = { ...blankAnswers };
    delete newAnswers[index];
    setAnswers((prev: any) => ({
      ...prev,
      [q.id]: newAnswers
    }));
  };

  const usedAnswers = Object.values(blankAnswers) as string[];

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-10 relative">
        {renderDebugBadge()}
        
        <div className="p-12 rounded-2xl border-2 border-muted/30 bg-background leading-[3] text-[18px] font-medium text-foreground/80 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
          {parts.map((part: string, i: number) => (
            <React.Fragment key={i}>
              <span className="whitespace-pre-wrap">{part}</span>
              {i < parts.length - 1 && (
                <DroppableBlank 
                  index={i} 
                  value={blankAnswers[i]} 
                  onRemove={() => removeAnswer(i)} 
                />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
             <div className="h-px flex-1 bg-muted/50" />
             <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Response Pool</span>
             <div className="h-px flex-1 bg-muted/50" />
          </div>
          
          <div className="flex flex-wrap justify-center gap-3 p-6 rounded-2xl bg-muted/5 border-2 border-dashed border-muted/40">
            {pool.map((ans: any) => (
              <DraggableFillBlankAnswer 
                key={ans.id} 
                id={ans.id} 
                text={ans.text} 
                isUsed={usedAnswers.includes(ans.text)} 
              />
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}

// --- DnD Components for Ordering ---

function SortableOrderItem({ id, index, text, onMoveUp, onMoveDown, isFirst, isLast }: { id: string, index: number, text: string, onMoveUp: () => void, onMoveDown: () => void, isFirst: boolean, isLast: boolean }) {
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
    position: 'relative' as const,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border bg-background group transition-all",
        isDragging ? "shadow-lg border-primary/50" : "hover:border-primary/10"
      )}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="size-7 rounded-lg bg-muted/50 flex items-center justify-center text-xs font-bold text-muted-foreground cursor-grab active:cursor-grabbing"
      >
        {index + 1}
      </div>
      <div className="flex-1 text-[15px] font-medium">{text}</div>
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="size-8" onClick={onMoveUp} disabled={isFirst}><ChevronUp className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={onMoveDown} disabled={isLast}><ChevronDown className="size-4" /></Button>
      </div>
    </div>
  );
}

function OrderingQuestion({ q, currentVal, setAnswers, renderDebugBadge }: any) {
  const currentOrder = currentVal || q.options?.map((o: any) => o.id) || [];
  
  const moveItem = (from: number, to: number) => {
      const newOrder = [...currentOrder];
      const [removed] = newOrder.splice(from, 1);
      newOrder.splice(to, 0, removed);
      setAnswers((prev: any) => ({ ...prev, [q.id]: newOrder }));
  };
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = currentOrder.indexOf(active.id);
      const newIndex = currentOrder.indexOf(over.id);
      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
      setAnswers((prev: any) => ({ ...prev, [q.id]: newOrder }));
    }
  };

  return (
    <div className="space-y-4 relative">
       {renderDebugBadge()}
       <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Sequence the items correctly</div>
       
       <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
       >
          <SortableContext 
            items={currentOrder}
            strategy={verticalListSortingStrategy}
          >
             <div className="space-y-2">
               {currentOrder.map((optId: string, idx: number) => {
                  const opt = q.options?.find((o: any) => o.id === optId);
                  return (
                      <SortableOrderItem 
                        key={optId} 
                        id={optId} 
                        index={idx} 
                        text={opt?.text || opt?.option_text || "Sequencing Item"} 
                        onMoveUp={() => idx > 0 && moveItem(idx, idx - 1)}
                        onMoveDown={() => idx < currentOrder.length - 1 && moveItem(idx, idx + 1)}
                        isFirst={idx === 0}
                        isLast={idx === currentOrder.length - 1}
                      />
                  );
               })}
             </div>
          </SortableContext>
       </DndContext>
    </div>
  );
}

export default function TakeAssessmentPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;

  const [stage, setStage] = useState<Stage>("intro");
  const [assessment, setAssessment] = useState<any>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptToken, setAttemptToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Integrity state
  const [warnings, setWarnings] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [terminationReason, setTerminationReason] = useState<string | null>(null);

  // Form states
  const [passwordInput, setPasswordInput] = useState("");
  const [readinessChecked, setReadinessChecked] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const currentQ = questions[currentQuestionIndex];

  const isHighSecurity = useMemo(() => isHighSecurityAssessment(assessment?.assessment_type, assessment?.is_supervised), [assessment]);

  // 1. Initial Load
  useEffect(() => {
    async function loadAssessment() {
      try {
        setLoading(true);
        const data = await assessmentApi.getAssessmentById(assessmentId);
        setAssessment(data);
      } catch (err: any) {
        toast.error(err.message || "Failed to load assessment context.");
        router.push("/student/assessments");
      } finally {
        setLoading(false);
      }
    }
    loadAssessment();
  }, [assessmentId, router]);

  // 2. Fullscreen monitor
  useEffect(() => {
    if (stage !== "taking" || !assessment?.fullscreen_required) return;

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull && stage === "taking") {
        handleIntegrityEvent("FULLSCREEN_EXIT");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [stage, assessment]);

  // 2b. Tab switch monitor (High Security only)
  useEffect(() => {
    if (stage !== "taking" || !isHighSecurity) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleIntegrityEvent("TAB_SWITCH");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [stage, isHighSecurity]);

  // 3. Timer logic
  useEffect(() => {
    if (stage !== "taking" || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          autoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [stage, timeLeft]);

  // 4. Autosave logic
  const saveAnswer = useCallback(async (questionId: string, qType: string, answerVal: any) => {
    if (!attemptId || !attemptToken) return;

    const typeMap: Record<string, string> = {
      short_answer: "TEXT",
      shortanswer: "TEXT",
      essay: "TEXT",
      computational: "TEXT",
      case_study: "TEXT",
      casestudy: "TEXT",
      mcq: "SINGLE_OPTION",
      true_false: "SINGLE_OPTION",
      truefalse: "SINGLE_OPTION",
      matching: "MATCH_PAIRS",
      fill_blank: "FILL_BLANKS",
      fillblank: "FILL_BLANKS",
      ordering: "ORDERED_LIST",
    };

    const normalizedType = (qType || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const answerType = typeMap[normalizedType] || "TEXT";

    const payload: any = {
      attempt_id: attemptId,
      question_id: questionId,
      access_token: attemptToken,
      answer_type: answerType,
      change_type: "autosave",
    };

    if (answerType === "TEXT") {
      payload.answer_text = typeof answerVal === "string" ? answerVal : JSON.stringify(answerVal);
    } else if (answerType === "SINGLE_OPTION" || answerType === "MULTI_OPTION") {
      payload.selected_option_ids = Array.isArray(answerVal) ? answerVal : [answerVal];
    } else if (answerType === "ORDERED_LIST") {
      payload.ordered_option_ids = Array.isArray(answerVal) ? answerVal : [];
    } else if (answerType === "MATCH_PAIRS") {
      payload.match_pairs_json = (answerVal && typeof answerVal === 'object' && !Array.isArray(answerVal)) ? answerVal : {};
    } else if (answerType === "FILL_BLANKS") {
      payload.fill_blank_answers = (answerVal && typeof answerVal === 'object' && !Array.isArray(answerVal)) ? answerVal : {};
    } else if (answerType === "FILE") {
      payload.file_url = answerVal;
    }

    try {
        await submissionApi.saveAnswer(payload);
        setLastSaved(new Date());
    } catch (err) {
        console.error("Autosave failed", err);
    }
  }, [attemptId, attemptToken]);

  useEffect(() => {
    if (stage !== "taking") return;
    const currentAnswer = answers[currentQ?.id];
    if (currentAnswer !== undefined) {
        const timeout = setTimeout(() => saveAnswer(currentQ.id, currentQ.type, currentAnswer), 2000);
        return () => clearTimeout(timeout);
    }
  }, [answers, currentQuestionIndex, stage, saveAnswer, currentQ]);

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen().catch(() => {
      toast.error("Fullscreen request denied. Please enable manually.");
    });
  };

  const handleIntegrityEvent = async (type: string) => {
     if (!attemptId || !attemptToken) return;
     try {
        const { warning } = await attemptApi.recordIntegrityEvent(attemptId, attemptToken, type);
        if (warning) {
            setWarnings(prev => {
                const newCount = prev + 1;
                if (newCount >= 3) {
                    terminateSession(`Maximum integrity warnings exceeded (${type}). Session automatically submitted.`);
                } else {
                    setShowWarningModal(true);
                }
                return newCount;
            });
        }
     } catch (err) {
        console.error("Failed to log integrity event", err);
     }
  };

  const handleExitEnvironment = () => {
    if (stage === "taking" && isHighSecurity) {
        if (confirm("HIGH SECURITY SESSION: Exiting now will automatically submit your work and terminate this attempt. Continue?")) {
            submitAssessment();
        }
        return;
    }
    router.back();
  };

  const handleStartAssessment = () => {
    if (assessment.is_password_protected) {
      setStage("password");
    } else {
      setStage("readiness");
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setStage("readiness");
  };

  const handleReadinessConfirm = async () => {
    if (!readinessChecked) return;

    try {
      const data = await attemptApi.startAttempt({
        assessment_id: assessmentId,
        password: passwordInput || undefined,
      });
      setAttemptId(data.id);
      setAttemptToken(data.access_token);
      setTimeLeft(data.seconds_remaining || 3600);
      
      const attemptData = await attemptApi.getAttemptDetail(data.id, data.access_token);
      setQuestions(attemptData.questions || []);

      try {
        const subRes = await submissionApi.getSubmissionsForAttempt(data.id);
        const savedAnswers: Record<string, any> = {};
        subRes.submissions?.forEach((s: any) => {
           if (s.answer_type === "SINGLE_OPTION" || s.answer_type === "MULTI_OPTION") {
              savedAnswers[s.question_id] = s.selected_option_ids?.[0] || (s.selected_option_ids?.length > 1 ? s.selected_option_ids : undefined);
           } else if (s.answer_type === "MATCH_PAIRS") {
              savedAnswers[s.question_id] = s.match_pairs_json || {};
           } else if (s.answer_type === "FILL_BLANKS") {
              savedAnswers[s.question_id] = s.fill_blank_answers || {};
           } else if (s.answer_type === "ORDERED_LIST") {
              savedAnswers[s.question_id] = s.ordered_option_ids || [];
           } else {
              savedAnswers[s.question_id] = s.answer_text;
           }
        });
        setAnswers(savedAnswers);
      } catch (e) {
        console.error("Failed to load existing submissions", e);
      }

      setStage("taking");

      if (assessment.fullscreen_required) {
          enterFullscreen();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start attempt. Verify your credentials.");
      if (err.code === "INVALID_PASSWORD") setStage("password");
    }
  };

  const handleAcknowledgeWarning = () => {
    setShowWarningModal(false);
    if (assessment.fullscreen_required && !document.fullscreenElement) {
        enterFullscreen();
    }
  };

  const terminateSession = (reason: string) => {
    setTerminationReason(reason);
    setStage("terminated");
    autoSubmit();
  };

  const autoSubmit = async () => {
     if (!attemptId || !attemptToken) return;
     try {
        await attemptApi.submitAttempt(attemptId, attemptToken, true);
        toast.info("Session ended and responses preserved.");
     } catch (e) {
        console.error("Auto-submit failed", e);
     }
  };

  const submitAssessment = async () => {
    if (!attemptId || !attemptToken) return;
    setSubmitting(true);
    try {
      await attemptApi.submitAttempt(attemptId, attemptToken, true);
      if (document.fullscreenElement) document.exitFullscreen();
      setStage("submitted");
      toast.success("Assessment submitted successfully!");
    } catch (err: any) {
      toast.error(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
      setShowSubmitConfirm(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progress = questions.length > 0 ? (Object.keys(answers).length / questions.length) * 100 : 0;

  const renderQuestion = (q: any) => {
    if (!q) return null;
    const currentVal = answers[q.id];
    const rawType = (q.type || q.question_type || "").toString().toUpperCase();
    const normalizedType = rawType.replace(/[^A-Z0-9]/g, "").toLowerCase();

    const renderDebugBadge = () => (
      <div className="absolute top-2 right-2 opacity-0 hover:opacity-100 transition-opacity">
        <Badge variant="outline" className="text-[8px] font-mono bg-muted/50">
          RAW: {rawType} | NORM: {normalizedType}
        </Badge>
      </div>
    );

    if (
        normalizedType === "mcq" || 
        normalizedType === "mcqs" ||
        normalizedType === "truefalse" || 
        normalizedType === "true_false" ||
        normalizedType === "singleoption" || 
        normalizedType === "multioption" ||
        rawType === "MCQ" || 
        rawType === "TRUE_FALSE" ||
        rawType === "SINGLE_OPTION" ||
        rawType === "MULTI_OPTION"
    ) {
        return (
          <div className="space-y-4 relative">
            {renderDebugBadge()}
            <RadioGroup
              value={currentVal || ""}
              onValueChange={(val) => setAnswers(prev => ({ ...prev, [q.id]: val }))}
              className="grid gap-2.5"
            >
              {q.options?.map((opt: any) => (
                <div key={opt.id} className={cn(
                    "flex items-center space-x-3 p-5 rounded-xl border transition-all cursor-pointer",
                    currentVal === opt.id ? "bg-primary/5 border-primary/20" : "hover:bg-muted/5"
                )}>
                  <RadioGroupItem value={opt.id} id={opt.id} />
                  <Label htmlFor={opt.id} className="flex-1 cursor-pointer font-medium text-[15px] text-foreground/80 leading-snug">
                    {opt.text || opt.option_text || "Option"}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );
    }

    if (normalizedType === "matching" || normalizedType === "matchpairs" || normalizedType === "match_pairs" || rawType === "MATCHING" || rawType === "MATCH_PAIRS") {
        return <MatchingDnd q={q} currentVal={currentVal} setAnswers={setAnswers} renderDebugBadge={renderDebugBadge} />;
    }

    if (normalizedType === "fillblank" || normalizedType === "fillblanks" || normalizedType === "fill_blank" || rawType === "FILL_BLANK" || rawType === "FILL_BLANKS") {
        return <FillInTheBlanksDnd q={q} currentVal={currentVal} setAnswers={setAnswers} renderDebugBadge={renderDebugBadge} />;
    }

    if (normalizedType === "ordering" || normalizedType === "orderedlist" || normalizedType === "ordered_list" || rawType === "ORDERING" || rawType === "ORDERED_LIST") {
        return <OrderingQuestion q={q} currentVal={currentVal} setAnswers={setAnswers} renderDebugBadge={renderDebugBadge} />;
    }

    return (
      <div className="space-y-6 relative">
         {renderDebugBadge()}
         {q.caseStudyContext && (
            <div className="p-5 rounded-xl border border-amber-100 bg-amber-50/30 text-[15px] leading-relaxed italic text-foreground/70 mb-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2 not-italic">Scenario Context</div>
                {q.caseStudyContext}
            </div>
         )}
         <textarea
            className="w-full min-h-[250px] p-6 rounded-xl border bg-muted/5 focus:ring-1 focus:ring-primary/20 outline-none text-base leading-relaxed"
            placeholder={normalizedType === "essay" ? "Compose your detailed response here..." : "Type your response here..."}
            value={currentVal || ""}
            onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
         />
         <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase font-semibold tracking-widest px-1">
            <Shield className="size-3.5 opacity-50" />
            End-to-end encrypted trace active
         </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="h-16 border-b flex items-center px-6 justify-between bg-muted/5">
            <Skeleton className="h-7 w-40 rounded" />
            <div className="flex gap-4">
                <Skeleton className="h-7 w-24 rounded-full" />
                <Skeleton className="h-7 w-28 rounded-full" />
            </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
            <Card className="max-w-lg w-full shadow-none border rounded-xl">
                <CardHeader className="text-center py-10 border-b bg-muted/5">
                    <Skeleton className="h-8 w-3/4 mx-auto rounded" />
                    <Skeleton className="h-4 w-1/2 mx-auto mt-3 rounded opacity-60" />
                </CardHeader>
                <CardContent className="p-10 space-y-8">
                    <div className="grid grid-cols-2 gap-5">
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                    </div>
                    <div className="space-y-4">
                        <Skeleton className="h-4 w-full rounded-full" />
                        <Skeleton className="h-4 w-full rounded-full" />
                        <Skeleton className="h-4 w-2/3 opacity-60 rounded-full" />
                    </div>
                    <Skeleton className="h-11 w-full rounded-lg" />
                </CardContent>
            </Card>
        </div>
      </div>
    );
  }

  if (stage === "terminated") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-red-100 bg-red-50/20 shadow-none rounded-xl overflow-hidden">
          <CardHeader className="text-center py-8">
            <div className="size-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200">
              <AlertTriangle className="size-6 text-red-600" />
            </div>
            <CardTitle className="text-xl font-semibold text-red-700">Session Terminated</CardTitle>
            <CardDescription className="text-[11px] font-bold uppercase tracking-widest text-red-600/60">{terminationReason || "Integrity Violation"}</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 text-center space-y-5">
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                Mindexa Integrity Guard has automatically submitted your attempt to secure your partial responses for review.
            </p>
            <Button onClick={() => router.push("/student/dashboard")} className="w-full h-10 text-xs font-semibold rounded-lg shadow-none" variant="outline">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stage === "submitted") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-sm w-full shadow-none border rounded-xl overflow-hidden">
          <CardContent className="p-10 text-center space-y-5">
            <div className="size-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
              <CheckCircle className="size-7 text-emerald-600" />
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-xl font-semibold text-foreground/90">Session Finalized</CardTitle>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">Your attempt has been securely recorded.</p>
            </div>
            <Button onClick={() => router.push("/student/dashboard")} className="w-full h-10 text-xs font-semibold rounded-lg shadow-sm">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="sm" onClick={handleExitEnvironment} className="h-8 px-2.5 text-[11px] font-bold uppercase tracking-wider gap-2 rounded-md hover:bg-muted/50">
            <ArrowLeft className="size-3.5" /> {isHighSecurity ? "End Session" : "Exit"}
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex flex-col min-w-0">
            <div className="font-semibold text-sm leading-tight truncate max-w-[250px] text-foreground/80">{assessment.title}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="secondary" className="h-4 px-1.5 text-[8px] uppercase font-bold tracking-tight bg-muted/40 border-muted-foreground/5">{assessment.assessment_type}</Badge>
              {assessment.is_supervised && <Badge variant="outline" className="h-4 px-1.5 text-[8px] uppercase font-bold tracking-tight text-primary border-primary/10 bg-primary/5">Secure</Badge>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-md border text-xs font-bold tabular-nums shadow-none transition-colors",
              timeLeft < 300 ? "border-red-100 text-red-600 bg-red-50" : "bg-muted/20 border-muted/40"
          )}>
            <Timer className="size-3.5" />
            <span>{formatTime(timeLeft)}</span>
          </div>

          <div className="hidden md:flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Node {currentQuestionIndex + 1}/{questions.length}
              {lastSaved && <div className="flex items-center gap-1.5 text-emerald-600 font-bold"><Check className="size-3" /> Synced</div>}
          </div>

          <Button onClick={() => setShowSubmitConfirm(true)} variant="destructive" size="sm" className="h-8 text-[11px] font-bold uppercase tracking-wider px-4 rounded-md shadow-none" disabled={stage !== "taking"}>
            Finalize
          </Button>
        </div>
      </div>

      {stage === "intro" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-xl w-full border shadow-none rounded-xl overflow-hidden bg-background/50 hover:border-primary/10 transition-all">
            <CardHeader className="text-center py-8 bg-muted/5 border-b border-muted/20">
                <CardTitle className="text-2xl font-semibold tracking-tight">{assessment.title}</CardTitle>
                <CardDescription className="text-[10px] font-bold mt-1.5 uppercase tracking-widest text-muted-foreground/60">
                    {assessment.assessment_type} Session • {assessment.academic_year}
                </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-muted/50 rounded-xl space-y-1 bg-background">
                    <Label className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">Duration</Label>
                    <div className="text-xl font-bold">{assessment.duration_minutes || 90}m</div>
                </div>
                <div className="p-4 border border-muted/50 rounded-xl space-y-1 bg-background">
                    <Label className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">Total Weight</Label>
                    <div className="text-xl font-bold">{assessment.total_marks || 100}pts</div>
                </div>
              </div>

              <div className="space-y-4">
                  <p className="text-[11px] text-muted-foreground leading-relaxed font-semibold uppercase tracking-tight">
                      {assessment.description || "Adhere to all institutional integrity standards throughout this session."}
                  </p>
                  <div className="rounded-lg border bg-muted/20 p-4 text-[11px] text-muted-foreground leading-relaxed font-semibold">
                    {assessment.result_release_mode === "manual"
                      ? "This assessment includes responses that may require lecturer review before final results are released."
                      : "This assessment is configured for immediate automatic result release once submission processing is complete."}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                      <Badge variant={assessment.is_supervised ? "default" : "outline"} className="h-5 text-[9px] font-bold uppercase tracking-tight rounded-md">
                         {assessment.is_supervised ? "Proctored" : "Self-paced"}
                      </Badge>
                      <Badge variant={assessment.fullscreen_required ? "default" : "outline"} className="h-5 text-[9px] font-bold uppercase tracking-tight rounded-md">
                         {assessment.fullscreen_required ? "Lockdown" : "Open Environment"}
                      </Badge>
                  </div>
              </div>

              <Button onClick={handleStartAssessment} className="w-full h-11 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-none">
                Enter Environment
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "password" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full border shadow-none rounded-xl overflow-hidden bg-background/50 hover:border-primary/10 transition-all">
            <CardHeader className="text-center py-8 bg-muted/5 border-b border-muted/20">
                <div className="size-11 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/10">
                    <Lock className="size-5 text-primary" />
                </div>
                <CardTitle className="text-xl font-semibold tracking-tight">Access Control</CardTitle>
                <CardDescription className="text-[10px] font-bold mt-1.5 uppercase tracking-widest text-muted-foreground/60">
                    Enter session password provided by supervisor
                </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handlePasswordSubmit} className="space-y-6">
                <div className="space-y-2">
                    <Label className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest ml-1">Access Password</Label>
                    <Input
                        type="password"
                        placeholder="••••••••"
                        className="h-11 rounded-lg text-center text-lg font-bold tracking-[0.3em] border-muted/60 bg-background"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        autoFocus
                    />
                </div>
                <Button type="submit" className="w-full h-11 text-[11px] font-bold uppercase tracking-wider rounded-lg shadow-none">
                  Authorize & Continue
                </Button>
                <Button variant="ghost" onClick={() => setStage("intro")} className="w-full h-10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 rounded-lg">
                    Back to Overview
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "readiness" && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full border shadow-none rounded-xl overflow-hidden bg-background/50 hover:border-primary/10 transition-all">
            <CardHeader className="py-6 border-b border-muted/20 bg-muted/5">
              <CardTitle className="text-[13px] font-bold text-center uppercase tracking-widest">Protocol Declaration</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-2.5">
                {[
                  "No tab switching or window exits allowed.",
                  "Fullscreen mode is strictly enforced.",
                  "All activities are cryptographically logged.",
                ].map((text, i) => (
                  <div key={i} className="flex gap-4 p-4 rounded-lg border border-muted/40 bg-background items-center">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span className="text-[11px] font-bold uppercase tracking-tight text-foreground/60">{text}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <Checkbox 
                    id="readiness" 
                    checked={readinessChecked} 
                    onCheckedChange={(c) => setReadinessChecked(!!c)} 
                    className="mt-0.5 size-4 rounded-md border-primary/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary" 
                  />
                  <Label htmlFor="readiness" className="text-[10px] font-bold leading-relaxed cursor-pointer uppercase tracking-tight text-primary/70">
                    I declare that I will complete this assessment independently and adhere to all integrity standards.
                  </Label>
                </div>
                <Button onClick={handleReadinessConfirm} disabled={!readinessChecked} className="w-full h-11 text-[11px] font-bold uppercase tracking-widest rounded-lg shadow-none">
                  Confirm & Begin
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "taking" && (
        <div className="flex-1 flex overflow-hidden bg-muted/5">
          <div className="flex-1 p-6 overflow-y-auto">
            {!isFullscreen && assessment?.fullscreen_required ? (
              <div className="h-full flex flex-col items-center justify-center space-y-8 py-12 max-w-sm mx-auto text-center">
                <Monitor className="size-12 text-red-600 animate-pulse" />
                <div className="space-y-3">
                  <h3 className="text-xl font-bold text-red-600 uppercase tracking-tight">Environment Lost</h3>
                  <p className="text-muted-foreground text-xs font-semibold leading-relaxed">
                    Fullscreen mode is mandatory. Re-enter immediately to avoid automated termination.
                  </p>
                </div>
                <Button onClick={enterFullscreen} variant="destructive" className="h-11 w-full text-[11px] font-bold uppercase tracking-widest rounded-lg shadow-md shadow-red-100">
                  Restore Secure Mode
                </Button>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between px-1">
                    <div className="flex-1 max-w-[250px] space-y-2">
                        <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                            <span>Progress</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5 bg-muted/40" />
                    </div>
                    <Badge variant="outline" className="h-7 px-3 text-emerald-700 border-emerald-100 bg-emerald-50 text-[11px] font-bold rounded-md uppercase">
                        {currentQ?.marks || 0} PTS
                    </Badge>
                </div>

                <Card className="shadow-none border border-muted/40 rounded-xl overflow-hidden bg-background">
                  <CardContent className="p-10">
                    <div className="space-y-6 mb-10">
                        <div className="flex items-start gap-4">
                            <span className="flex-shrink-0 size-8 bg-muted/30 rounded-lg flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                                {currentQuestionIndex + 1}
                            </span>
                            <h2 className="text-lg font-semibold leading-snug text-foreground/80 pt-0.5">
                              {currentQ?.text || currentQ?.content || "Synchronizing Environment..."}
                            </h2>
                        </div>
                        {currentQ?.imageUrl && (
                          <div className="ml-12 p-1.5 border border-muted/30 rounded-xl bg-muted/5 inline-block">
                            <img src={currentQ.imageUrl} alt="Context Media" className="max-h-[320px] rounded-lg object-contain" />
                          </div>
                        )}
                    </div>

                    <div className="ml-12 min-h-[160px]">
                        {renderQuestion(currentQ)}
                    </div>
                  </CardContent>
                  <CardFooter className="bg-muted/5 p-5 flex justify-between border-t border-muted/20">
                    <Button 
                      variant="ghost" 
                      onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))} 
                      disabled={currentQuestionIndex === 0} 
                      className="h-10 px-4 font-bold text-[10px] uppercase tracking-wider text-muted-foreground/70 rounded-lg"
                    >
                        <ArrowLeft className="mr-2 size-3.5" /> Previous
                    </Button>

                    <Button size="sm" onClick={() => {
                        if (currentQuestionIndex < questions.length - 1) {
                            setCurrentQuestionIndex(currentQuestionIndex + 1);
                        } else {
                            setShowSubmitConfirm(true);
                        }
                    }} className="h-10 px-8 font-bold text-[10px] uppercase tracking-widest rounded-lg shadow-none">
                        {currentQuestionIndex === questions.length - 1 ? "Finalize" : "Next"}
                        <ArrowRight className="ml-2 size-3.5" />
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            )}
          </div>

          <div className="w-72 border-l border-muted/20 bg-background p-8 hidden lg:flex flex-col">
            <div className="space-y-1.5 mb-6">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Assessment Map</h3>
                <p className="text-[9px] font-semibold text-muted-foreground/50 uppercase">Session Navigator</p>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              {questions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = idx === currentQuestionIndex;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(idx)}
                    className={cn(
                      "h-9 rounded-lg border text-[11px] font-bold transition-all flex items-center justify-center shadow-none",
                      isCurrent 
                          ? "border-primary bg-primary text-primary-foreground" 
                          : isAnswered 
                              ? "border-emerald-100 bg-emerald-50 text-emerald-700" 
                              : "bg-muted/10 border-muted/20 text-muted-foreground/40 hover:bg-muted/20"
                    )}
                  >
                    {(idx + 1).toString().padStart(2, '0')}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-8 border-t border-dashed border-muted/30">
                <div className="flex items-center gap-2.5 font-bold text-[9px] text-muted-foreground uppercase tracking-widest">
                  <div className="size-1.5 rounded-full bg-primary animate-pulse" /> 
                  Sync Monitor Active
                </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={showWarningModal} onOpenChange={handleAcknowledgeWarning}>
        <DialogContent className="sm:max-w-sm rounded-xl p-8 border-red-50 bg-red-50/50 shadow-2xl border-none">
          <DialogHeader className="text-center space-y-4">
            <div className="size-14 bg-red-100 rounded-full flex items-center justify-center mx-auto border border-red-200">
                <AlertTriangle className="size-7 text-red-600" />
            </div>
            <div className="space-y-1.5">
                <DialogTitle className="text-xl font-bold uppercase tracking-tight text-red-700">Integrity Alert</DialogTitle>
                <DialogDescription className="text-[11px] font-bold uppercase tracking-wider text-red-600/60">
                    Secure environment protocol violation.
                </DialogDescription>
            </div>
          </DialogHeader>
          <div className="py-3 text-center">
            <p className="text-[11px] font-bold text-muted-foreground uppercase leading-relaxed tracking-tight">
                Warning {warnings}/3. Further violations will result in automated termination.
            </p>
          </div>
          <Button onClick={handleAcknowledgeWarning} className="w-full h-11 text-[11px] font-bold uppercase tracking-widest rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-none border-none">
            Acknowledge
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent className="sm:max-w-sm rounded-xl p-8 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="text-center pb-4">
            <DialogTitle className="text-xl font-bold tracking-tight">Finalize Submission?</DialogTitle>
            <DialogDescription className="text-[11px] font-bold uppercase tracking-widest pt-2 text-muted-foreground/60">
              {Object.keys(answers).length} / {questions.length} Items Synchronized
            </DialogDescription>
          </DialogHeader>
          <div className="py-1 text-center">
              <p className="text-[11px] font-semibold text-muted-foreground leading-relaxed uppercase tracking-tight">
                  By finalizing, you confirm that your responses are complete and ready for evaluation.
              </p>
          </div>
          <div className="flex gap-2.5 pt-6">
            <Button variant="ghost" className="flex-1 font-bold h-11 text-[10px] uppercase tracking-widest rounded-lg" onClick={() => setShowSubmitConfirm(false)}>
              Review
            </Button>
            <Button variant="default" className="flex-1 font-bold h-11 text-[10px] uppercase tracking-widest rounded-lg shadow-none" onClick={submitAssessment} disabled={submitting}>
              {submitting ? "Processing..." : "Finalize"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
