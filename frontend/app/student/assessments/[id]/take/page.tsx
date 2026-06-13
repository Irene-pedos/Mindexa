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
  FileText,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  X,
  Bookmark,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { assessmentApi } from "@/lib/api/assessment";
import { attemptApi } from "@/lib/api/attempt";
import { submissionApi } from "@/lib/api/submission";
import { integrityApi } from "@/lib/api/integrity";
import { apiClient } from "@/lib/api/client";
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
import { isHighSecurityAssessment } from "@/lib/grading-architecture";

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
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

type Stage =
  | "intro"
  | "password"
  | "readiness"
  | "taking"
  | "submitted"
  | "terminated";

// --- DnD Components for Matching Pairs ---

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
        "px-3.5 py-2 rounded-lg bg-background border border-primary/20 text-primary font-medium text-xs cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-primary/5 transition-all shadow-sm",
        isDragging && "shadow-md border-primary scale-102",
        isUsed && "opacity-20 grayscale pointer-events-none border-dashed",
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
}: {
  premiseId: string;
  premiseText: string;
  matchedValue?: string;
  onRemove: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `target-${premiseId}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border transition-all duration-200",
        isOver
          ? "bg-primary/5 border-primary"
          : matchedValue
            ? "bg-primary/[0.01] border-primary/25"
            : "bg-background border-muted/70 border-dashed",
      )}
    >
      <div className="flex-1 text-sm font-medium text-foreground/80">
        {premiseText}
      </div>
      <div className="shrink-0 text-muted-foreground/30">
        <ArrowRight className="size-4" />
      </div>
      <div
        className={cn(
          "w-[200px] h-10 rounded-lg border flex items-center justify-center px-3 transition-all relative group",
          matchedValue
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted/10 border-dashed border-muted-foreground/20",
        )}
      >
        {matchedValue ? (
          <>
            <span className="font-semibold text-xs truncate">
              {matchedValue}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="size-3" />
            </button>
          </>
        ) : (
          <span className="text-xs font-medium text-muted-foreground/45 animate-pulse">
            Drop here
          </span>
        )}
      </div>
    </div>
  );
}

function MatchingDnd({ q, currentVal, setAnswers }: any) {
  const matchingAnswers = currentVal || {};

  const premises = useMemo(() => {
    return (q.options || []).filter((o: any) => o.text || o.option_text);
  }, [q.options]);

  const responses = useMemo(() => {
    const raw = (q.options || []).map(
      (o: any) =>
        o.option_text_right || o.match_value || o.text || o.option_text,
    );
    return Array.from(new Set(raw))
      .filter(Boolean)
      .map((text, i) => ({
        id: `resp-${i}`,
        text: text as string,
      }));
  }, [q.options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && over.id.toString().startsWith("target-")) {
      const premiseId = over.id.toString().replace("target-", "");
      const droppedText = active.data.current?.text;

      if (droppedText) {
        setAnswers((prev: any) => ({
          ...prev,
          [q.id]: { ...matchingAnswers, [premiseId]: droppedText },
        }));
      }
    }
  };

  const removeMatch = (premiseId: string) => {
    const newMatches = { ...matchingAnswers };
    delete newMatches[premiseId];
    setAnswers((prev: any) => ({
      ...prev,
      [q.id]: newMatches,
    }));
  };

  const matchedValues = Object.values(matchingAnswers) as string[];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <div className="grid gap-2">
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

        <div className="pt-4 border-t border-dashed border-border/40">
          <div className="flex flex-wrap justify-center gap-2 p-4 rounded-lg bg-muted/5 border border-dashed border-muted/40">
            {responses.map((r) => (
              <DraggableMatchResponse
                key={r.id}
                id={r.id}
                text={r.text}
                isUsed={matchedValues.includes(r.text)}
              />
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}

// --- DnD Components for Fill-in-the-Blanks ---

function DraggableFillBlankAnswer({
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
        "px-3.5 py-2 rounded-lg bg-background border border-primary/20 text-primary font-medium text-xs cursor-grab active:cursor-grabbing hover:border-primary/40 hover:bg-primary/5 transition-all shadow-sm",
        isDragging && "shadow-md border-primary scale-102",
        isUsed && "opacity-20 grayscale pointer-events-none border-dashed",
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
}: {
  index: number;
  value?: string;
  onRemove: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `blank-${index}`,
  });

  return (
    <span
      ref={setNodeRef}
      className={cn(
        "inline-flex items-center justify-center min-w-[110px] h-8 mx-1.5 border-b-2 transition-all px-2.5 relative top-0.5 rounded bg-muted/10",
        isOver
          ? "bg-primary/10 border-primary"
          : value
            ? "bg-primary/[0.03] border-primary/30"
            : "border-muted-foreground/20",
      )}
    >
      {value ? (
        <span
          className="text-primary font-semibold text-sm flex items-center gap-1.5 cursor-pointer group"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          {value}
          <X className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary/60 hover:text-primary" />
        </span>
      ) : (
        <span className="text-muted-foreground/40 text-xs font-medium animate-pulse">
          Drop
        </span>
      )}
    </span>
  );
}

function FillInTheBlanksDnd({ q, currentVal, setAnswers }: any) {
  const rawText = q.text || q.content || "";
  const parts = rawText.split("[blank]");
  const blankAnswers = currentVal || {};

  const pool = useMemo(() => {
    return (q.options || []).map((o: any, i: number) => ({
      id: o.id || `pool-${i}`,
      text: o.option_text || o.text || "",
    }));
  }, [q.options]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && over.id.toString().startsWith("blank-")) {
      const blankIndex = parseInt(over.id.toString().split("-")[1]);
      const droppedText = active.data.current?.text;

      if (droppedText) {
        setAnswers((prev: any) => ({
          ...prev,
          [q.id]: { ...blankAnswers, [blankIndex]: droppedText },
        }));
      }
    }
  };

  const removeAnswer = (index: number) => {
    const newAnswers = { ...blankAnswers };
    delete newAnswers[index];
    setAnswers((prev: any) => ({
      ...prev,
      [q.id]: newAnswers,
    }));
  };

  const usedAnswers = Object.values(blankAnswers) as string[];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        <div className="p-6 rounded-lg border border-border/60 bg-white leading-[2.5] text-[15px] font-medium text-foreground/80">
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

        <div className="flex flex-wrap justify-center gap-2 p-4 rounded-lg bg-muted/5 border border-dashed border-muted/40">
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
    </DndContext>
  );
}

// --- DnD Components for Ordering ---

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
          ? "shadow-md border-primary/40"
          : "hover:border-primary/10 hover:shadow-sm",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="size-7 rounded-lg bg-muted/60 flex items-center justify-center text-xs font-semibold text-muted-foreground cursor-grab active:cursor-grabbing"
      >
        {index + 1}
      </div>
      <div className="flex-1 text-sm font-medium text-foreground/80">
        {text}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onMoveUp}
          disabled={isFirst}
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onMoveDown}
          disabled={isLast}
        >
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function OrderingQuestion({ q, currentVal, setAnswers }: any) {
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
    }),
  );
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = currentOrder.indexOf(active.id);
      const newIndex = currentOrder.indexOf(over.id);
      setAnswers((prev: any) => ({
        ...prev,
        [q.id]: arrayMove(currentOrder, oldIndex, newIndex),
      }));
    }
  };

  return (
    <div className="space-y-3">
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
          <div className="space-y-1.5">
            {currentOrder.map((optId: string, idx: number) => {
              const opt = q.options?.find((o: any) => o.id === optId);
              return (
                <SortableOrderItem
                  key={optId}
                  id={optId}
                  index={idx}
                  text={opt?.text || opt?.option_text || "Sequencing Item"}
                  onMoveUp={() => idx > 0 && moveItem(idx, idx - 1)}
                  onMoveDown={() =>
                    idx < currentOrder.length - 1 && moveItem(idx, idx + 1)
                  }
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

  const [warnings, setWarnings] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [terminationReason, setTerminationReason] = useState<string | null>(
    null,
  );

  const [passwordInput, setPasswordInput] = useState("");
  const [readinessChecked, setReadinessChecked] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const [flaggedQuestions, setFlaggedQuestions] = useState<
    Record<string, boolean>
  >({});
  const [skippedQuestions, setSkippedQuestions] = useState<
    Record<string, boolean>
  >({});
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<
    Record<string, "saving" | "saved" | "failed">
  >({});
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [currentWarning, setCurrentWarning] = useState<any>(null);
  const [warningModalOpen, setWarningModalOpen] = useState(false);

  const timeSpentRef = React.useRef<Record<string, number>>({});
  const lastSavedValuesRef = React.useRef<Record<string, any>>({});
  const warned10mRef = React.useRef(false);
  const warned5mRef = React.useRef(false);
  const isNavigatingRef = React.useRef(false);
  const stageRef = React.useRef<Stage>(stage);

  const currentQ = questions[currentQuestionIndex];
  const isHighSecurity = useMemo(
    () =>
      isHighSecurityAssessment(
        assessment?.assessment_type,
        assessment?.is_supervised,
      ),
    [assessment],
  );

  const getAnswerType = (questionType: string): string => {
    const normalized = (questionType || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");

    const map: Record<string, string> = {
      mcq: "SINGLE_OPTION",
      truefalse: "SINGLE_OPTION",
      true_false: "SINGLE_OPTION",
      singleoption: "SINGLE_OPTION",
      matching: "MATCH_PAIRS",
      ordering: "ORDERED_LIST",
      fillblank: "FILL_BLANKS",
      fillblanks: "FILL_BLANKS",
      fill_blank: "FILL_BLANKS",
      shortanswer: "TEXT",
      short_answer: "TEXT",
      essay: "TEXT",
      casestudy: "TEXT",
      case_study: "TEXT",
      computational: "TEXT",
    };
    return map[normalized] ?? "TEXT";
  };

  const autoSubmit = useCallback(async () => {
    if (!attemptId || !attemptToken) return;
    try {
      await attemptApi.submitAttempt(attemptId, attemptToken, true);
      toast.info("Responses preserved.");
    } catch (e) {
      console.error("Auto-submit failed", e);
    }
  }, [attemptId, attemptToken]);

  const terminateSession = useCallback(
    (reason: string) => {
      setTerminationReason(reason);
      setStage("terminated");
      autoSubmit();
    },
    [autoSubmit],
  );

  const handleIntegrityEvent = useCallback(
    async (type: string, metadata: any = {}) => {
      if (!attemptId || !attemptToken) return;
      try {
        const res = await attemptApi.recordIntegrityEvent(
          attemptId,
          attemptToken,
          type,
          metadata,
        );
        if (res.warning_issued && res.warning) {
          setWarnings((prev) => {
            const newCount = prev + 1;
            if (newCount >= 3) {
              terminateSession(`Warnings exceeded (${type}).`);
            } else {
              setCurrentWarning(res.warning);
              setWarningModalOpen(true);
            }
            return newCount;
          });
        }
      } catch (err) {
        console.error("Failed to record integrity event", err);
      }
    },
    [attemptId, attemptToken, terminateSession],
  );

  // Network Status Tracking & Offline Queue flushing
  const queueLocalSave = useCallback(
    (questionId: string, qType: string, answerVal: any) => {
      if (!attemptId) return;
      const queueKey = `offline_saves_${attemptId}`;
      const newItem = {
        question_id: questionId,
        q_type: qType,
        answer_val: answerVal,
        timestamp: Date.now(),
      };
      try {
        const existingStr = localStorage.getItem(queueKey);
        let queue = [];
        if (existingStr) {
          queue = JSON.parse(existingStr);
        }
        queue = queue.filter((item: any) => item.question_id !== questionId);
        queue.push(newItem);
        localStorage.setItem(queueKey, JSON.stringify(queue));
      } catch (e) {
        console.error("Failed to save answer locally", e);
      }
    },
    [attemptId],
  );

  const saveAnswer = useCallback(
    async (
      questionId: string,
      qType: string,
      answerVal: any,
      changeType: "autosave" | "manual_save" = "autosave",
    ) => {
      if (!attemptId || !attemptToken) return;

      const answerType = getAnswerType(qType);
      const timeOnQuestion = timeSpentRef.current[questionId] || 0;

      const payload: any = {
        attempt_id: attemptId,
        question_id: questionId,
        access_token: attemptToken,
        answer_type: answerType,
        change_type: changeType,
        time_spent_seconds: timeOnQuestion,
      };

      if (answerType === "TEXT") {
        payload.answer_text =
          typeof answerVal === "string"
            ? answerVal
            : answerVal === null || answerVal === undefined
              ? ""
              : JSON.stringify(answerVal);
      } else if (answerType === "SINGLE_OPTION") {
        payload.selected_option_ids = Array.isArray(answerVal)
          ? answerVal
          : answerVal
            ? [answerVal]
            : [];
      } else if (answerType === "ORDERED_LIST") {
        payload.ordered_option_ids = Array.isArray(answerVal) ? answerVal : [];
      } else if (answerType === "MATCH_PAIRS") {
        payload.match_pairs_json = answerVal || {};
      } else if (answerType === "FILL_BLANKS") {
        payload.fill_blank_answers = answerVal || {};
      }

      setSaveStatus((prev) => ({ ...prev, [questionId]: "saving" }));

      try {
        await submissionApi.saveAnswer(payload);
        setSaveStatus((prev) => ({ ...prev, [questionId]: "saved" }));
        setLastSaved(new Date());

        // Remove from local storage offline queue if it exists
        const queueKey = `offline_saves_${attemptId}`;
        const queueStr = localStorage.getItem(queueKey);
        if (queueStr) {
          try {
            const queue = JSON.parse(queueStr);
            const filtered = queue.filter(
              (item: any) => item.question_id !== questionId,
            );
            localStorage.setItem(queueKey, JSON.stringify(filtered));
          } catch (e) {
            console.error(e);
          }
        }
      } catch (err) {
        console.error("Save failed, queueing locally", err);
        setSaveStatus((prev) => ({ ...prev, [questionId]: "failed" }));
        queueLocalSave(questionId, qType, answerVal);
      }
    },
    [attemptId, attemptToken, queueLocalSave],
  );

  const flushOfflineQueue = useCallback(async () => {
    if (!attemptId || !attemptToken) return;
    const queueKey = `offline_saves_${attemptId}`;
    try {
      const queueStr = localStorage.getItem(queueKey);
      if (!queueStr) return;
      const queue = JSON.parse(queueStr);
      if (queue.length === 0) return;

      toast.info("Connection restored — syncing local answers...");

      // Log a RECONNECT integrity event
      await attemptApi.recordIntegrityEvent(
        attemptId,
        attemptToken,
        "RECONNECT",
        {
          offline_saves_count: queue.length,
        },
      );

      for (const item of queue) {
        await saveAnswer(
          item.question_id,
          item.q_type,
          item.answer_val,
          "autosave",
        );
      }

      toast.success("Connection restored — all answers synced");
    } catch (err) {
      console.error("Failed to flush offline queue", err);
    }
  }, [attemptId, attemptToken, saveAnswer]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        flushOfflineQueue();
      }
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, [flushOfflineQueue]);

  // Sync / Load logic: Detect existing attempt on mount (Resume attempt support)
  const syncSavedSubmissions = async (attId: string) => {
    try {
      const subRes = await submissionApi.getSubmissionsForAttempt(attId);
      const savedAnswers: Record<string, any> = {};
      subRes.submissions?.forEach((s: any) => {
        if (s.answer_type === "SINGLE_OPTION")
          savedAnswers[s.question_id] = s.selected_option_ids?.[0];
        else if (s.answer_type === "MATCH_PAIRS")
          savedAnswers[s.question_id] = s.match_pairs_json || {};
        else if (s.answer_type === "FILL_BLANKS")
          savedAnswers[s.question_id] = s.fill_blank_answers || {};
        else if (s.answer_type === "ORDERED_LIST")
          savedAnswers[s.question_id] = s.ordered_option_ids || [];
        else savedAnswers[s.question_id] = s.answer_text;
      });
      setAnswers(savedAnswers);
      lastSavedValuesRef.current = savedAnswers;
    } catch (e) {
      console.error("Failed to sync submissions", e);
      toast.warning("Could not load previously saved answers. Starting fresh.");
    }
  };

  useEffect(() => {
    async function checkExistingSession() {
      try {
        setLoading(true);
        // Load assessment first
        const data = await assessmentApi.getAssessmentById(assessmentId);
        setAssessment(data);

        // Check for student's IN_PROGRESS or PAUSED attempts
        const attemptsRes = await apiClient("/attempts/me");
        const activeAttempt = attemptsRes.items?.find(
          (a: any) =>
            a.assessment_id === assessmentId &&
            (a.status === "IN_PROGRESS" || a.status === "PAUSED"),
        );

        if (activeAttempt) {
          setAttemptId(activeAttempt.id);
          const savedToken = sessionStorage.getItem(
            `attempt_token_${activeAttempt.id}`,
          );

          if (savedToken) {
            if (activeAttempt.status === "PAUSED") {
              try {
                const resumeData = await attemptApi.resumeAttempt(
                  activeAttempt.id,
                  savedToken,
                );
                const newToken = resumeData.access_token;
                setAttemptToken(newToken);
                sessionStorage.setItem(
                  `attempt_token_${activeAttempt.id}`,
                  newToken,
                );
                setExpiresAt(resumeData.expires_at);
                setTimeLeft(resumeData.seconds_remaining || 3600);

                const attemptDetail = await attemptApi.getAttemptDetail(
                  activeAttempt.id,
                  newToken,
                );
                setQuestions(attemptDetail.questions || []);
                await syncSavedSubmissions(activeAttempt.id);
                setStage("taking");
                if (data.fullscreen_required) enterFullscreen();
                toast.success("Attempt resumed successfully.");
              } catch (err: any) {
                toast.error(err.message || "Failed to resume paused attempt.");
                setStage("intro");
              }
            } else {
              // IN_PROGRESS status
              setAttemptToken(savedToken);
              setExpiresAt(activeAttempt.expires_at);
              try {
                const attemptDetail = await attemptApi.getAttemptDetail(
                  activeAttempt.id,
                  savedToken,
                );
                setQuestions(attemptDetail.questions || []);
                await syncSavedSubmissions(activeAttempt.id);
                setStage("taking");
                if (data.fullscreen_required) enterFullscreen();
              } catch (err) {
                toast.error("Session token validation failed.");
                setStage("intro");
              }
            }
          } else {
            toast.info(
              "Active attempt found, but session token is not present on this device.",
            );
            setStage("intro");
          }
        } else {
          setStage("intro");
        }
      } catch (err: any) {
        toast.error("Failed to load assessment context.");
        router.push("/student/assessments");
      } finally {
        setLoading(false);
      }
    }

    if (assessmentId) {
      checkExistingSession();
    }
  }, [assessmentId, router]);

  // WebSocket for real-time integrity reporting
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    if (stage !== "taking" || !attemptId) return;

    stageRef.current = stage;

    let socket: WebSocket | null = null;
    let reconnectTimeout: number | null = null;

    const connectWs = () => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws/integrity/${attemptId}`;
        socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "warning" || data.warning) {
              const warning = data.warning || data;
              setCurrentWarning(warning);
              setWarningModalOpen(true);
            }
          } catch (e) {
            console.error("Failed to parse WebSocket message", e);
          }
        };

        socket.onerror = (err) => {
          console.warn("WebSocket error, falling back to HTTP", err);
        };

        socket.onclose = () => {
          if (stageRef.current === "taking") {
            reconnectTimeout = window.setTimeout(connectWs, 5000);
          }
        };
      } catch (err) {
        console.error("WebSocket initialization failed", err);
      }
    };

    connectWs();

    return () => {
      if (socket) socket.close();
      if (reconnectTimeout !== null) window.clearTimeout(reconnectTimeout);
    };
  }, [stage, attemptId]);

  // Fullscreen enforcement
  useEffect(() => {
    if (stage !== "taking" || !assessment?.fullscreen_required) return;

    const checkFullscreen = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull) {
        handleIntegrityEvent("FULLSCREEN_EXIT");
      }
    };

    setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", checkFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", checkFullscreen);
    };
  }, [stage, assessment?.fullscreen_required, handleIntegrityEvent]);

  // Tab visibility changes
  useEffect(() => {
    if (stage !== "taking" || !isHighSecurity) return;
    const handleVisibilityChange = () => {
      if (document.hidden) handleIntegrityEvent("TAB_SWITCH");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [stage, isHighSecurity, handleIntegrityEvent]);

  // Other monitored browser events
  useEffect(() => {
    if (stage !== "taking") return;

    const handleBlur = () => {
      handleIntegrityEvent("WINDOW_BLUR");
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      const selectedText = window.getSelection()?.toString() || "";
      handleIntegrityEvent("COPY_ATTEMPT", {
        content_length: selectedText.length,
      });
      toast.warning("Copying is disabled during the assessment.");
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      handleIntegrityEvent("PASTE_ATTEMPT");
      toast.warning("Pasting is disabled during the assessment.");
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handleIntegrityEvent("RIGHT_CLICK_ATTEMPT");
      toast.warning("Right-click menu is disabled.");
    };

    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    const handleResize = () => {
      const threshold = 160;
      const widthDiff = Math.abs(window.innerWidth - lastWidth);
      const heightDiff = Math.abs(window.innerHeight - lastHeight);

      if (
        (window.outerWidth - window.innerWidth > threshold ||
          window.outerHeight - window.innerHeight > threshold) &&
        (widthDiff > 50 || heightDiff > 50)
      ) {
        handleIntegrityEvent("DEVTOOLS_DETECTED");
        toast.warning("Developer Tools activity is monitored.");
      }
      lastWidth = window.innerWidth;
      lastHeight = window.innerHeight;
    };

    window.addEventListener("blur", handleBlur);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("resize", handleResize);
    };
  }, [stage, handleIntegrityEvent]);

  // AI Assistance checking
  useEffect(() => {
    if (stage !== "taking" || !assessment) return;

    if (assessment.ai_assistance_allowed === false) {
      const ua = navigator.userAgent.toLowerCase();
      const aiKeywords = [
        "copilot",
        "chatgpt",
        "gemini",
        "sider",
        "monica",
        "harpa",
        "merlin",
        "chathub",
      ];
      const detectedKeyword = aiKeywords.find((kw) => ua.includes(kw));

      const windowKeys = Object.keys(window);
      const extensionKeywords = [
        "gpt",
        "openai",
        "copilot",
        "gemini",
        "monica",
        "sider",
      ];
      const detectedProperty = windowKeys.find((key) =>
        extensionKeywords.some((kw) => key.toLowerCase().includes(kw)),
      );

      if (detectedKeyword || detectedProperty) {
        handleIntegrityEvent("AI_EXTENSION_DETECTED", {
          userAgent: navigator.userAgent,
          detected_keyword: detectedKeyword || null,
          detected_property: detectedProperty || null,
        });
        toast.error(
          "Academic Integrity Alert: AI extensions or assistant tools detected. This event has been logged.",
        );
      }
    }
  }, [stage, assessment, handleIntegrityEvent]);

  // Timer with server deadline countdown
  const saveAllPendingAnswers = useCallback(async () => {
    if (!attemptId || !attemptToken || !questions.length) return;
    for (const q of questions) {
      const currentAnswer = answers[q.id];
      if (
        currentAnswer !== undefined &&
        JSON.stringify(currentAnswer) !==
          JSON.stringify(lastSavedValuesRef.current[q.id])
      ) {
        try {
          await saveAnswer(q.id, q.type, currentAnswer, "manual_save");
          lastSavedValuesRef.current[q.id] = currentAnswer;
        } catch (e) {
          console.error(`Failed to save pending answer for ${q.id}`, e);
        }
      }
    }
  }, [attemptId, attemptToken, questions, answers, saveAnswer]);

  const handleAutoSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await saveAllPendingAnswers();
      await attemptApi.submitAttempt(attemptId!, attemptToken!, true);
      setStage("submitted");
      router.push(`/student/assessments/${assessmentId}/submitted`);
    } catch (err) {
      // Even on error, redirect - backend will auto-submit via Celery
      setStage("submitted");
      router.push(`/student/assessments/${assessmentId}/submitted`);
    }
  }, [attemptId, attemptToken, assessmentId, saveAllPendingAnswers, router]);

  useEffect(() => {
    if (stage !== "taking" || !expiresAt) return;

    const calculateTimeRemaining = () => {
      const expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.getTime())) {
        console.error("Invalid expiry timestamp for attempt", expiresAt);
        setTimeLeft(0);
        return;
      }

      const remaining = Math.max(
        0,
        Math.floor((expiry.getTime() - Date.now()) / 1000),
      );
      setTimeLeft(remaining);

      if (remaining <= 600 && remaining > 300 && !warned10mRef.current) {
        warned10mRef.current = true;
        toast.warning("10 minutes remaining in this assessment session.");
      }
      if (remaining <= 300 && remaining > 0 && !warned5mRef.current) {
        warned5mRef.current = true;
        toast.error(
          "Critical: 5 minutes remaining! Your attempt will auto-finalize on expiry.",
        );
      }

      if (remaining <= 0) {
        handleAutoSubmit();
      }
    };

    calculateTimeRemaining();
    const timer = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(timer);
  }, [stage, expiresAt, handleAutoSubmit]);

  // Timer spent per question tracking
  useEffect(() => {
    if (stage !== "taking" || !currentQ) return;
    const interval = setInterval(() => {
      const qId = currentQ.id;
      timeSpentRef.current[qId] = (timeSpentRef.current[qId] || 0) + 1;
    }, 1000);
    return () => clearInterval(interval);
  }, [stage, currentQ]);

  // Debounced Autosave
  useEffect(() => {
    if (stage !== "taking" || !currentQ) return;
    const currentAnswer = answers[currentQ.id];
    if (currentAnswer === undefined) return;
    if (
      JSON.stringify(currentAnswer) ===
      JSON.stringify(lastSavedValuesRef.current[currentQ.id])
    ) {
      return;
    }

    const timer = setTimeout(() => {
      saveAnswer(currentQ.id, currentQ.type, currentAnswer, "autosave");
      lastSavedValuesRef.current[currentQ.id] = currentAnswer;
    }, 3000);

    return () => clearTimeout(timer);
  }, [answers, currentQ, stage, saveAnswer]);

  // Heartbeat Autosave (30s)
  useEffect(() => {
    if (stage !== "taking") return;

    const interval = setInterval(async () => {
      if (currentQ) {
        const currentAnswer = answers[currentQ.id];
        if (currentAnswer !== undefined) {
          await saveAnswer(
            currentQ.id,
            currentQ.type,
            currentAnswer,
            "autosave",
          );
          lastSavedValuesRef.current[currentQ.id] = currentAnswer;
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [stage, currentQ, answers, saveAnswer]);

  // Navigation save
  const navigateToQuestion = useCallback(
    async (newIndex: number) => {
      if (newIndex === currentQuestionIndex || isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      try {
        const q = currentQ;
        if (q) {
          const qId = q.id;
          const qType = q.type;
          const currentAnswer = answers[qId];

          if (
            currentAnswer !== undefined &&
            JSON.stringify(currentAnswer) !==
              JSON.stringify(lastSavedValuesRef.current[qId])
          ) {
            await saveAnswer(qId, qType, currentAnswer, "manual_save");
            lastSavedValuesRef.current[qId] = currentAnswer;
          }
        }

        setCurrentQuestionIndex(newIndex);
      } finally {
        isNavigatingRef.current = false;
      }
    },
    [currentQuestionIndex, currentQ, answers, saveAnswer],
  );

  const submitAssessment = useCallback(async () => {
    if (!attemptId || !attemptToken) return;
    setSubmitting(true);
    try {
      await saveAllPendingAnswers();
      await attemptApi.submitAttempt(attemptId, attemptToken, true);
      if (typeof document !== "undefined" && document.fullscreenElement)
        document.exitFullscreen();
      setStage("submitted");
      toast.success("Submitted successfully.");
    } catch (err: any) {
      toast.error("Submission failed.");
    } finally {
      setSubmitting(false);
      setShowSubmitConfirm(false);
    }
  }, [attemptId, attemptToken, saveAllPendingAnswers]);

  const enterFullscreen = () => {
    document.documentElement
      .requestFullscreen()
      .catch(() => toast.error("Fullscreen denied."));
  };

  const handleExitEnvironment = () => {
    if (stage === "taking" && isHighSecurity) {
      if (!confirm("TERMINATE SESSION?")) return;
      submitAssessment();
      return;
    }
    router.back();
  };

  const handleStartAssessment = () => {
    if (assessment.is_password_protected) setStage("password");
    else setStage("readiness");
  };
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput) setStage("readiness");
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
      localStorage.setItem(`attempt_token_${data.id}`, data.access_token);
      setExpiresAt(data.expires_at);
      setTimeLeft(data.seconds_remaining || 3600);
      const attemptData = await attemptApi.getAttemptDetail(
        data.id,
        data.access_token,
      );
      setQuestions(attemptData.questions || []);
      const savedAnswers: Record<string, any> = {};
      try {
        const subRes = await submissionApi.getSubmissionsForAttempt(data.id);
        subRes.submissions?.forEach((s: any) => {
          if (s.answer_type === "SINGLE_OPTION")
            savedAnswers[s.question_id] = s.selected_option_ids?.[0];
          else if (s.answer_type === "MATCH_PAIRS")
            savedAnswers[s.question_id] = s.match_pairs_json || {};
          else if (s.answer_type === "FILL_BLANKS")
            savedAnswers[s.question_id] = s.fill_blank_answers || {};
          else if (s.answer_type === "ORDERED_LIST")
            savedAnswers[s.question_id] = s.ordered_option_ids || [];
          else savedAnswers[s.question_id] = s.answer_text;
        });
        setAnswers(savedAnswers);
        lastSavedValuesRef.current = savedAnswers;
      } catch (e) {
        console.error(e);
      }
      setStage("taking");
      if (assessment.fullscreen_required) enterFullscreen();
    } catch (err: any) {
      toast.error("Start failed. Check credentials.");
      if (err.code === "INVALID_PASSWORD") setStage("password");
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getAssessmentTypeLabel = (type: string) => {
    if (!type) return "";
    switch (type.toLowerCase()) {
      case "cat":
        return "Continuous Assessment Test";
      case "assignment":
        return "Assignment";
      case "summative":
        return "Summative Exam";
      default:
        return type;
    }
  };
  const progress =
    questions.length > 0
      ? (Object.keys(answers).length / questions.length) * 100
      : 0;

  const renderQuestion = (q: any) => {
    if (!q) return null;
    const currentVal = answers[q.id];
    const type = (q.type || q.question_type || "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (type === "mcq" || type === "truefalse" || type === "singleoption") {
      return (
        <RadioGroup
          value={currentVal || ""}
          onValueChange={(val) =>
            setAnswers((prev) => ({ ...prev, [q.id]: val }))
          }
          className="grid gap-1.5"
        >
          {q.options?.map((opt: any) => (
            <div
              key={opt.id}
              className={cn(
                "flex items-center space-x-3 p-3 rounded-md border transition-all cursor-pointer",
                currentVal === opt.id
                  ? "bg-primary/[0.03] border-primary/20"
                  : "hover:bg-muted/5",
              )}
            >
              <RadioGroupItem value={opt.id} id={opt.id} className="size-4" />
              <Label
                htmlFor={opt.id}
                className="flex-1 cursor-pointer font-medium text-[13px] text-foreground/80"
              >
                {opt.text || opt.option_text || "Option"}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    }
    if (type === "matching")
      return (
        <MatchingDnd q={q} currentVal={currentVal} setAnswers={setAnswers} />
      );
    if (type === "fillblank" || type === "fillblanks")
      return (
        <FillInTheBlanksDnd
          q={q}
          currentVal={currentVal}
          setAnswers={setAnswers}
        />
      );
    if (type === "ordering")
      return (
        <OrderingQuestion
          q={q}
          currentVal={currentVal}
          setAnswers={setAnswers}
        />
      );

    return (
      <div className="space-y-4">
        {q.caseStudyContext && (
          <div className="p-4 rounded-md border border-amber-100 bg-amber-50/20 text-[13px] leading-relaxed italic text-foreground/70">
            {q.caseStudyContext}
          </div>
        )}
        <textarea
          className="w-full min-h-[200px] p-4 rounded-md border bg-background focus:border-primary/40 outline-none text-sm leading-relaxed"
          placeholder="Composition..."
          value={currentVal || ""}
          onChange={(e) =>
            setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
          }
        />
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground uppercase font-bold tracking-widest px-0.5 opacity-40">
          <Shield className="size-3" /> Secure Trace Active
        </div>
      </div>
    );
  };

  if (loading)
    return (
      <div className="min-h-screen bg-background flex flex-col p-8 items-center justify-center animate-pulse">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-48 w-full max-w-lg rounded-xl mt-4" />
      </div>
    );

  if (stage === "terminated")
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-destructive/20 bg-destructive/5 shadow-none rounded-xl overflow-hidden text-center">
          <CardHeader className="py-6 border-b border-destructive/10 bg-destructive/10">
            <AlertTriangle className="size-8 text-destructive mx-auto mb-2" />
            <CardTitle className="text-xl font-semibold text-destructive tracking-tight">
              Session Terminated
            </CardTitle>
            <CardDescription className="text-sm font-medium text-destructive/85">
              {terminationReason}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your responses have been securely recorded. The session has been
              closed due to security protocol enforcement.
            </p>
            <Button
              onClick={() => router.push("/student/dashboard")}
              className="w-full h-10 text-xs font-medium rounded-lg shadow-sm"
              variant="outline"
            >
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  if (stage === "submitted")
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-none border rounded-xl overflow-hidden text-center">
          <CardContent className="p-8 space-y-5">
            <CheckCircle className="size-12 text-emerald-500 mx-auto" />
            <div className="space-y-1.5">
              <CardTitle className="text-xl font-semibold tracking-tight">
                Assessment Finalized
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Your assessment attempt has been successfully and securely
                recorded.
              </p>
            </div>
            <Button
              onClick={() => router.push("/student/dashboard")}
              className="w-full h-10 text-xs font-medium rounded-lg shadow-sm bg-primary hover:bg-primary/90"
            >
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {!isOnline && (
        <div className="bg-amber-500 text-white py-2 px-6 text-center text-xs font-semibold tracking-wider flex items-center justify-center gap-2 z-50">
          <WifiOff className="size-3.5 animate-pulse" />
          Connection lost — your answers are being saved locally
        </div>
      )}
      {assessment?.ai_assistance_allowed === false && stage === "taking" && (
        <div className="bg-destructive/10 border-b border-destructive/25 text-destructive py-2 px-6 text-center text-xs font-semibold tracking-wider flex items-center justify-center gap-2 z-50">
          <Shield className="size-3.5" />
          AI assistance is not permitted in this assessment. All assistant tools
          and extensions are strictly blocked.
        </div>
      )}
      <div className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExitEnvironment}
            className="h-8 px-3 text-xs font-medium border border-border/60 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-3.5 mr-1" />{" "}
            {isHighSecurity ? "Terminate" : "Exit"}
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate max-w-[240px] text-foreground/95">
              {assessment.title}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-lg border text-sm font-semibold tabular-nums",
              timeLeft <= 300
                ? "border-destructive/20 text-destructive bg-destructive/10 animate-pulse"
                : timeLeft <= 600
                  ? "border-amber-500/20 text-amber-600 bg-amber-50"
                  : "bg-muted/40 border-border/60 text-foreground/80",
            )}
          >
            <Timer className="size-4" /> {formatTime(timeLeft)}
          </div>
          <Button
            onClick={() => setShowSubmitConfirm(true)}
            variant="destructive"
            size="sm"
            className="h-8 text-xs font-medium px-4 rounded-lg shadow-sm transition-all"
            disabled={stage !== "taking"}
          >
            Finalize
          </Button>
        </div>
      </div>

      {stage === "intro" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-xl w-full border border-border/50 shadow-none rounded-xl overflow-hidden bg-background">
            <CardHeader className="text-center py-6 bg-muted/20 border-b border-border/40">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {assessment.title}
              </CardTitle>
              <CardDescription className="text-xs font-medium mt-1.5 text-muted-foreground/70">
                {getAssessmentTypeLabel(assessment.assessment_type)} • Academic
                Year {assessment.academic_year}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 border border-border/60 rounded-xl bg-muted/5">
                  <p className="text-xs text-muted-foreground/80 font-medium mb-1">
                    Duration
                  </p>
                  <p className="text-xl font-semibold tabular-nums text-foreground">
                    {assessment.duration_minutes || 90} Mins
                  </p>
                </div>
                <div className="p-4 border border-border/60 rounded-xl bg-muted/5">
                  <p className="text-xs text-muted-foreground/80 font-medium mb-1">
                    Total Marks
                  </p>
                  <p className="text-xl font-semibold tabular-nums text-foreground">
                    {assessment.total_marks || 100} Points
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {assessment.description ||
                    "Institutional integrity standards apply to this evaluation session."}
                </p>
                <div className="flex gap-2 pt-1.5">
                  <Badge
                    variant="outline"
                    className="h-6 px-2.5 text-xs font-medium rounded-full border-border/80 text-muted-foreground"
                  >
                    {assessment.is_supervised ? "Proctored" : "Self-paced"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="h-6 px-2.5 text-xs font-medium rounded-full border-border/80 text-muted-foreground"
                  >
                    {assessment.fullscreen_required
                      ? "Lockdown Mode"
                      : "Open Environment"}
                  </Badge>
                </div>
              </div>
              <Button
                onClick={handleStartAssessment}
                className="w-full h-10 text-sm font-semibold rounded-lg shadow-sm bg-primary hover:bg-primary/90"
              >
                Initialize Assessment Session
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "password" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full border border-border/50 shadow-none rounded-xl overflow-hidden bg-background">
            <CardHeader className="text-center py-6 bg-muted/20 border-b border-border/40">
              <CardTitle className="text-base font-semibold tracking-tight text-foreground">
                Access Control Required
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground/75 mt-1">
                Enter the session password provided by the instructor to
                authorize access.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-center">
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <Input
                  type="password"
                  placeholder="SESSION PASSWORD"
                  className="h-11 rounded-lg text-center text-lg font-semibold tracking-[0.4em] border-border/60 bg-background/50 hover:bg-background/80 focus:bg-background transition-all"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  autoFocus
                />
                <Button
                  type="submit"
                  className="w-full h-10 text-xs font-medium rounded-lg shadow-sm"
                >
                  Authorize Access
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "readiness" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full border border-border/50 shadow-none rounded-xl overflow-hidden bg-background">
            <CardHeader className="py-4 border-b bg-muted/20 border-border/40 text-center">
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Protocol Declaration
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                {[
                  "Locked evaluation environment.",
                  "Comprehensive activity logging active.",
                  "Termination protocols strictly enforced.",
                ].map((text, i) => (
                  <div
                    key={i}
                    className="flex gap-3 p-3 rounded-lg border border-border/40 bg-muted/5 items-center"
                  >
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    <span className="text-xs font-medium text-foreground/75">
                      {text}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <Checkbox
                    id="readiness"
                    checked={readinessChecked}
                    onCheckedChange={(c) => setReadinessChecked(!!c)}
                    className="mt-0.5 size-4 rounded border-primary/30"
                  />
                  <Label
                    htmlFor="readiness"
                    className="text-xs font-medium leading-relaxed cursor-pointer text-primary/80 select-none"
                  >
                    I declare and commit adherence to the institutional academic
                    integrity standards.
                  </Label>
                </div>
                <Button
                  onClick={handleReadinessConfirm}
                  disabled={!readinessChecked}
                  className="w-full h-10 text-sm font-semibold rounded-lg shadow-sm"
                >
                  Commit & Begin Assessment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "taking" && (
        <div className="flex-1 flex overflow-hidden bg-muted/[0.01]">
          <div className="flex-1 p-4 md:p-6 overflow-y-auto">
            {!isFullscreen && assessment?.fullscreen_required ? (
              <div className="h-full flex flex-col items-center justify-center space-y-6 text-center max-w-sm mx-auto">
                <Monitor className="size-12 text-destructive animate-pulse" />
                <p className="text-sm font-semibold text-destructive leading-relaxed">
                  Secure environment lost. Please restore secure full-screen
                  mode immediately to continue.
                </p>
                <Button
                  onClick={enterFullscreen}
                  variant="destructive"
                  className="h-10 w-full text-xs font-medium rounded-lg shadow-md shadow-destructive/10"
                >
                  Restore Secure Environment
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between px-0.5">
                  <div className="flex-1 max-w-[200px] space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground/80">
                      <span>Sync Progress</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress
                      value={progress}
                      className="h-1.5 bg-muted/20 rounded-full"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    {saveStatus[currentQ?.id] === "saving" && (
                      <span className="text-xs text-muted-foreground animate-pulse">
                        Saving...
                      </span>
                    )}
                    {saveStatus[currentQ?.id] === "saved" && (
                      <span className="text-xs text-emerald-600 font-medium">
                        Saved
                      </span>
                    )}
                    {saveStatus[currentQ?.id] === "failed" && (
                      <span className="text-xs text-amber-600 font-medium">
                        Save failed — retrying
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className="h-6 px-2.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shadow-none"
                    >
                      {currentQ?.marks || 0} Points
                    </Badge>
                  </div>
                </div>

                <Card className="shadow-none border border-border/50 rounded-xl overflow-hidden bg-background">
                  <CardHeader className="py-3 px-6 border-b bg-muted/[0.02] flex flex-row items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                      {currentQ?.section_title || "General Section"}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (currentQ) {
                            setFlaggedQuestions((prev) => ({
                              ...prev,
                              [currentQ.id]: !prev[currentQ.id],
                            }));
                          }
                        }}
                        className={cn(
                          "h-7 px-2 text-xs gap-1 hover:bg-muted/50 rounded-lg transition-colors",
                          flaggedQuestions[currentQ?.id]
                            ? "text-amber-600 bg-amber-500/10"
                            : "text-muted-foreground/60",
                        )}
                      >
                        <Bookmark className="size-3.5" />
                        {flaggedQuestions[currentQ?.id]
                          ? "Flagged"
                          : "Flag for review"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (currentQ) {
                            setSkippedQuestions((prev) => ({
                              ...prev,
                              [currentQ.id]: !prev[currentQ.id],
                            }));
                          }
                        }}
                        className={cn(
                          "h-7 px-2 text-xs gap-1 hover:bg-muted/50 rounded-lg transition-colors",
                          skippedQuestions[currentQ?.id]
                            ? "text-destructive bg-destructive/10"
                            : "text-muted-foreground/60",
                        )}
                      >
                        <AlertTriangle className="size-3.5" />
                        {skippedQuestions[currentQ?.id]
                          ? "Skipped"
                          : "Mark as Skipped"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 md:p-10">
                    <div className="space-y-4 mb-8">
                      <div className="flex items-start gap-3.5">
                        <span className="size-7 bg-muted/60 rounded-lg flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                          {currentQuestionIndex + 1}
                        </span>
                        <h2 className="text-lg font-medium leading-relaxed text-foreground/90">
                          {currentQ?.text || currentQ?.content}
                        </h2>
                      </div>
                      {currentQ?.imageUrl && (
                        <div className="ml-10.5 p-1 border border-border/40 rounded-xl bg-muted/5 inline-block">
                          <img
                            src={currentQ.imageUrl}
                            alt="Context"
                            className="max-h-[240px] rounded-lg object-contain"
                          />
                        </div>
                      )}
                    </div>
                    <div className="ml-10.5 min-h-[120px]">
                      {renderQuestion(currentQ)}
                    </div>
                  </CardContent>
                  <CardFooter className="bg-muted/5 p-4 flex justify-between border-t border-border/40">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        navigateToQuestion(
                          Math.max(0, currentQuestionIndex - 1),
                        )
                      }
                      disabled={currentQuestionIndex === 0}
                      className="h-9 px-4 font-medium text-xs text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors"
                    >
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (currentQuestionIndex < questions.length - 1) {
                          await navigateToQuestion(currentQuestionIndex + 1);
                        } else {
                          // Save current question before final submission modal
                          if (currentQ) {
                            const currentAnswer = answers[currentQ.id];
                            if (currentAnswer !== undefined) {
                              await saveAnswer(
                                currentQ.id,
                                currentQ.type,
                                currentAnswer,
                                "manual_save",
                              );
                              lastSavedValuesRef.current[currentQ.id] =
                                currentAnswer;
                            }
                          }
                          setShowSubmitConfirm(true);
                        }
                      }}
                      className="h-9 px-6 font-semibold text-xs rounded-lg shadow-none"
                    >
                      {currentQuestionIndex === questions.length - 1
                        ? "Finalize Attempt"
                        : "Next Question"}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            )}
          </div>

          <div className="w-60 border-l border-border/40 bg-background p-5 hidden lg:flex flex-col">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-4 px-1">
              Assessment Matrix
            </h3>
            <div className="space-y-5 overflow-y-auto pr-1 pb-6">
              {Array.from(
                new Set(questions.map((q) => q.assessment_section_id)),
              ).map((sectionId) => {
                const sectionQuestions = questions.filter(
                  (q) => q.assessment_section_id === sectionId,
                );
                const firstQuestion = sectionQuestions[0];
                const sectionTitle =
                  firstQuestion?.section_title || "General Section";
                return (
                  <div key={sectionId || "gen"} className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground/75 px-1 truncate">
                      {sectionTitle}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {sectionQuestions.map((q) => {
                        const idx = questions.findIndex((gq) => gq.id === q.id);
                        const isAnswered = !!answers[q.id];
                        const isCurrent = idx === currentQuestionIndex;
                        const isFlagged = flaggedQuestions[q.id];
                        const isSkipped = skippedQuestions[q.id];

                        let statusColor =
                          "bg-muted/10 border-border/40 text-muted-foreground/60 hover:bg-muted/20";
                        if (isAnswered) {
                          if (isFlagged) {
                            statusColor =
                              "border-amber-500/20 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20";
                          } else if (isSkipped) {
                            statusColor =
                              "border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/20";
                          } else {
                            statusColor =
                              "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20";
                          }
                        } else {
                          if (isFlagged) {
                            statusColor =
                              "border-amber-500/20 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20";
                          } else if (isSkipped) {
                            statusColor =
                              "border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/20";
                          }
                        }

                        return (
                          <button
                            key={q.id}
                            onClick={() => navigateToQuestion(idx)}
                            className={cn(
                              "h-8 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center",
                              isCurrent
                                ? "ring-2 ring-primary ring-offset-1 border-primary bg-primary text-primary-foreground"
                                : statusColor,
                            )}
                          >
                            {(idx + 1).toString().padStart(2, "0")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-auto pt-4 border-t border-dashed border-border/40">
              <div className="flex items-center gap-2 font-medium text-xs text-muted-foreground/50">
                <div className="size-2 rounded-full bg-primary animate-pulse" />{" "}
                Secure Sync Live
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={warningModalOpen} onOpenChange={undefined}>
        <DialogContent className="sm:max-w-md p-6 border-none shadow-2xl rounded-xl text-center bg-background">
          <AlertTriangle className="size-10 text-destructive mx-auto mb-3" />
          <DialogTitle className="text-lg font-semibold text-destructive tracking-tight">
            Integrity Protocols Alert
          </DialogTitle>
          <p className="text-sm text-muted-foreground py-4 leading-relaxed">
            {currentWarning?.message || "Academic integrity warning issued."}
            {currentWarning?.warning_level === "WARNING_2" && (
              <span className="block mt-2 font-semibold text-xs text-amber-600 uppercase tracking-wider">
                Note: Your supervisor has been notified of this activity.
              </span>
            )}
            {currentWarning?.warning_level === "WARNING_3" && (
              <span className="block mt-2 font-semibold text-xs text-red-600 uppercase tracking-wider">
                Critical: Your attempt has been flagged. Continued violations
                will terminate the session.
              </span>
            )}
          </p>
          <Button
            onClick={async () => {
              if (currentWarning) {
                try {
                  await integrityApi.acknowledgeWarning({
                    warning_id: currentWarning.id,
                    access_token: attemptToken!,
                  });
                  setWarningModalOpen(false);
                } catch (e) {
                  toast.error("Failed to acknowledge warning.");
                }
              }
            }}
            className="w-full h-10 text-xs font-semibold rounded-lg shadow-none bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            I Understand
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent className="sm:max-w-md p-6 border-none shadow-xl rounded-xl bg-background">
          <DialogHeader className="text-center">
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
              Review & Submit Assessment
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Please review your completion status before finalizing your
              attempt.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-3 py-2 border-y border-border/40">
            <div className="grid grid-cols-2 gap-2 text-xs font-medium text-left">
              <div className="p-3 bg-muted/20 border border-border/60 rounded-lg flex flex-col justify-between">
                <span className="text-muted-foreground">Total Questions</span>
                <span className="text-base font-bold text-foreground mt-1">
                  {questions.length}
                </span>
              </div>
              <div className="p-3 bg-emerald-50/20 border border-emerald-500/10 rounded-lg flex flex-col justify-between">
                <span className="text-emerald-600">Answered</span>
                <span className="text-base font-bold text-emerald-600 mt-1">
                  {questions.filter((q) => !!answers[q.id]).length}
                </span>
              </div>
              <div className="p-3 bg-amber-50/20 border border-amber-500/10 rounded-lg flex flex-col justify-between">
                <span className="text-amber-600">Flagged for Review</span>
                <span className="text-base font-bold text-amber-600 mt-1">
                  {questions.filter((q) => flaggedQuestions[q.id]).length}
                </span>
              </div>
              <div className="p-3 bg-red-50/20 border border-red-500/10 rounded-lg flex flex-col justify-between">
                <span className="text-red-600">Skipped Explicitly</span>
                <span className="text-base font-bold text-red-600 mt-1">
                  {questions.filter((q) => skippedQuestions[q.id]).length}
                </span>
              </div>
            </div>

            {questions.length -
              questions.filter((q) => !!answers[q.id]).length >
              0 && (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/15 flex items-start gap-2.5 text-left">
                <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                <span className="text-xs text-destructive font-medium leading-relaxed">
                  Warning: You have{" "}
                  {questions.length -
                    questions.filter((q) => !!answers[q.id]).length}{" "}
                  unanswered{" "}
                  {questions.length -
                    questions.filter((q) => !!answers[q.id]).length ===
                  1
                    ? "question"
                    : "questions"}
                  .
                </span>
              </div>
            )}

            <p className="text-xs text-muted-foreground/90 font-medium text-center pt-1 leading-relaxed">
              Are you sure you want to submit? This action is final and cannot
              be undone.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-10 text-xs font-medium rounded-lg"
              onClick={() => setShowSubmitConfirm(false)}
            >
              Review answers
            </Button>
            <Button
              className="flex-1 h-10 text-xs font-semibold rounded-lg shadow-none bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={submitAssessment}
              disabled={submitting}
            >
              Confirm submission
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
