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
        isDragging ? "shadow-md border-primary/40" : "hover:border-primary/10 hover:shadow-sm",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="size-7 rounded-lg bg-muted/60 flex items-center justify-center text-xs font-semibold text-muted-foreground cursor-grab active:cursor-grabbing"
      >
        {index + 1}
      </div>
      <div className="flex-1 text-sm font-medium text-foreground/80">{text}</div>
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

  const currentQ = questions[currentQuestionIndex];
  const isHighSecurity = useMemo(
    () =>
      isHighSecurityAssessment(
        assessment?.assessment_type,
        assessment?.is_supervised,
      ),
    [assessment],
  );

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
    async (type: string) => {
      if (!attemptId || !attemptToken) return;
      try {
        const { warning } = await attemptApi.recordIntegrityEvent(
          attemptId,
          attemptToken,
          type,
        );
        if (warning) {
          setWarnings((prev) => {
            const newCount = prev + 1;
            if (newCount >= 3) terminateSession(`Warnings exceeded (${type}).`);
            else setShowWarningModal(true);
            return newCount;
          });
        }
      } catch (err) {
        console.error(err);
      }
    },
    [attemptId, attemptToken, terminateSession],
  );

  useEffect(() => {
    async function loadAssessment() {
      try {
        setLoading(true);
        const data = await assessmentApi.getAssessmentById(assessmentId);
        setAssessment(data);
      } catch (err: any) {
        toast.error("Failed to load context.");
        router.push("/student/assessments");
      } finally {
        setLoading(false);
      }
    }
    loadAssessment();
  }, [assessmentId, router]);

  useEffect(() => {
    if (stage !== "taking" || !assessment?.fullscreen_required) return;
    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull && stage === "taking")
        handleIntegrityEvent("FULLSCREEN_EXIT");
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [stage, assessment, handleIntegrityEvent]);

  useEffect(() => {
    if (stage !== "taking" || !isHighSecurity) return;
    const handleVisibilityChange = () => {
      if (document.hidden) handleIntegrityEvent("TAB_SWITCH");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [stage, isHighSecurity, handleIntegrityEvent]);

  const submitAssessment = useCallback(async () => {
    if (!attemptId || !attemptToken) return;
    setSubmitting(true);
    try {
      await attemptApi.submitAttempt(attemptId, attemptToken, true);
      if (typeof document !== "undefined" && document.fullscreenElement) document.exitFullscreen();
      setStage("submitted");
      toast.success("Submitted.");
    } catch (err: any) {
      toast.error("Submission failed.");
    } finally {
      setSubmitting(false);
      setShowSubmitConfirm(false);
    }
  }, [attemptId, attemptToken]);

  useEffect(() => {
    if (stage !== "taking" || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          submitAssessment();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [stage, timeLeft, submitAssessment]);

  const saveAnswer = useCallback(
    async (questionId: string, qType: string, answerVal: any) => {
      if (!attemptId || !attemptToken) return;
      const typeMap: Record<string, string> = {
        shortanswer: "TEXT",
        shortanswers: "TEXT",
        mcq: "SINGLE_OPTION",
        truefalse: "SINGLE_OPTION",
        matching: "MATCH_PAIRS",
        fillblank: "FILL_BLANKS",
        fillblanks: "FILL_BLANKS",
        ordering: "ORDERED_LIST",
      };
      const normalizedType = (qType || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const answerType = typeMap[normalizedType] || "TEXT";
      const payload: any = {
        attempt_id: attemptId,
        question_id: questionId,
        access_token: attemptToken,
        answer_type: answerType,
        change_type: "autosave",
      };
      if (answerType === "TEXT")
        payload.answer_text =
          typeof answerVal === "string" ? answerVal : JSON.stringify(answerVal);
      else if (answerType === "SINGLE_OPTION")
        payload.selected_option_ids = Array.isArray(answerVal)
          ? answerVal
          : [answerVal];
      else if (answerType === "ORDERED_LIST")
        payload.ordered_option_ids = Array.isArray(answerVal) ? answerVal : [];
      else if (answerType === "MATCH_PAIRS")
        payload.match_pairs_json = answerVal || {};
      else if (answerType === "FILL_BLANKS")
        payload.fill_blank_answers = answerVal || {};
      try {
        await submissionApi.saveAnswer(payload);
        setLastSaved(new Date());
      } catch (err) {
        console.error(err);
      }
    },
    [attemptId, attemptToken],
  );

  useEffect(() => {
    if (stage !== "taking") return;
    const currentAnswer = answers[currentQ?.id];
    if (currentAnswer !== undefined) {
      const timeout = setTimeout(
        () => saveAnswer(currentQ.id, currentQ.type, currentAnswer),
        2000,
      );
      return () => clearTimeout(timeout);
    }
  }, [answers, currentQuestionIndex, stage, saveAnswer, currentQ]);

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
      setTimeLeft(data.seconds_remaining || 3600);
      const attemptData = await attemptApi.getAttemptDetail(
        data.id,
        data.access_token,
      );
      setQuestions(attemptData.questions || []);
      try {
        const subRes = await submissionApi.getSubmissionsForAttempt(data.id);
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
              Your responses have been securely recorded. The session has been closed due to security protocol enforcement.
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
                Your assessment attempt has been successfully and securely recorded.
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
      <div className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExitEnvironment}
            className="h-8 px-3 text-xs font-medium border border-border/60 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-3.5 mr-1" /> {isHighSecurity ? "Terminate" : "Exit"}
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
              timeLeft < 300
                ? "border-destructive/20 text-destructive bg-destructive/10"
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
                {getAssessmentTypeLabel(assessment.assessment_type)} • Academic Year {assessment.academic_year}
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
                    {assessment.fullscreen_required ? "Lockdown Mode" : "Open Environment"}
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
                Enter the session password provided by the instructor to authorize access.
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
                    I declare and commit adherence to the institutional academic integrity standards.
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
                  Secure environment lost. Please restore secure full-screen mode immediately to continue.
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
                    <Progress value={progress} className="h-1.5 bg-muted/20 rounded-full" />
                  </div>
                  <Badge
                    variant="outline"
                    className="h-6 px-2.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shadow-none"
                  >
                    {currentQ?.marks || 0} Points
                  </Badge>
                </div>

                <Card className="shadow-none border border-border/50 rounded-xl overflow-hidden bg-background">
                  <CardHeader className="py-3 px-6 border-b bg-muted/[0.02]">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                      {currentQ?.section_title || "Primary Node"}
                    </span>
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
                        setCurrentQuestionIndex(
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
                      onClick={() => {
                        if (currentQuestionIndex < questions.length - 1)
                          setCurrentQuestionIndex(currentQuestionIndex + 1);
                        else setShowSubmitConfirm(true);
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
                return (
                  <div key={sectionId || "gen"} className="space-y-1.5">
                    <div className="grid grid-cols-4 gap-2">
                      {sectionQuestions.map((q) => {
                        const idx = questions.findIndex((gq) => gq.id === q.id);
                        const isAnswered = !!answers[q.id],
                          isCurrent = idx === currentQuestionIndex;
                        return (
                          <button
                            key={q.id}
                            onClick={() => setCurrentQuestionIndex(idx)}
                            className={cn(
                              "h-8 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center",
                              isCurrent
                                ? "border-primary bg-primary text-primary-foreground"
                                : isAnswered
                                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                                  : "bg-muted/10 border-border/40 text-muted-foreground/60 hover:bg-muted/20",
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

      <Dialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <DialogContent className="sm:max-w-md p-6 border-none shadow-2xl rounded-xl text-center bg-background">
          <AlertTriangle className="size-10 text-destructive mx-auto mb-3" />
          <DialogTitle className="text-lg font-semibold text-destructive tracking-tight">
            Integrity Protocols Alert
          </DialogTitle>
          <p className="text-sm text-muted-foreground py-4">
            Security warning {warnings}/3. Switching away from this page is a violation of the test protocol. Please restore secure fullscreen focus immediately.
          </p>
          <Button
            onClick={() => setShowWarningModal(false)}
            className="w-full h-10 text-xs font-semibold rounded-lg shadow-none bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            Acknowledge warning
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent className="sm:max-w-md p-6 border-none shadow-2xl rounded-xl text-center bg-background">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Submit Assessment?
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-3 pb-6">
            Are you sure you want to finalize your assessment? All synchronized answers will be finalized for evaluation.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-10 text-xs font-medium rounded-lg"
              onClick={() => setShowSubmitConfirm(false)}
            >
              Review answers
            </Button>
            <Button
              className="flex-1 h-10 text-xs font-semibold rounded-lg shadow-none"
              onClick={submitAssessment}
              disabled={submitting}
            >
              Submit test
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
