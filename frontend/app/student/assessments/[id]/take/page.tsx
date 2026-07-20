// app/student/assessments/[id]/take/page.tsx
"use client";

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
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
  Loader2,
  Upload,
  BookOpen,
  Info,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { assessmentApi } from "@/lib/api/assessment";
import { attemptApi } from "@/lib/api/attempt";
import { submissionApi } from "@/lib/api/submission";
import { studentApi } from "@/lib/api/student";
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
  DialogTrigger,
  DialogClose,
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

// ─── Domain Types ────────────────────────────────────────────────────────────

export type AssessmentType =
  | "CAT"
  | "SUMMATIVE"
  | "FORMATIVE"
  | "HOMEWORK"
  | "GROUP_WORK"
  | "REASSESSMENT"
  | "ASSIGNMENT";

export type QuestionType =
  | "MCQ"
  | "TRUE_FALSE"
  | "MULTIPLE_CHOICE"
  | "MATCHING"
  | "ORDERING"
  | "FILL_BLANK"
  | "SHORT_ANSWER"
  | "ESSAY"
  | "CASE_STUDY"
  | "COMPUTATIONAL";

export type AnswerType =
  | "SINGLE_OPTION"
  | "MULTI_OPTION"
  | "TEXT"
  | "MATCH_PAIRS"
  | "ORDERED_LIST"
  | "FILL_BLANKS"
  | "FILE";

export interface QuestionOption {
  id: string;
  text?: string;
  option_text?: string;
  option_text_right?: string;
  match_value?: string;
}

export interface AssessmentQuestion {
  id: string;
  text?: string;
  content?: string;
  type: string;
  question_type?: string;
  marks: number;
  options?: QuestionOption[];
  assessment_section_id?: string;
  section_title?: string;
  section_instructions?: string;
  imageUrl?: string;
  caseStudyContext?: string;
  min_words?: number;
  max_words?: number;
  is_required?: boolean;
  grading_mode?: string;
  allowed_file_types?: string[];
  max_file_size?: number;
  image_alt_text?: string;
}

export interface AssessmentMeta {
  id: string;
  title: string;
  description?: string;
  assessment_type: AssessmentType;
  academic_year?: string;
  duration_minutes?: number;
  total_marks?: number;
  is_password_protected?: boolean;
  is_supervised?: boolean;
  fullscreen_required?: boolean;
  ai_assistance_allowed?: boolean;
  is_open_book?: boolean;
  max_attempts?: number;
  end_date?: string;
  result_release_mode?: string;
  sections?: any[];
  instructions?: string;
}

export interface SavedSubmission {
  question_id: string;
  answer_type: AnswerType;
  selected_option_ids?: string[];
  match_pairs_json?: Record<string, string>;
  fill_blank_answers?: Record<number, string>;
  ordered_option_ids?: string[];
  answer_text?: string;
}

export interface IntegrityWarning {
  id?: string;
  message: string;
  warning_level: "WARNING_1" | "WARNING_2" | "WARNING_3";
}

export type AnswerValue =
  | string
  | string[]
  | Record<string, string>
  | Record<number, string>
  | null
  | undefined;

export type Answers = Record<string, AnswerValue>;
export type SaveStatus = "saving" | "saved" | "failed";

export type Stage =
  | "intro"
  | "password"
  | "readiness"
  | "taking"
  | "submitted"
  | "terminated";

// ─── Constants ───────────────────────────────────────────────────────────────

const AUTOSAVE_DEBOUNCE_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 30000;
const WS_RECONNECT_DELAY_MS = 5000;
const DEVTOOLS_RESIZE_THRESHOLD_PX = 160;
const WARN_10MIN_THRESHOLD_S = 600;
const WARN_5MIN_THRESHOLD_S = 300;
const MAX_INTEGRITY_WARNINGS = 3;
const OFFLINE_QUEUE_MAX_BYTES = 2000000;

// ─── Error Boundary ──────────────────────────────────────────────────────────

class QuestionErrorBoundary extends React.Component<
  { children: React.ReactNode; questionId: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; questionId: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`Question render error for ${this.props.questionId}:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5 text-xs text-destructive font-medium text-center">
          This question could not be rendered. Your previous answer has been
          preserved.
          <br />
          <button
            className="mt-2 underline"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Custom Hooks ────────────────────────────────────────────────────────────

function useAssessmentTimer({
  stage,
  expiresAt,
  onAutoSubmit,
}: {
  stage: Stage;
  expiresAt: string | null;
  onAutoSubmit: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(0);
  const warned10mRef = useRef(false);
  const warned5mRef = useRef(false);
  const hasAutoSubmittedRef = useRef(false);

  useEffect(() => {
    hasAutoSubmittedRef.current = false;
    if (stage !== "taking" || !expiresAt) return;
    const calculateTimeRemaining = () => {
      const expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.getTime())) {
        setTimeLeft(0);
        return;
      }
      const remaining = Math.max(
        0,
        Math.floor((expiry.getTime() - Date.now()) / 1000),
      );
      setTimeLeft(remaining);
      if (remaining <= WARN_10MIN_THRESHOLD_S && !warned10mRef.current) {
        warned10mRef.current = true;
        toast.warning("10 minutes remaining in this assessment session.");
      }
      if (
        remaining <= WARN_5MIN_THRESHOLD_S &&
        remaining > 0 &&
        !warned5mRef.current
      ) {
        warned5mRef.current = true;
        toast.error(
          "Critical: 5 minutes remaining! Your attempt will auto-finalize on expiry.",
        );
      }
      if (remaining <= 0 && !hasAutoSubmittedRef.current) {
        hasAutoSubmittedRef.current = true;
        onAutoSubmit();
      }
    };
    calculateTimeRemaining();
    const timer = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(timer);
  }, [stage, expiresAt, onAutoSubmit]);

  return timeLeft;
}

function useIntegrityMonitor({
  stage,
  assessment,
  isHighSecurity,
  handleIntegrityEvent,
  setIsFullscreen,
}: {
  stage: Stage;
  assessment: AssessmentMeta | null;
  isHighSecurity: boolean;
  handleIntegrityEvent: (
    type: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  setIsFullscreen: (val: boolean) => void;
}) {
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
  }, [
    stage,
    assessment?.fullscreen_required,
    handleIntegrityEvent,
    setIsFullscreen,
  ]);

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
      const threshold = DEVTOOLS_RESIZE_THRESHOLD_PX;
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
}

function useOfflineSync({
  attemptId,
  attemptToken,
  saveAnswer,
}: {
  attemptId: string | null;
  attemptToken: string | null;
  saveAnswer: (
    questionId: string,
    qType: string,
    answerVal: AnswerValue,
    changeType: "autosave" | "manual_save",
  ) => Promise<void>;
}) {
  const [isOnline, setIsOnline] = useState(true);

  const queueLocalSave = useCallback(
    (questionId: string, qType: string, answerVal: AnswerValue) => {
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

        const queueStr = JSON.stringify(queue);
        if (queueStr.length > OFFLINE_QUEUE_MAX_BYTES) {
          // Keep only the latest 20 entries
          queue = queue.slice(-20);
        }

        try {
          localStorage.setItem(queueKey, JSON.stringify(queue));
        } catch (e) {
          toast.error(
            "Local storage full — answer could not be cached offline.",
          );
        }
      } catch (e) {
        console.error("Failed to save answer locally", e);
      }
    },
    [attemptId],
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

    const initialStatus = navigator.onLine;
    setTimeout(() => {
      setIsOnline(initialStatus);
    }, 0);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, [flushOfflineQueue]);

  return { isOnline, queueLocalSave, flushOfflineQueue };
}

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
            "bg-transparent border-none text-xs font-semibold text-foreground focus:outline-none cursor-pointer w-full pr-8",
            isDragging && "pointer-events-none",
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
        {matchedValue && (
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

function MatchingDnd({
  q,
  attemptId,
  currentVal,
  setAnswers,
}: {
  q: AssessmentQuestion;
  attemptId: string | null;
  currentVal: Record<string, string> | undefined;
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>;
}) {
  const matchingAnswers = currentVal || {};
  const [isDragging, setIsDragging] = useState(false);

  const premises = useMemo(() => {
    return (q.options || []).filter(
      (o: QuestionOption) => o.text || o.option_text,
    );
  }, [q.options]);

  const responses = useMemo(() => {
    const raw = (q.options || []).map(
      (o: QuestionOption) =>
        o.option_text_right || o.match_value || o.text || o.option_text,
    );
    const uniqueRaw = Array.from(new Set(raw)).filter(Boolean);
    const shuffled = seededShuffle(uniqueRaw, `${attemptId || ""}-${q.id}`);
    return shuffled.map((text, i) => ({
      id: `resp-${i}`,
      text: text as string,
    }));
  }, [q.options, attemptId, q.id]);

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
        setAnswers((prev: Answers) => ({
          ...prev,
          [q.id]: { ...matchingAnswers, [premiseId]: droppedText },
        }));
      }
    }
  };

  const removeMatch = (premiseId: string) => {
    const newMatches = { ...matchingAnswers };
    delete newMatches[premiseId];
    setAnswers((prev: Answers) => ({
      ...prev,
      [q.id]: newMatches,
    }));
  };

  const matchedValues = Object.values(matchingAnswers) as string[];

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
      <div className="space-y-4">
        <div className="grid gap-2">
          {premises.map((p: QuestionOption) => (
            <DroppableMatchTarget
              key={p.id}
              premiseId={p.id}
              premiseText={p.text || p.option_text || ""}
              matchedValue={matchingAnswers[p.id]}
              onRemove={() => removeMatch(p.id)}
              optionsPool={responses.map((r) => r.text)}
              isDragging={isDragging}
              onSelect={(val) => {
                setAnswers((prev: Answers) => ({
                  ...prev,
                  [q.id]: { ...matchingAnswers, [p.id]: val },
                }));
              }}
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
  optionsPool,
  onSelect,
  isDragging,
}: {
  index: number;
  value?: string;
  onRemove: () => void;
  optionsPool: string[];
  onSelect: (val: string) => void;
  isDragging?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `blank-${index}`,
  });

  return (
    <span
      ref={setNodeRef}
      className={cn(
        "inline-flex items-center justify-center min-w-[140px] h-8 mx-1.5 border-b-2 transition-all px-2.5 relative top-0.5 rounded bg-muted/10",
        isOver
          ? "bg-primary/10 border-primary"
          : value
            ? "bg-primary/[0.03] border-primary/30"
            : "border-muted-foreground/20",
      )}
    >
      <select
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
          "bg-transparent border-none text-xs font-semibold text-primary focus:outline-none cursor-pointer w-full text-center",
          isDragging && "pointer-events-none",
        )}
      >
        <option value="" className="text-muted-foreground/60">
          Select or Drop...
        </option>
        {optionsPool.map((opt, i) => (
          <option key={i} value={opt} className="text-foreground bg-background">
            {opt}
          </option>
        ))}
      </select>
    </span>
  );
}

function FillInTheBlanksDnd({
  q,
  attemptId,
  currentVal,
  setAnswers,
}: {
  q: AssessmentQuestion;
  attemptId: string | null;
  currentVal: Record<number, string> | undefined;
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>;
}) {
  const rawText = q.text || q.content || "";
  const parts = rawText.split("[blank]");
  const blankAnswers = currentVal || {};
  const [isDragging, setIsDragging] = useState(false);

  const pool = useMemo(() => {
    const raw = (q.options || []).map((o: QuestionOption, i: number) => ({
      id: o.id || `pool-${i}`,
      text: o.option_text || o.text || "",
    }));
    return seededShuffle(raw, `${attemptId || ""}-${q.id}`);
  }, [q.options, attemptId, q.id]);

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
        setAnswers((prev: Answers) => ({
          ...prev,
          [q.id]: { ...blankAnswers, [blankIndex]: droppedText },
        }));
      }
    }
  };

  const removeAnswer = (index: number) => {
    const newAnswers = { ...blankAnswers };
    delete newAnswers[index];
    setAnswers((prev: Answers) => ({
      ...prev,
      [q.id]: newAnswers,
    }));
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
        <div className="p-6 rounded-lg border border-border/60 bg-white leading-[2.5] text-[15px] font-medium text-foreground/80">
          {parts.map((part: string, i: number) => (
            <React.Fragment key={i}>
              <span className="whitespace-pre-wrap">{part}</span>
              {i < parts.length - 1 && (
                <DroppableBlank
                  index={i}
                  value={blankAnswers[i]}
                  onRemove={() => removeAnswer(i)}
                  optionsPool={pool.map((p) => p.text)}
                  isDragging={isDragging}
                  onSelect={(val) => {
                    setAnswers((prev: Answers) => ({
                      ...prev,
                      [q.id]: { ...blankAnswers, [i]: val },
                    }));
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-2 p-4 rounded-lg bg-muted/5 border border-dashed border-muted/40">
          {pool.map((ans) => (
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
      <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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

function OrderingQuestion({
  q,
  attemptId,
  currentVal,
  setAnswers,
  onInteract,
}: {
  q: AssessmentQuestion;
  attemptId: string | null;
  currentVal: string[] | undefined;
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>;
  onInteract?: () => void;
}) {
  const currentOrder = useMemo(() => {
    if (currentVal && currentVal.length > 0) return currentVal;
    const rawIds = q.options?.map((o: QuestionOption) => o.id) || [];
    return seededShuffle(rawIds, `${attemptId || ""}-${q.id}`);
  }, [currentVal, q.options, attemptId, q.id]);
  const moveItem = (from: number, to: number) => {
    const newOrder = [...currentOrder];
    const [removed] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, removed);
    setAnswers((prev: Answers) => ({ ...prev, [q.id]: newOrder }));
    onInteract?.();
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = currentOrder.indexOf(active.id as string);
      const newIndex = currentOrder.indexOf(over.id as string);
      setAnswers((prev: Answers) => ({
        ...prev,
        [q.id]: arrayMove(currentOrder, oldIndex, newIndex),
      }));
      onInteract?.();
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
              const opt = q.options?.find(
                (o: QuestionOption) => o.id === optId,
              );
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

const LECTURER_REVIEW_TYPES = [
  "shortanswer",
  "short_answer",
  "essay",
  "casestudy",
  "case_study",
  "practical",
  "computational",
  "computationalreasoning",
];

const formatTime = (seconds: number): string => {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

function seededShuffle<T>(array: T[], seed: string): T[] {
  const result = [...array];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  const lcg = () => {
    h = Math.imul(h, 1664525) + 1013904223 | 0;
    return (h >>> 0) / 0xffffffff;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(lcg() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

const getAnswerType = (questionType: string): AnswerType => {
  const normalized = (questionType || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

  const map: Record<string, AnswerType> = {
    mcq: "SINGLE_OPTION",
    truefalse: "SINGLE_OPTION",
    true_false: "SINGLE_OPTION",
    singleoption: "SINGLE_OPTION",
    matching: "MATCH_PAIRS",
    ordering: "ORDERED_LIST",
    orderedlist: "ORDERED_LIST",
    ordered_list: "ORDERED_LIST",
    sequence: "ORDERED_LIST",
    sequencing: "ORDERED_LIST",
    fillblank: "FILL_BLANKS",
    fillblanks: "FILL_BLANKS",
    fill_blank: "FILL_BLANKS",
    multiplechoice: "SINGLE_OPTION",
    multiple_choice: "SINGLE_OPTION",
    multichoice: "SINGLE_OPTION",
    multiselect: "MULTI_OPTION",
    multicorrect: "MULTI_OPTION",
    multi_correct: "MULTI_OPTION",
    checkbox: "MULTI_OPTION",
    shortanswer: "TEXT",
    short_answer: "TEXT",
    essay: "TEXT",
    casestudy: "TEXT",
    case_study: "TEXT",
    computational: "FILE",
    computationalreasoning: "FILE",
    practical: "FILE",
  };
  return map[normalized] ?? "TEXT";
};

export default function TakeAssessmentPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;

  const requiresLecturerReview = useCallback(
    (q: AssessmentQuestion): boolean => {
      if (!q) return false;
      if (q.grading_mode === "AUTO") return false;
      if (q.grading_mode === "MANUAL") return true;
      const t = (q.type || q.question_type || "")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
      return (
        LECTURER_REVIEW_TYPES.includes(t) ||
        t === "computational" ||
        t === "short_answer" ||
        t === "case_study"
      );
    },
    [],
  );

  const [stage, setStage] = useState<Stage>("intro");
  const [assessment, setAssessment] = useState<AssessmentMeta | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attemptToken, setAttemptToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const answersRef = useRef<Answers>(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const shuffledOptionsMap = useMemo(() => {
    const map: Record<string, QuestionOption[]> = {};
    const shuffleEnabled = !!(
      (assessment as any)?.randomise_options ||
      (assessment as any)?.randomize_options ||
      (assessment as any)?.shuffleOptions
    );
    
    questions.forEach((q) => {
      const type = (q.type || q.question_type || "").toString().toLowerCase().replace(/[^a-z0-9_]/g, "");
      const isMCQ = type === "mcq" || type === "multiplechoice" || type === "multiple_choice" || type === "multichoice" || type === "singleoption";
      const isMulti = getAnswerType(q.type || q.question_type || "") === "MULTI_OPTION";
      
      if ((isMCQ || isMulti) && shuffleEnabled) {
        map[q.id] = seededShuffle(q.options || [], `${attemptId || ""}-${q.id}`);
      } else {
        map[q.id] = q.options || [];
      }
    });
    return map;
  }, [questions, attemptId, assessment]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [warnings, setWarnings] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [terminationReason, setTerminationReason] = useState<string | null>(
    null,
  );

  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [readinessChecked, setReadinessChecked] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [manualSubmitError, setManualSubmitError] = useState<string | null>(null);
  const [interactedQuestions, setInteractedQuestions] = useState<Record<string, boolean>>({});
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);

  useEffect(() => {
    if (!showSubmitConfirm) {
      setManualSubmitError(null);
    }
  }, [showSubmitConfirm]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [attemptNumber, setAttemptNumber] = useState<number>(1);

  useEffect(() => {
    if (stage === "submitted") {
      const redirect = () => {
        router.push(attemptId ? `/student/results/${attemptId}` : "/student/results");
      };
      redirect();
      const timer = setTimeout(redirect, 10000);
      return () => clearTimeout(timer);
    }
  }, [stage, attemptId, router]);

  const [flaggedQuestions, setFlaggedQuestions] = useState<
    Record<string, boolean>
  >({});
  const [skippedQuestions, setSkippedQuestions] = useState<
    Record<string, boolean>
  >({});
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [currentWarning, setCurrentWarning] = useState<IntegrityWarning | null>(
    null,
  );
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [submittedAttempt, setSubmittedAttempt] = useState<any>(null);
  const [isPollingScore, setIsPollingScore] = useState(false);

  const [pendingAttemptStartData, setPendingAttemptStartData] =
    useState<any>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);

  const timeSpentRef = useRef<Record<string, number>>({});
  const lastSavedValuesRef = useRef<Record<string, any>>({});
  const isNavigatingRef = useRef(false);
  const stageRef = useRef<Stage>(stage);
  const processedWarningIds = useRef<Set<string>>(new Set());
  const saveAnswerRef = useRef<
    | ((
        questionId: string,
        qType: string,
        answerVal: AnswerValue,
        changeType: "autosave" | "manual_save",
      ) => Promise<void>)
    | null
  >(null);
  const saveAllPendingAnswersRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const readinessAbortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warningPauseStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (warningModalOpen) {
      warningPauseStartRef.current = Date.now();
    } else if (warningPauseStartRef.current !== null) {
      const pauseDuration = Date.now() - warningPauseStartRef.current;
      warningPauseStartRef.current = null;
      if (expiresAt && pauseDuration > 1000) {
        setExpiresAt((prev) => {
          if (!prev) return null;
          const currentExpiry = new Date(prev).getTime();
          return new Date(currentExpiry + pauseDuration).toISOString();
        });
        toast.info(
          `Timer extended by ${Math.round(pauseDuration / 1000)} seconds to account for warning review.`,
        );
      }
    }
  }, [warningModalOpen, expiresAt]);

  const [viewingSectionIntro, setViewingSectionIntro] = useState<string | null>(
    null,
  );
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const prevQuestionRef = useRef<AssessmentQuestion | null>(null);

  const isQuestionAnswered = useCallback(
    (q: AssessmentQuestion, val: any): boolean => {
      if (val === undefined || val === null) return false;
      const answerType = getAnswerType(q.type || q.question_type || "");

      if (answerType === "TEXT") {
        if (typeof val === "string") {
          return val.trim() !== "";
        }
        if (typeof val === "object" && val !== null) {
          const opts = q.options || [];
          if (opts.length === 0) return false;
          return opts.every((opt: any) => {
            const entry = val[opt.id];
            return typeof entry === "string" && entry.trim() !== "";
          });
        }
        return false;
      }
      if (answerType === "SINGLE_OPTION") {
        return typeof val === "string" && val !== "";
      }
      if (answerType === "MULTI_OPTION") {
        return Array.isArray(val) && val.length > 0;
      }
      if (answerType === "ORDERED_LIST") {
        return Array.isArray(val) && val.length > 0 && !!interactedQuestions[q.id];
      }
      if (answerType === "MATCH_PAIRS") {
        return typeof val === "object" && Object.keys(val).length > 0;
      }
      if (answerType === "FILL_BLANKS") {
        if (typeof val !== "object" || Object.keys(val).length === 0)
          return false;
        return Object.values(val).some(
          (v) => typeof v === "string" && v.trim() !== "",
        );
      }
      if (answerType === "FILE") {
        if (typeof val === "object" && val !== null) {
          return !!(
            val.file_url ||
            (typeof val.answer_text === "string" &&
              val.answer_text.trim() !== "")
          );
        }
        return typeof val === "string" && val.trim() !== "";
      }
      return false;
    },
    [interactedQuestions],
  );

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
      if (saveAllPendingAnswersRef.current) {
        await saveAllPendingAnswersRef.current();
      }
      await attemptApi.submitAttempt(attemptId, attemptToken, true);
      toast.info("Responses preserved.");
    } catch (err: unknown) {
      console.error("Auto-submit failed", err);
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

  const startPollingScore = useCallback(
    async (attId: string, token: string) => {
      setIsPollingScore(true);
      let attempts = 0;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const detail = await attemptApi.getAttemptDetail(attId, token);
          setSubmittedAttempt(detail);
          if (
            (detail.total_score !== null && detail.total_score !== undefined) ||
            attempts >= 20
          ) {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            setIsPollingScore(false);
          }
        } catch (err) {
          console.error("Error polling attempt score:", err);
        }
        attempts++;
      }, 3000);
    },
    [],
  );

  const handleIntegrityEvent = useCallback(
    async (type: string, metadata: Record<string, unknown> = {}) => {
      if (!attemptId || !attemptToken) return;
      try {
        const res = await attemptApi.recordIntegrityEvent(
          attemptId,
          attemptToken,
          type,
          metadata,
        );
        if (res.warning_issued && res.warning) {
          const warningId = res.warning.id || res.id;
          if (warningId && processedWarningIds.current.has(warningId)) return;
          if (warningId) processedWarningIds.current.add(warningId);
          setWarnings((prev) => {
            const newCount = prev + 1;
            if (newCount >= MAX_INTEGRITY_WARNINGS) {
              terminateSession(`Warnings exceeded (${type}).`);
            } else {
              setCurrentWarning(res.warning);
              setWarningModalOpen(true);
            }
            return newCount;
          });
        }
      } catch (err: unknown) {
        console.error("Failed to record integrity event", err);
      }
    },
    [attemptId, attemptToken, terminateSession],
  );

  useIntegrityMonitor({
    stage,
    assessment,
    isHighSecurity,
    handleIntegrityEvent,
    setIsFullscreen,
  });

  const { isOnline, queueLocalSave, flushOfflineQueue } = useOfflineSync({
    attemptId,
    attemptToken,
    saveAnswer: useCallback(
      async (questionId, qType, answerVal, changeType) => {
        await saveAnswerRef.current?.(questionId, qType, answerVal, changeType);
      },
      [],
    ),
  });

  const saveAnswer = useCallback(
    async (
      questionId: string,
      qType: string,
      answerVal: AnswerValue,
      changeType: "autosave" | "manual_save" = "autosave",
      isSkippedOverride?: boolean,
    ) => {
      if (!attemptId || !attemptToken) return;

      const answerType = getAnswerType(qType);
      const timeOnQuestion = timeSpentRef.current[questionId] || 0;
      const isSkipped =
        isSkippedOverride !== undefined
          ? isSkippedOverride
          : !!skippedQuestions[questionId];

      const payload: any = {
        attempt_id: attemptId,
        question_id: questionId,
        access_token: attemptToken,
        answer_type: answerType,
        change_type: changeType,
        time_spent_seconds: timeOnQuestion,
        is_skipped: isSkipped,
      };

      if (answerType === "TEXT") {
        const isCS = (qType || "").toLowerCase().replace(/[^a-z0-9_]/g, "") === "casestudy";
        if (isCS) {
          payload.answer_text = typeof answerVal === "object" && answerVal !== null
            ? JSON.stringify(answerVal)
            : JSON.stringify({});
        } else {
          payload.answer_text =
            typeof answerVal === "string"
              ? answerVal
              : answerVal === null || answerVal === undefined
                ? ""
                : JSON.stringify(answerVal);
        }
      } else if (answerType === "FILE") {
        if (typeof answerVal === "object" && answerVal !== null) {
          payload.file_url = (answerVal as any).file_url || "";
          payload.answer_text = (answerVal as any).answer_text || "";
        } else {
          payload.answer_text = typeof answerVal === "string" ? answerVal : "";
          payload.file_url = "";
        }
      } else if (answerType === "SINGLE_OPTION") {
        payload.selected_option_ids = Array.isArray(answerVal)
          ? answerVal
          : answerVal
            ? [answerVal]
            : [];
      } else if (answerType === "MULTI_OPTION") {
        payload.selected_option_ids = Array.isArray(answerVal) ? answerVal : [];
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

        const queueKey = `offline_saves_${attemptId}`;
        const queueStr = localStorage.getItem(queueKey);
        if (queueStr) {
          try {
            const queue = JSON.parse(queueStr);
            const filtered = queue.filter(
              (item: any) => item.question_id !== questionId,
            );
            localStorage.setItem(queueKey, JSON.stringify(filtered));
          } catch (e: unknown) {
            console.error(e);
          }
        }
      } catch (err: unknown) {
        console.error("Save failed, queueing locally", err);
        setSaveStatus((prev) => ({ ...prev, [questionId]: "failed" }));
        queueLocalSave(questionId, qType, answerVal);
        toast.warning("Network connection issue. Answer saved locally.", {
          id: `save-fail-${questionId}`,
        });
      }
    },
    [attemptId, attemptToken, queueLocalSave, skippedQuestions],
  );

  useEffect(() => {
    saveAnswerRef.current = saveAnswer;
  }, [saveAnswer]);

  // Sync / Load logic: Detect existing attempt on mount (Resume attempt support)
  const syncSavedSubmissions = async (attId: string) => {
    try {
      const subRes = await submissionApi.getSubmissionsForAttempt(attId);
      const savedAnswers: Record<string, any> = {};
      subRes.submissions?.forEach((s: any) => {
        if (s.answer_type === "MULTI_OPTION") {
          savedAnswers[s.question_id] = s.selected_option_ids || [];
        } else if (s.answer_type === "SINGLE_OPTION") {
          const q = questions.find((x) => x.id === s.question_id);
          const isMulti =
            q &&
            getAnswerType(q.type || q.question_type || "") === "MULTI_OPTION";
          savedAnswers[s.question_id] = isMulti
            ? s.selected_option_ids || []
            : s.selected_option_ids?.[0] || "";
        } else if (s.answer_type === "MATCH_PAIRS")
          savedAnswers[s.question_id] = s.match_pairs_json || {};
        else if (s.answer_type === "FILL_BLANKS")
          savedAnswers[s.question_id] = s.fill_blank_answers || {};
        else if (
          s.answer_type === "ORDERED_LIST" ||
          s.answer_type === "ordered_list" ||
          s.answer_type === "ordering"
        ) {
          savedAnswers[s.question_id] = s.ordered_option_ids || [];
          setInteractedQuestions((prev) => ({ ...prev, [s.question_id]: true }));
        }
        else if (s.answer_type === "FILE")
          savedAnswers[s.question_id] = {
            file_url: s.file_url || "",
            filename: s.file_url
              ? s.file_url.split("/").pop() || "uploaded_file"
              : "",
            answer_text: s.answer_text || "",
          };
        else {
          const q = questions.find((x) => x.id === s.question_id);
          const isCaseStudy =
            q &&
            (q.type || q.question_type || "")
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "") === "casestudy";
          if (isCaseStudy) {
            if (typeof s.answer_text === "string") {
              try {
                savedAnswers[s.question_id] = JSON.parse(s.answer_text);
              } catch {
                const subId = q.options?.[0]?.id || "default";
                savedAnswers[s.question_id] = { [subId]: s.answer_text };
              }
            } else {
              savedAnswers[s.question_id] = s.answer_text || {};
            }
          } else {
            savedAnswers[s.question_id] = s.answer_text;
          }
        }
      });
      // Store truly saved answers from backend in lastSavedValuesRef
      const trulySavedAnswers: Record<string, any> = { ...savedAnswers };
      // Now, for any ORDERED_LIST question that does NOT have a saved answer, initialize it!
      questions.forEach((q) => {
        if (
          getAnswerType(q.type || q.question_type || "") === "ORDERED_LIST" &&
          !savedAnswers[q.id]
        ) {
          const rawIds = q.options?.map((o) => o.id) || [];
          savedAnswers[q.id] = seededShuffle(rawIds, `${attemptId}-${q.id}`);
        }
      });
      setAnswers(savedAnswers);
      lastSavedValuesRef.current = trulySavedAnswers;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to sync submissions";
      console.error(message, err);
      toast.warning("Could not load previously saved answers. Starting fresh.");
    }
  };

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function checkExistingSession() {
      try {
        setLoading(true);
        // Load assessment first
        const data = await assessmentApi.getAssessmentById(assessmentId);
        if (controller.signal.aborted) return;
        setAssessment(data);

        // Check for student's IN_PROGRESS or PAUSED attempts
        const attemptsRes = await apiClient("/attempts/me");
        if (controller.signal.aborted) return;
        const completedAttempts =
          attemptsRes.items?.filter(
            (a: any) =>
              a.assessment_id === assessmentId &&
              ["SUBMITTED", "AUTO_SUBMITTED", "TERMINATED"].includes(a.status),
          ) || [];
        setAttemptNumber(completedAttempts.length + 1);

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
                if (controller.signal.aborted) return;
                const newToken = resumeData.access_token;
                setAttemptToken(newToken);
                sessionStorage.setItem(
                  `attempt_token_${activeAttempt.id}`,
                  newToken,
                );
                setExpiresAt(resumeData.expires_at);

                const attemptDetail = await attemptApi.getAttemptDetail(
                  activeAttempt.id,
                  newToken,
                );
                if (controller.signal.aborted) return;
                setQuestions(attemptDetail.questions || []);
                await syncSavedSubmissions(activeAttempt.id);
                if (controller.signal.aborted) return;
                setStage("taking");
                if (assessment?.fullscreen_required) enterFullscreen();
                toast.success("Attempt resumed successfully.");
              } catch (err: unknown) {
                if (controller.signal.aborted) return;
                const message =
                  err instanceof Error
                    ? err.message
                    : "Failed to resume paused attempt.";
                toast.error(message);
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
                if (controller.signal.aborted) return;
                setQuestions(attemptDetail.questions || []);
                await syncSavedSubmissions(activeAttempt.id);
                if (controller.signal.aborted) return;
                setStage("taking");
                if (assessment?.fullscreen_required) enterFullscreen();
              } catch (err: unknown) {
                if (controller.signal.aborted) return;
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
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load assessment context.";
        toast.error(message);
        router.push("/student/assessments");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    if (assessmentId) {
      checkExistingSession();
    }

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              const warningId = data.warning?.id || data.id;
              if (warningId && processedWarningIds.current.has(warningId))
                return;
              if (warningId) processedWarningIds.current.add(warningId);
              setWarnings((prev) => {
                const newCount = prev + 1;
                if (newCount >= 3) {
                  terminateSession("Warnings exceeded.");
                } else {
                  setCurrentWarning(data.warning || data);
                  setWarningModalOpen(true);
                }
                return newCount;
              });
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
            reconnectTimeout = window.setTimeout(() => {
              reconnectTimeout = null;
              if (stageRef.current === "taking") {
                connectWs();
              }
            }, 5000);
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
  }, [stage, attemptId, terminateSession]);

  // Timer with server deadline countdown
  const saveAllPendingAnswers = useCallback(async () => {
    if (!attemptId || !attemptToken || !questions.length) return;
    for (const q of questions) {
      const currentAnswer = answersRef.current[q.id];
      if (
        currentAnswer !== undefined &&
        JSON.stringify(currentAnswer) !==
          JSON.stringify(lastSavedValuesRef.current[q.id])
      ) {
        try {
          await saveAnswer(q.id, q.type, currentAnswer, "manual_save");
          lastSavedValuesRef.current[q.id] = currentAnswer;
        } catch (err: unknown) {
          console.error(`Failed to save pending answer for ${q.id}`, err);
        }
      }
    }
  }, [attemptId, attemptToken, questions, saveAnswer]);

  const handleAutoSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    toast.info("Time expired! Automatically submitting your assessment as-is.");
    try {
      await saveAllPendingAnswers();
      await attemptApi.submitAttempt(attemptId!, attemptToken!, true);
      setStage("submitted");
      if (attemptId && attemptToken) {
        startPollingScore(attemptId, attemptToken);
      }
    } catch (err: any) {
      setStage("submitted");
      setSubmitError(err.message || "Failed to submit assessment automatically. Please check your network connection.");
      if (attemptId && attemptToken) {
        startPollingScore(attemptId, attemptToken);
      }
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, attemptToken, saveAllPendingAnswers, startPollingScore]);

  const handleRetryAutoSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await saveAllPendingAnswers();
      await attemptApi.submitAttempt(attemptId!, attemptToken!, true);
      setStage("submitted");
      if (attemptId && attemptToken) {
        startPollingScore(attemptId, attemptToken);
      }
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit assessment. Please check your network connection.");
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, attemptToken, saveAllPendingAnswers, startPollingScore]);

  const timeLeft = useAssessmentTimer({
    stage,
    expiresAt,
    onAutoSubmit: handleAutoSubmit,
  });

  // Timer spent per question tracking
  useEffect(() => {
    if (stage !== "taking" || !currentQ) return;
    const interval = setInterval(() => {
      const qId = currentQ.id;
      timeSpentRef.current[qId] = (timeSpentRef.current[qId] || 0) + 1;
    }, 1000);
    return () => clearInterval(interval);
  }, [stage, currentQ]);

  // Section Boundary Transition Detection
  useEffect(() => {
    if (stage !== "taking" || !currentQ) return;
    const prevQ = prevQuestionRef.current;
    prevQuestionRef.current = currentQ;

    // Detect section boundary crossing
    if (
      prevQ &&
      prevQ.assessment_section_id !== currentQ.assessment_section_id
    ) {
      setViewingSectionIntro(currentQ.assessment_section_id || "default");
    }
  }, [currentQuestionIndex, stage, currentQ]);

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

    // Auto-unskip if student answers a question
    setSkippedQuestions((prev) => {
      if (prev[currentQ.id]) {
        return { ...prev, [currentQ.id]: false };
      }
      return prev;
    });

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        await saveAnswer(currentQ.id, currentQ.type, currentAnswer, "autosave");
        if (controller.signal.aborted) return;
        lastSavedValuesRef.current[currentQ.id] = currentAnswer;
      } catch (err: unknown) {
        console.error(err);
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [answers, currentQ, stage, saveAnswer]);

  // Heartbeat Autosave (30s)
  useEffect(() => {
    if (stage !== "taking") return;
    const controller = new AbortController();

    const interval = setInterval(async () => {
      if (currentQ) {
        const currentAnswer = answers[currentQ.id];
        if (currentAnswer !== undefined) {
          try {
            await saveAnswer(
              currentQ.id,
              currentQ.type,
              currentAnswer,
              "autosave",
            );
            if (controller.signal.aborted) return;
            lastSavedValuesRef.current[currentQ.id] = currentAnswer;
          } catch (err: unknown) {
            console.error(err);
          }
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
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
            try {
              await saveAnswer(qId, qType, currentAnswer, "manual_save");
              lastSavedValuesRef.current[qId] = currentAnswer;
            } catch (saveErr) {
              console.error("Navigation save error:", saveErr);
            }
          }
        }

        setCurrentQuestionIndex(newIndex);
      } catch (err) {
        console.error("Navigation error:", err);
      } finally {
        isNavigatingRef.current = false;
      }
    },
    [currentQuestionIndex, currentQ, answers, saveAnswer],
  );

  const submitAssessment = useCallback(async () => {
    if (!attemptId || !attemptToken) return;
    setSubmitting(true);
    setManualSubmitError(null);
    try {
      await saveAllPendingAnswers();
      await attemptApi.submitAttempt(attemptId, attemptToken, true);
      if (typeof document !== "undefined" && document.fullscreenElement)
        document.exitFullscreen();
      setStage("submitted");
      toast.success("Submitted successfully.");
      startPollingScore(attemptId, attemptToken);
      setShowSubmitConfirm(false);
    } catch (err: any) {
      setManualSubmitError(err.message || "Failed to submit assessment. Please check your network connection and try again.");
      toast.error("Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }, [attemptId, attemptToken, saveAllPendingAnswers, startPollingScore]);

  const enterFullscreen = () => {
    document.documentElement
      .requestFullscreen()
      .catch(() => toast.error("Fullscreen denied."));
  };

  const handleExitEnvironment = () => {
    if (stage === "taking" && isHighSecurity) {
      setShowTerminateConfirm(true);
      return;
    }
    router.back();
  };

  const handleStartAssessment = () => {
    if (assessment?.is_password_protected) setStage("password");
    else setStage("readiness");
  };
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;
    setIsVerifyingPassword(true);
    setPasswordError(null);
    try {
      if (attemptId && attemptToken) {
        setStage("readiness");
        return;
      }
      const data = await attemptApi.startAttempt({
        assessment_id: assessmentId,
        password: passwordInput,
      });
      setPendingAttemptStartData(data);
      setStage("readiness");
    } catch (err: any) {
      console.error(err);
      setPasswordError(err.message || "Invalid password. Please try again.");
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handleReadinessConfirm = async () => {
    if (!readinessChecked) return;
    if (attemptId && attemptToken && questions.length > 0) {
      setStage("taking");
      if (assessment?.fullscreen_required) enterFullscreen();
      return;
    }
    readinessAbortControllerRef.current?.abort();
    const controller = new AbortController();
    readinessAbortControllerRef.current = controller;

    try {
      let data = pendingAttemptStartData;
      if (!data) {
        data = await attemptApi.startAttempt({
          assessment_id: assessmentId,
          password: passwordInput || undefined,
        });
      }
      if (controller.signal.aborted) return;
      setAttemptId(data.id);
      setAttemptToken(data.access_token);
      setPendingAttemptStartData(null);
      sessionStorage.setItem(`attempt_token_${data.id}`, data.access_token);
      setExpiresAt(data.expires_at);

      const attemptData = await attemptApi.getAttemptDetail(
        data.id,
        data.access_token,
      );
      if (controller.signal.aborted) return;
      setQuestions(attemptData.questions || []);
      const savedAnswers: Record<string, any> = {};
      try {
        const subRes = await submissionApi.getSubmissionsForAttempt(data.id);
        if (controller.signal.aborted) return;
        subRes.submissions?.forEach((s: any) => {
          if (s.answer_type === "MULTI_OPTION") {
            savedAnswers[s.question_id] = s.selected_option_ids || [];
          } else if (s.answer_type === "SINGLE_OPTION") {
            const q = (attemptData.questions || []).find(
              (x: any) => x.id === s.question_id,
            );
            const isMulti =
              q &&
              getAnswerType(q.type || q.question_type || "") === "MULTI_OPTION";
            savedAnswers[s.question_id] = isMulti
              ? s.selected_option_ids || []
              : s.selected_option_ids?.[0] || "";
          } else if (s.answer_type === "MATCH_PAIRS")
            savedAnswers[s.question_id] = s.match_pairs_json || {};
          else if (s.answer_type === "FILL_BLANKS")
            savedAnswers[s.question_id] = s.fill_blank_answers || {};
          else if (
            s.answer_type === "ORDERED_LIST" ||
            s.answer_type === "ordered_list" ||
            s.answer_type === "ordering"
          ) {
            savedAnswers[s.question_id] = s.ordered_option_ids || [];
            setInteractedQuestions((prev) => ({ ...prev, [s.question_id]: true }));
          }
          else if (s.answer_type === "FILE")
            savedAnswers[s.question_id] = {
              file_url: s.file_url || "",
              filename: s.file_url
                ? s.file_url.split("/").pop() || "uploaded_file"
                : "",
              answer_text: s.answer_text || "",
            };
          else {
            const q = (attemptData.questions || []).find(
              (x: any) => x.id === s.question_id,
            );
            const isCaseStudy =
              q &&
              (q.type || q.question_type || "")
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, "") === "casestudy";
            if (isCaseStudy) {
              if (typeof s.answer_text === "string") {
                try {
                  savedAnswers[s.question_id] = JSON.parse(s.answer_text);
                } catch {
                  const subId = q.options?.[0]?.id || "default";
                  savedAnswers[s.question_id] = { [subId]: s.answer_text };
                }
              } else {
                savedAnswers[s.question_id] = s.answer_text || {};
              }
            } else {
              savedAnswers[s.question_id] = s.answer_text;
            }
          }
        });
        // Store truly saved answers from backend in lastSavedValuesRef
        const trulySavedAnswers: Record<string, any> = { ...savedAnswers };
        // Now, for any ORDERED_LIST question that does NOT have a saved answer, initialize it!
        (attemptData.questions || []).forEach((q: any) => {
          if (
            getAnswerType(q.type || q.question_type || "") === "ORDERED_LIST" &&
            !savedAnswers[q.id]
          ) {
            const rawIds = q.options?.map((o: any) => o.id) || [];
            savedAnswers[q.id] = seededShuffle(rawIds, `${data.id}-${q.id}`);
          }
        });
        setAnswers(savedAnswers);
        lastSavedValuesRef.current = trulySavedAnswers;
      } catch (e: unknown) {
        console.error(e);
      }
      setStage("taking");
      if (assessment?.fullscreen_required) enterFullscreen();
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      toast.error("Start failed. Check credentials.");
      const code = (err as { code?: string }).code;
      const status = (err as { status?: number }).status;
      if (code === "INVALID_PASSWORD" || status === 403) {
        setStage("password");
        setPasswordError("Incorrect password. Please try again.");
      }
    }
  };

  const getAssessmentTypeLabel = (type: string) => {
    if (!type) return "";
    switch (type.toLowerCase()) {
      case "cat":
        return "Continuous Assessment Test";
      case "summative":
        return "Summative Examination";
      case "formative":
        return "Formative Assessment";
      case "homework":
        return "Homework Assignment";
      case "group_work":
        return "Group Work";
      case "reassessment":
        return "Reassessment";
      case "assignment":
        return "Assignment";
      default:
        return type;
    }
  };
  const sectionGroups = useMemo(() => {
    const sectionIds = Array.from(
      new Set(questions.map((q) => q.assessment_section_id)),
    );
    return sectionIds.map((sectionId) => ({
      sectionId,
      questions: questions.filter((q) => q.assessment_section_id === sectionId),
      title:
        questions.find((q) => q.assessment_section_id === sectionId)
          ?.section_title || "General Section",
    }));
  }, [questions]);

  const answeredCount = useMemo(() => {
    return questions.filter((q) => isQuestionAnswered(q, answers[q.id])).length;
  }, [questions, answers, isQuestionAnswered]);

  const progress = useMemo(
    () => (questions.length > 0 ? (answeredCount / questions.length) * 100 : 0),
    [answeredCount, questions.length],
  );

  const renderQuestion = (q: AssessmentQuestion): React.ReactNode => {
    if (!q) return null;
    const currentVal = answers[q.id];
    const type = (q.type || q.question_type || "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");

    // ─── A. MULTIPLE CHOICE QUESTIONS & MCQ ───
    if (
      type === "mcq" ||
      type === "multiplechoice" ||
      type === "multiple_choice" ||
      type === "multichoice" ||
      type === "singleoption"
    ) {
      return (
        <RadioGroup
          value={
            typeof currentVal === "string"
              ? currentVal
              : Array.isArray(currentVal) && currentVal.length > 0
                ? currentVal[0]
                : ""
          }
          onValueChange={(val) =>
            setAnswers((prev) => ({ ...prev, [q.id]: val }))
          }
          className="grid gap-3"
        >
          {(shuffledOptionsMap[q.id] || []).map((opt: QuestionOption) => {
            const isSelected =
              currentVal === opt.id ||
              (Array.isArray(currentVal) && currentVal.includes(opt.id));
            return (
              <div
                key={opt.id}
                onClick={() =>
                  setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                }
                className={cn(
                  "flex items-center space-x-3 p-3.5 rounded-xl border transition-all cursor-pointer",
                  isSelected
                    ? "bg-primary/[0.03] border-primary/25 shadow-sm font-semibold"
                    : "hover:bg-muted/5 border-muted/70",
                )}
              >
                <RadioGroupItem value={opt.id} id={opt.id} className="size-4" />
                <Label
                  htmlFor={opt.id}
                  className="flex-1 cursor-pointer font-medium text-sm text-foreground/80"
                >
                  {opt.text || opt.option_text || "Option"}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      );
    }

    // ─── A2. MULTI SELECT / CHECKBOX QUESTIONS ───
    if (getAnswerType(q.type || q.question_type || "") === "MULTI_OPTION") {
      const selectedIds = Array.isArray(currentVal)
        ? currentVal
        : typeof currentVal === "string" && currentVal
          ? [currentVal]
          : [];

      return (
        <div className="grid gap-3">
          {(shuffledOptionsMap[q.id] || []).map((opt: QuestionOption) => {
            const isSelected = selectedIds.includes(opt.id);
            return (
              <div
                key={opt.id}
                onClick={() => {
                  const nextIds = isSelected
                    ? selectedIds.filter((id) => id !== opt.id)
                    : [...selectedIds, opt.id];
                  setAnswers((prev) => ({ ...prev, [q.id]: nextIds }));
                }}
                className={cn(
                  "flex items-center space-x-3 p-3.5 rounded-xl border transition-all cursor-pointer",
                  isSelected
                    ? "bg-primary/[0.03] border-primary/25 shadow-sm font-semibold"
                    : "hover:bg-muted/5 border-muted/70",
                )}
              >
                <Checkbox
                  checked={isSelected}
                  id={opt.id}
                  className="size-4"
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={(checked) => {
                    const nextIds = checked
                      ? [...selectedIds, opt.id]
                      : selectedIds.filter((id) => id !== opt.id);
                    setAnswers((prev) => ({ ...prev, [q.id]: nextIds }));
                  }}
                />
                <Label
                  htmlFor={opt.id}
                  className="flex-1 cursor-pointer font-medium text-sm text-foreground/80"
                >
                  {opt.text || opt.option_text || "Option"}
                </Label>
              </div>
            );
          })}
        </div>
      );
    }

    // ─── B. TRUE / FALSE QUESTIONS ───
    if (type === "truefalse" || type === "true_false") {
      const tfOptions =
        q.options && q.options.length >= 2
          ? q.options
          : [
              { id: "true", text: "True", option_text: "True" },
              { id: "false", text: "False", option_text: "False" },
            ];
      return (
        <RadioGroup
          value={typeof currentVal === "string" ? currentVal : ""}
          onValueChange={(val) =>
            setAnswers((prev) => ({ ...prev, [q.id]: val }))
          }
          className="grid gap-3"
        >
          {tfOptions.map((opt: QuestionOption) => (
            <div
              key={opt.id}
              onClick={() =>
                setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
              }
              className={cn(
                "flex items-center space-x-3 p-3.5 rounded-xl border transition-all cursor-pointer",
                currentVal === opt.id
                  ? "bg-primary/[0.03] border-primary/25 shadow-sm font-semibold"
                  : "hover:bg-muted/5 border-muted/70",
              )}
            >
              <RadioGroupItem value={opt.id} id={opt.id} className="size-4" />
              <Label
                htmlFor={opt.id}
                className="flex-1 cursor-pointer font-medium text-sm text-foreground/80"
              >
                {opt.text || opt.option_text || "Option"}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    }

    // ─── C. FILL IN THE BLANK ───
    if (
      type === "fillblank" ||
      type === "fillblanks" ||
      type === "fillintheblank" ||
      type === "fillintheblanks" ||
      type === "fill_blank"
    ) {
      return (
        <FillInTheBlanksDnd
          q={q}
          attemptId={attemptId}
          currentVal={
            currentVal &&
            typeof currentVal === "object" &&
            !Array.isArray(currentVal)
              ? (currentVal as Record<number, string>)
              : undefined
          }
          setAnswers={setAnswers}
        />
      );
    }

    // ─── D. MATCHING ───
    if (type === "matching") {
      return (
        <MatchingDnd
          q={q}
          attemptId={attemptId}
          currentVal={
            currentVal &&
            typeof currentVal === "object" &&
            !Array.isArray(currentVal)
              ? (currentVal as Record<string, string>)
              : undefined
          }
          setAnswers={setAnswers}
        />
      );
    }

    // ─── E. SHORT ANSWER ───
    if (type === "shortanswer" || type === "short_answer") {
      const textVal = typeof currentVal === "string" ? currentVal : "";
      return (
        <div className="space-y-4">
          <textarea
            className="w-full min-h-[140px] p-4 rounded-xl border border-muted/70 bg-background focus:border-primary/40 outline-none text-sm leading-relaxed resize-y"
            placeholder="Type your response here..."
            value={textVal}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
            }
          />
          {requiresLecturerReview(q) ? (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-semibold uppercase tracking-wider bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/10">
              <Clock className="size-3.5" /> Lecturer Review Required (No
              auto-grading)
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold uppercase tracking-wider bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/10">
              <CheckCircle className="size-3.5" /> Auto-Graded (Instant
              Feedback)
            </div>
          )}
        </div>
      );
    }

    // ─── F. ESSAY ───
    if (type === "essay") {
      const textVal = typeof currentVal === "string" ? currentVal : "";
      const wordCount = textVal.trim().split(/\s+/).filter(Boolean).length;

      const minWords = q.min_words;
      const maxWords = q.max_words;

      const isTooShort =
        minWords !== undefined &&
        minWords !== null &&
        minWords > 0 &&
        wordCount > 0 &&
        wordCount < minWords;
      const isTooLong =
        maxWords !== undefined &&
        maxWords !== null &&
        maxWords > 0 &&
        wordCount > maxWords;
      const isOutRange = isTooShort || isTooLong;

      let wordLabel = `${wordCount} words`;
      if (maxWords && minWords) {
        wordLabel = `${wordCount} / ${maxWords} words (min: ${minWords})`;
      } else if (maxWords) {
        wordLabel = `${wordCount} / ${maxWords} words`;
      } else if (minWords) {
        wordLabel = `${wordCount} words (min: ${minWords})`;
      }

      return (
        <div className="space-y-4">
          <textarea
            className={cn(
              "w-full min-h-[250px] p-4 rounded-xl border bg-background focus:border-primary/40 outline-none text-sm leading-relaxed resize-y",
              isOutRange
                ? "border-red-500/50 focus:border-red-500"
                : "border-muted/70",
            )}
            placeholder="Write your detailed essay here..."
            value={textVal}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
            }
          />
          <div className="flex items-center justify-between">
            {requiresLecturerReview(q) ? (
              <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-semibold uppercase tracking-wider bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/10">
                <Clock className="size-3.5" /> Essay Review Required (No
                auto-grading)
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold uppercase tracking-wider bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/10">
                <CheckCircle className="size-3.5" /> Auto-Graded (Instant
                Feedback)
              </div>
            )}
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                isOutRange
                  ? "text-red-500 font-bold"
                  : "text-muted-foreground/75",
              )}
            >
              {wordLabel}
            </span>
          </div>
        </div>
      );
    }

    // ─── G. CASE STUDY ───
    if (type === "casestudy" || type === "case_study") {
      const answersObj =
        typeof currentVal === "object" && currentVal !== null ? currentVal : {};

      return (
        <div className="space-y-6">
          {q.caseStudyContext && (
            <div className="p-4 rounded-xl border border-amber-500/15 bg-amber-500/[0.02] text-sm leading-relaxed italic text-foreground/80">
              <span className="block font-bold text-xs uppercase text-amber-600 mb-1.5 tracking-wider">
                Case Study Context Reference
              </span>
              {q.caseStudyContext}
            </div>
          )}
          {q.options && q.options.length > 0 ? (
            <div className="space-y-6">
              {q.options.map((opt: any, idx: number) => {
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
                        {idx + 1}.{" "}
                        {opt.text || opt.option_text || "Sub-question"}
                      </h4>
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0 font-bold uppercase tracking-wider bg-muted/60"
                      >
                        {marksVal} Marks
                      </Badge>
                    </div>
                    <textarea
                      className="w-full min-h-[100px] p-3 rounded-lg border border-muted bg-background focus:border-primary/40 outline-none text-sm leading-relaxed resize-y"
                      placeholder="Write your response to this sub-question..."
                      value={subAnswer}
                      onChange={(e) => {
                        const newVal = {
                          ...answersObj,
                          [opt.id]: e.target.value,
                        };
                        setAnswers((prev) => ({ ...prev, [q.id]: newVal }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            // Fallback to monolithic textarea if no sub-questions options exist
            <div className="space-y-4">
              <textarea
                className="w-full min-h-[180px] p-4 rounded-xl border border-muted/70 bg-background focus:border-primary/40 outline-none text-sm leading-relaxed resize-y"
                placeholder="Write your analysis and response here..."
                value={typeof currentVal === "string" ? currentVal : ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
              />
            </div>
          )}
          {requiresLecturerReview(q) ? (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-semibold uppercase tracking-wider bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/10">
              <Clock className="size-3.5" /> Case Study Review Required (No
              auto-grading)
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold uppercase tracking-wider bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/10">
              <CheckCircle className="size-3.5" /> Auto-Graded (Instant
              Feedback)
            </div>
          )}
        </div>
      );
    }

    // ─── H. PRACTICAL & COMPUTATIONAL ───
    if (
      type === "practical" ||
      type === "computational" ||
      type === "computationalreasoning"
    ) {
      const isPractical = type === "practical";
      const fileVal =
        typeof currentVal === "object" && currentVal !== null
          ? (currentVal as any)
          : {
              file_url: "",
              filename: "",
              answer_text: typeof currentVal === "string" ? currentVal : "",
            };
      const fileUrl = fileVal.file_url || "";
      const filename = fileVal.filename || "";
      const answerText = fileVal.answer_text || "";

      const allowedFileTypes = q.allowed_file_types || [
        "pdf",
        "docx",
        "zip",
        "jpg",
        "png",
      ];
      const maxFileSize = q.max_file_size || 10;

      return (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-primary/10 bg-primary/[0.01] space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary/60">
              {isPractical
                ? "Instructions & Required Deliverables"
                : "Instructions & Calculation Steps"}
            </p>
            <p className="text-sm text-foreground/80 leading-relaxed font-medium">
              {isPractical
                ? "Please upload the required deliverable files and add your response comments below."
                : "Show your step-by-step calculations and formulas in the editor below. You can optionally upload supporting files (scans, spreadsheets) if needed."}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
              {isPractical
                ? "Deliverable File"
                : "Supporting File / Scan (Optional)"}
            </Label>
            {fileUrl ? (
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="size-5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate max-w-[200px] md:max-w-xs">
                      {filename || "uploaded_file"}
                    </p>
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-medium text-primary hover:underline"
                    >
                      Download Uploaded File
                    </a>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:bg-destructive/10 rounded-lg"
                  onClick={() => {
                    const newVal = { ...fileVal, file_url: "", filename: "" };
                    setAnswers((prev) => ({ ...prev, [q.id]: newVal }));
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:bg-muted/5",
                  isUploadingFile
                    ? "opacity-60 pointer-events-none"
                    : "border-muted-foreground/25",
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    // Size validation
                    if (file.size > maxFileSize * 1024 * 1024) {
                      toast.error(
                        `File size exceeds maximum allowed size of ${maxFileSize}MB.`,
                      );
                      return;
                    }

                    // Format validation
                    const ext = file.name.split(".").pop()?.toLowerCase() || "";
                    if (!allowedFileTypes.includes(ext)) {
                      toast.error(
                        `File format .${ext} is not allowed. Allowed: ${allowedFileTypes.join(", ").toUpperCase()}`,
                      );
                      return;
                    }

                    setIsUploadingFile(true);
                    try {
                      const formData = new FormData();
                      formData.append("file", file);
                      formData.append("attempt_id", attemptId || "");
                      formData.append("question_id", q.id);
                      formData.append("access_token", attemptToken || "");

                      const res =
                        await submissionApi.uploadSubmissionFile(formData);
                      const downloadUrl = res.file_url;
                      const newVal = {
                        ...fileVal,
                        file_url: downloadUrl,
                        filename: file.name,
                      };
                      setAnswers((prev) => ({ ...prev, [q.id]: newVal }));
                      toast.success("File uploaded successfully.");
                    } catch (err: any) {
                      console.error("Upload failed", err);
                      toast.error(err.message || "File upload failed.");
                    } finally {
                      setIsUploadingFile(false);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }
                  }}
                />
                {isUploadingFile ? (
                  <Loader2 className="size-8 text-primary animate-spin" />
                ) : (
                  <Upload className="size-8 text-muted-foreground/60" />
                )}
                <div className="text-center">
                  <p className="text-xs font-semibold text-foreground/80">
                    {isUploadingFile
                      ? "Uploading..."
                      : isPractical
                        ? "Click to select and upload deliverable file"
                        : "Click to select and upload supporting file"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    Supports{" "}
                    {allowedFileTypes.map((t) => t.toUpperCase()).join(", ")} up
                    to {maxFileSize}MB
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
              {isPractical
                ? "Comments & Supporting Notes"
                : "Your Reasoning / Calculations"}
            </Label>
            <textarea
              className={cn(
                "w-full min-h-[140px] p-4 rounded-xl border border-muted/70 bg-background focus:border-primary/40 outline-none text-sm leading-relaxed resize-y",
                !isPractical && "font-mono",
              )}
              placeholder={
                isPractical
                  ? "Write your explanation or notes here..."
                  : "Show your formulas and calculations here..."
              }
              value={answerText}
              onChange={(e) => {
                const newVal = { ...fileVal, answer_text: e.target.value };
                setAnswers((prev) => ({ ...prev, [q.id]: newVal }));
              }}
            />
          </div>

          {requiresLecturerReview(q) ? (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-semibold uppercase tracking-wider bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/10">
              <Clock className="size-3.5" /> Lecturer Review Required (No
              auto-grading)
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold uppercase tracking-wider bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/10">
              <CheckCircle className="size-3.5" /> Auto-Graded (Instant
              Feedback)
            </div>
          )}
        </div>
      );
    }

    if (type === "ordering") {
      return (
        <OrderingQuestion
          q={q}
          attemptId={attemptId}
          currentVal={Array.isArray(currentVal) ? currentVal : undefined}
          setAnswers={setAnswers}
          onInteract={() =>
            setInteractedQuestions((prev) => ({ ...prev, [q.id]: true }))
          }
        />
      );
    }

    // Default Fallback
    const textVal = typeof currentVal === "string" ? currentVal : "";
    return (
      <textarea
        className="w-full min-h-[120px] p-4 rounded-xl border border-muted/70 bg-background focus:border-primary/40 outline-none text-sm leading-relaxed resize-y"
        placeholder="Type your response here..."
        value={textVal}
        onChange={(e) =>
          setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
        }
      />
    );
  };

  if (loading)
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 space-y-6">
        <div className="flex flex-col items-center space-y-3 max-w-md w-full text-center">
          <Loader2 className="size-7 text-primary animate-spin" />
          <h3 className="font-bold text-sm text-foreground">
            {assessment?.title
              ? `Loading "${assessment.title}"...`
              : "Preparing Assessment Session"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
            Initializing secure environment protocols and syncing your
            evaluation configuration.
          </p>
        </div>
        <div className="w-full max-w-md border border-border/50 rounded-xl p-5 space-y-4 bg-muted/[0.01] animate-pulse">
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-5 w-3/4 rounded" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
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

  if (stage === "submitted") {
    if (submitError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 space-y-4">
          <Card className="max-w-md w-full border-destructive/30 shadow-lg">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
              <CardTitle className="text-base text-destructive font-bold">Submission Failed</CardTitle>
              <CardDescription className="text-xs">
                We couldn&apos;t submit your assessment to the server automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your answers are saved locally on this device. Please check your internet connection and click the button below to retry.
              </p>
              <div className="p-3 bg-destructive/[0.03] border border-destructive/10 rounded-lg text-left">
                <p className="font-mono text-[10px] text-destructive leading-normal break-all">
                  {submitError}
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={handleRetryAutoSubmit}
                  disabled={submitting}
                  className="w-full h-9 text-xs font-semibold bg-destructive hover:bg-destructive/90 text-white"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 size-3 animate-spin" /> Submitting...
                    </>
                  ) : (
                    "Retry Submission"
                  )}
                </Button>
                <Button
                  onClick={() => router.push(attemptId ? `/student/results/${attemptId}` : "/student/results")}
                  variant="outline"
                  className="w-full h-9 text-xs font-medium"
                >
                  Go to Results Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Loader2 className="size-8 animate-spin text-primary mb-2" />
        <p className="text-sm text-muted-foreground font-semibold">Recording submission and redirecting to marks review...</p>
      </div>
    );
  }

  const unansweredRequired = questions.filter(
    (q) => q.is_required && !isQuestionAnswered(q, answers[q.id]),
  );
  const unansweredOptional = questions.filter(
    (q) =>
      !q.is_required &&
      !isQuestionAnswered(q, answers[q.id]) &&
      !skippedQuestions[q.id],
  );
  const unansweredRequiredNums = unansweredRequired.map(
    (q) => questions.findIndex((x) => x.id === q.id) + 1,
  );
  const unansweredOptionalNums = unansweredOptional.map(
    (q) => questions.findIndex((x) => x.id === q.id) + 1,
  );
  const firstUnansweredIndex = questions.findIndex(
    (q) =>
      !isQuestionAnswered(q, answers[q.id]) &&
      (q.is_required || !skippedQuestions[q.id]),
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
          <div className="min-w-0 flex items-center gap-2">
            <div className="font-semibold text-sm truncate max-w-[240px] text-foreground/95">
              {assessment?.title}
            </div>
            {assessment?.is_open_book !== undefined && stage === "taking" && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] py-0 font-bold uppercase tracking-wider h-5 px-2 shrink-0 select-none",
                  assessment.is_open_book
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                    : "border-muted-foreground/20 bg-muted/5 text-muted-foreground",
                )}
              >
                {assessment.is_open_book ? "Open Book" : "Closed Book"}
              </Badge>
            )}
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
          {warnings > 0 && (
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold",
                warnings === 1 &&
                  "border-amber-500/20 text-amber-600 bg-amber-500/10",
                warnings >= 2 &&
                  "border-destructive/20 text-destructive bg-destructive/10 animate-pulse",
              )}
            >
              <AlertTriangle className="size-3.5" />
              {warnings}/3 Warnings
            </div>
          )}
          <Button
            onClick={() => setShowSubmitConfirm(true)}
            variant="destructive"
            size="sm"
            className="h-8 text-xs font-medium px-4 rounded-lg shadow-sm transition-all"
            disabled={stage !== "taking"}
          >
            Finalize Attempt
          </Button>
        </div>
      </div>

      {stage === "intro" && assessment && (
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
              {assessment.end_date && (
                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] flex items-start gap-3">
                  <Clock className="size-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-left">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-amber-800">
                      Assessment Submission Window
                    </h4>
                    <p className="text-sm font-semibold text-amber-900 leading-tight">
                      This exam closes at:{" "}
                      {new Date(assessment.end_date).toLocaleTimeString(
                        undefined,
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}{" "}
                      (
                      {new Date(assessment.end_date).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                        },
                      )}
                      )
                    </p>
                    <p className="text-[10px] text-amber-700/80 leading-normal">
                      Ensure you submit your answers before this time. No
                      additional time will be granted.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 border border-border/60 rounded-xl bg-muted/5 text-left">
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mb-1">
                    Duration
                  </p>
                  <p className="text-sm md:text-base font-bold tabular-nums text-foreground">
                    {assessment.duration_minutes || 90} Mins
                  </p>
                </div>
                <div className="p-3.5 border border-border/60 rounded-xl bg-muted/5 text-left">
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mb-1">
                    Total Marks
                  </p>
                  <p className="text-sm md:text-base font-bold tabular-nums text-foreground">
                    {assessment.total_marks || 100} Marks
                  </p>
                </div>
                <div className="p-3.5 border border-border/60 rounded-xl bg-muted/5 text-left">
                  <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mb-1">
                    Reference
                  </p>
                  <p
                    className={cn(
                      "text-sm md:text-base font-bold truncate",
                      assessment.is_open_book
                        ? "text-emerald-600"
                        : "text-muted-foreground/80",
                    )}
                  >
                    {assessment.is_open_book ? "Open Book" : "Closed Book"}
                  </p>
                </div>
              </div>
              {(assessment.max_attempts || 1) > 1 && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/5 text-xs font-medium">
                  <span className="text-muted-foreground">Attempt</span>
                  <span className="font-semibold text-foreground">
                    {attemptNumber} of {assessment.max_attempts}
                  </span>
                </div>
              )}
              {assessment.instructions && (
                <div className="p-4 rounded-xl border border-primary/10 bg-primary/[0.01] text-left space-y-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-primary/80">
                    General Instructions
                  </h4>
                  <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">
                    {assessment.instructions}
                  </p>
                </div>
              )}
              {assessment.sections && assessment.sections.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Assessment Structure & Outline
                  </h3>
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                    {assessment.sections
                      .sort(
                        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
                      )
                      .map((sec, sIdx) => (
                        <div
                          key={sec.id || sIdx}
                          className="p-3 border border-border/50 rounded-lg bg-muted/[0.01]"
                        >
                          <div className="flex items-center justify-between font-semibold text-xs text-foreground mb-1">
                            <span>
                              Section {String.fromCharCode(65 + sIdx)}:{" "}
                              {sec.title}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] py-0 font-bold bg-muted/60 text-muted-foreground"
                            >
                              {sec.allocated_marks ?? 0} Marks
                            </Badge>
                          </div>
                          {sec.instructions && (
                            <p className="text-[10px] text-muted-foreground/90 leading-relaxed italic">
                              {sec.instructions}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
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
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError(null);
                  }}
                  autoFocus
                  autoComplete="new-password"
                />
                {passwordError && (
                  <p className="text-xs text-destructive font-medium text-center">
                    {passwordError}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={isVerifyingPassword}
                  className="w-full h-10 text-xs font-medium rounded-lg shadow-sm"
                >
                  {isVerifyingPassword ? "Authorizing..." : "Authorize Access"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {stage === "readiness" &&
        (() => {
          const readinessItems = [
            assessment?.fullscreen_required && {
              text: "You must remain in full-screen mode throughout this assessment.",
              icon: <Monitor className="size-4 text-amber-600 shrink-0" />,
            },
            assessment?.is_supervised && {
              text: "This session is actively monitored by your lecturer.",
              icon: <Shield className="size-4 text-primary shrink-0" />,
            },
            assessment?.ai_assistance_allowed === false && {
              text: "AI tools and browser extensions are blocked during this assessment.",
              icon: <Lock className="size-4 text-destructive shrink-0" />,
            },
            {
              text: "Your browser activity is logged. Tab switches, copy attempts, and window focus changes are recorded.",
              icon: <Check className="size-4 text-emerald-600 shrink-0" />,
            },
            {
              text: `Receiving 3 integrity warnings will terminate your session. You currently have 0 warnings.`,
              icon: (
                <AlertTriangle className="size-4 text-amber-600 shrink-0" />
              ),
            },
            assessment?.duration_minutes && {
              text: `You have ${assessment?.duration_minutes} minutes. The timer begins immediately when you click Commit & Begin.`,
              icon: <Clock className="size-4 text-foreground/60 shrink-0" />,
            },
          ].filter(Boolean) as { text: string; icon: React.ReactNode }[];

          return (
            <div className="flex-1 flex items-center justify-center p-4">
              <Card className="max-w-md w-full border border-border/50 shadow-none rounded-xl overflow-hidden bg-background">
                <CardHeader className="py-4 border-b bg-muted/20 border-border/40 text-center">
                  <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Protocol Declaration
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-2">
                    {readinessItems.map((item, i) => (
                      <div
                        key={i}
                        className="flex gap-3 p-3 rounded-lg border border-border/40 bg-muted/5 items-center"
                      >
                        {item.icon}
                        <span className="text-xs font-medium text-foreground/75">
                          {item.text}
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
                        I declare and commit adherence to the institutional
                        academic integrity standards.
                      </Label>
                    </div>
                    <Button
                      onClick={handleReadinessConfirm}
                      disabled={!readinessChecked}
                      className="w-full h-10 text-sm font-semibold rounded-lg shadow-sm"
                    >
                      Start Timer & Begin Assessment
                    </Button>
                    <p className="text-[10px] text-muted-foreground text-center font-medium">
                      Note: The assessment countdown timer begins immediately.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

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
                      <span>
                        Progress ({answeredCount} of {questions.length}{" "}
                        answered)
                      </span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress
                      value={progress}
                      className="h-1.5 bg-muted/20 rounded-full"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Mobile Navigation Trigger */}
                    <div className="md:hidden">
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] font-semibold gap-1 rounded-lg border-border hover:bg-muted/50"
                          >
                            <Menu className="size-3.5" /> Navigate
                          </Button>
                        </SheetTrigger>
                        <SheetContent
                          side="bottom"
                          className="h-[75vh] rounded-t-2xl p-6 bg-background flex flex-col border-t"
                        >
                          <SheetHeader className="text-left pb-2">
                            <SheetTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/60">
                              Assessment Matrix
                            </SheetTitle>
                            <SheetDescription className="text-xs text-muted-foreground">
                              Select a question to jump directly to it.
                            </SheetDescription>
                          </SheetHeader>
                          <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-4">
                            {sectionGroups.map(
                              ({
                                sectionId,
                                questions: sectionQuestions,
                                title: sectionTitle,
                              }) => {
                                return (
                                  <div
                                    key={sectionId || "gen"}
                                    className="space-y-2"
                                  >
                                    <div className="text-xs font-semibold text-muted-foreground/75 truncate text-left">
                                      {sectionTitle}
                                    </div>
                                    <div className="grid grid-cols-5 gap-2">
                                      {sectionQuestions.map((q) => {
                                        const idx = questions.findIndex(
                                          (gq) => gq.id === q.id,
                                        );
                                        const isAnswered = isQuestionAnswered(
                                          q,
                                          answers[q.id],
                                        );
                                        const isCurrent =
                                          idx === currentQuestionIndex;
                                        const isFlagged =
                                          flaggedQuestions[q.id];
                                        const isSkipped =
                                          skippedQuestions[q.id];

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

                                        const buttonAriaLabel = `Go to question ${idx + 1}${
                                          isCurrent ? ", current question" : ""
                                        }${
                                          isAnswered
                                            ? isFlagged
                                              ? ", answered, flagged for review"
                                              : isSkipped
                                                ? ", answered, marked as skipped"
                                                : ", answered"
                                            : isFlagged
                                              ? ", unanswered, flagged for review"
                                              : isSkipped
                                                ? ", unanswered, marked as skipped"
                                                : ", unanswered"
                                        }`;

                                        return (
                                          <SheetClose key={q.id} asChild>
                                            <button
                                              onClick={() =>
                                                navigateToQuestion(idx)
                                              }
                                              aria-label={buttonAriaLabel}
                                              className={cn(
                                                "h-9 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center",
                                                isCurrent
                                                  ? "ring-2 ring-primary ring-offset-1 border-primary bg-primary text-primary-foreground"
                                                  : statusColor,
                                              )}
                                            >
                                              {(idx + 1)
                                                .toString()
                                                .padStart(2, "0")}
                                            </button>
                                          </SheetClose>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              },
                            )}
                          </div>
                          {assessment?.instructions && (
                            <div className="pt-4 border-t border-dashed">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-xs font-semibold gap-1.5 rounded-lg"
                                  >
                                    <Info className="size-3.5" /> General
                                    Instructions
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md p-6 border-none shadow-xl rounded-xl bg-background text-left">
                                  <DialogHeader>
                                    <DialogTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/60">
                                      General Instructions
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="my-4 p-4 rounded-xl border border-border bg-muted/5 text-xs text-foreground/85 leading-relaxed max-h-[250px] overflow-y-auto whitespace-pre-line">
                                    {assessment.instructions}
                                  </div>
                                  <div className="flex justify-end">
                                    <DialogClose asChild>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-9 px-4 text-xs font-semibold rounded-lg"
                                      >
                                        Close
                                      </Button>
                                    </DialogClose>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          )}
                        </SheetContent>
                      </Sheet>
                    </div>

                    {saveStatus[currentQ?.id] === "saving" && (
                      <span className="text-xs text-muted-foreground animate-pulse">
                        Saving...
                      </span>
                    )}
                    {saveStatus[currentQ?.id] === "saved" && (
                      <span className="text-xs text-emerald-600 font-medium">
                        Saved{" "}
                        {lastSaved &&
                          `at ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
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
                      {currentQ?.marks || 0} Marks
                    </Badge>
                  </div>
                </div>

                {viewingSectionIntro === currentQ?.assessment_section_id ? (
                  <Card className="shadow-none border border-border/50 rounded-xl overflow-hidden bg-background">
                    <CardContent className="p-8 md:p-12 flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto my-6">
                      <div className="size-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                        <BookOpen className="size-8" />
                      </div>
                      <div className="space-y-2">
                        <Badge
                          variant="outline"
                          className="text-xs font-bold uppercase tracking-wider bg-primary/5 text-primary border-primary/20"
                        >
                          New Section
                        </Badge>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">
                          {currentQ?.section_title || "General Section"}
                        </h2>
                        <div className="flex justify-center gap-6 text-xs text-muted-foreground uppercase font-bold mt-2">
                          <span>
                            {
                              questions.filter(
                                (x) =>
                                  x.assessment_section_id ===
                                  currentQ?.assessment_section_id,
                              ).length
                            }{" "}
                            Questions
                          </span>
                          <span>•</span>
                          <span>
                            {questions
                              .filter(
                                (x) =>
                                  x.assessment_section_id ===
                                  currentQ?.assessment_section_id,
                              )
                              .reduce((sum, x) => sum + (x.marks || 0), 0)}{" "}
                            Marks
                          </span>
                        </div>
                      </div>
                      {currentQ?.section_instructions && (
                        <div className="w-full p-4 rounded-xl border border-primary/10 bg-primary/[0.02] text-sm text-foreground/80 leading-relaxed text-left">
                          <span className="block font-bold text-xs uppercase text-primary/60 mb-2 tracking-wider">
                            Section Instructions
                          </span>
                          {currentQ.section_instructions}
                        </div>
                      )}
                      <Button
                        size="lg"
                        className="w-full sm:w-auto h-11 px-8 rounded-xl font-semibold shadow-sm"
                        onClick={() => setViewingSectionIntro(null)}
                      >
                        Begin Section <ChevronRight className="ml-2 size-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="shadow-none border border-border/50 rounded-xl overflow-hidden bg-background">
                    <CardHeader className="py-4 px-6 border-b bg-muted/20 flex flex-row items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="size-4 text-primary shrink-0" />
                        <span className="text-sm font-bold tracking-tight text-foreground/95">
                          {currentQ?.section_title || "General Section"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
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
                            "h-7 px-2.5 text-xs gap-1 hover:bg-muted/50 rounded-lg transition-colors font-medium",
                            flaggedQuestions[currentQ?.id]
                              ? "text-amber-600 bg-amber-500/10 font-bold"
                              : "text-muted-foreground/80",
                          )}
                        >
                          <Bookmark className="size-3.5" />
                          {flaggedQuestions[currentQ?.id]
                            ? "Flagged"
                            : "Flag for review"}
                        </Button>
                        {!currentQ?.is_required && (
                          <>
                            <Separator
                              orientation="vertical"
                              className="h-4 bg-border/60 mx-1"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (currentQ) {
                                  const nextSkippedVal =
                                    !skippedQuestions[currentQ.id];
                                  setSkippedQuestions((prev) => ({
                                    ...prev,
                                    [currentQ.id]: nextSkippedVal,
                                  }));
                                  saveAnswer(
                                    currentQ.id,
                                    currentQ.type,
                                    answers[currentQ.id],
                                    "manual_save",
                                    nextSkippedVal,
                                  );
                                }
                              }}
                              className={cn(
                                "h-7 px-2.5 text-xs gap-1 rounded-lg transition-all font-medium",
                                skippedQuestions[currentQ?.id]
                                  ? "text-white bg-destructive hover:bg-destructive/90 shadow-sm font-semibold"
                                  : "text-destructive border border-dashed border-destructive/20 bg-destructive/[0.01] hover:bg-destructive/5 hover:text-destructive-foreground",
                              )}
                            >
                              <AlertTriangle className="size-3.5" />
                              {skippedQuestions[currentQ?.id]
                                ? "Skipped"
                                : "Mark as Skipped"}
                            </Button>
                          </>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 md:p-10">
                      {/* Show section instructions when entering a new section */}
                      {currentQ?.section_instructions &&
                        (() => {
                          const firstQOfSection = questions.find(
                            (x) =>
                              x.assessment_section_id ===
                              currentQ.assessment_section_id,
                          );
                          const isFirstQ = firstQOfSection?.id === currentQ.id;
                          if (!isFirstQ) return null;

                          return (
                            <Collapsible
                              open={instructionsExpanded}
                              onOpenChange={setInstructionsExpanded}
                              className="mb-6"
                            >
                              <div className="p-4 rounded-xl border border-primary/10 bg-primary/[0.02] space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold uppercase tracking-widest text-primary/60">
                                    Section Instructions
                                  </span>
                                  <CollapsibleTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 rounded-md"
                                    >
                                      <ChevronDown
                                        className={cn(
                                          "size-4 transition-transform",
                                          instructionsExpanded
                                            ? "rotate-180"
                                            : "",
                                        )}
                                      />
                                    </Button>
                                  </CollapsibleTrigger>
                                </div>
                                <CollapsibleContent className="text-sm text-foreground/75 leading-relaxed space-y-3">
                                  <p>{currentQ.section_instructions}</p>
                                  <div className="flex justify-end pt-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        setInstructionsExpanded(false)
                                      }
                                      className="h-7 text-[10px] font-bold uppercase tracking-wider text-primary border-primary/20 hover:bg-primary/5 rounded-md"
                                    >
                                      Acknowledge and Continue
                                    </Button>
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        })()}
                      <div className="space-y-4 mb-8">
                        <div className="flex items-start gap-3.5">
                          <span className="size-7 bg-muted/60 rounded-lg flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0 mt-1">
                            {currentQuestionIndex + 1}
                          </span>
                          <div className="space-y-1.5 flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                                Question {currentQuestionIndex + 1}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-[9px] h-4.5 py-0 px-1.5 font-bold uppercase tracking-wider bg-muted/80 text-muted-foreground"
                              >
                                {currentQ?.marks || 0} Marks
                              </Badge>
                            </div>
                            <h2 className="text-lg font-medium leading-relaxed text-foreground/90">
                              {currentQ?.text || currentQ?.content}
                            </h2>
                          </div>
                        </div>
                        {currentQ?.imageUrl && (
                          <div className="ml-10.5 p-1 border border-border/40 rounded-xl bg-muted/5 inline-block relative max-w-full overflow-hidden">
                            <Image
                              src={currentQ.imageUrl}
                              alt={
                                currentQ.image_alt_text ||
                                "Question illustration context"
                              }
                              width={480}
                              height={270}
                              className="max-h-[240px] rounded-lg object-contain w-auto h-auto"
                              priority={currentQuestionIndex === 0}
                            />
                          </div>
                        )}
                      </div>
                      <div className="ml-10.5 min-h-[120px]">
                        <QuestionErrorBoundary questionId={currentQ?.id || ""}>
                          {renderQuestion(currentQ)}
                        </QuestionErrorBoundary>
                      </div>
                    </CardContent>
                    <CardFooter className="bg-muted/5 p-4 flex justify-between border-t border-border/40">
                      {currentQuestionIndex > 0 ? (
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
                      ) : (
                        <div />
                      )}
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
                )}
              </div>
            )}
          </div>

          <div className="w-48 lg:w-60 border-l border-border/40 bg-background p-5 hidden md:flex flex-col">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-4 px-1">
              Assessment Matrix
            </h3>
            <div className="space-y-5 overflow-y-auto pr-1 pb-6">
              {sectionGroups.map(
                ({
                  sectionId,
                  questions: sectionQuestions,
                  title: sectionTitle,
                }) => {
                  return (
                    <div key={sectionId || "gen"} className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground/75 px-1 truncate">
                        {sectionTitle}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {sectionQuestions.map((q) => {
                          const idx = questions.findIndex(
                            (gq) => gq.id === q.id,
                          );
                          const isAnswered = isQuestionAnswered(
                            q,
                            answers[q.id],
                          );
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

                          const buttonAriaLabel = `Go to question ${idx + 1}${
                            isCurrent ? ", current question" : ""
                          }${
                            isAnswered
                              ? isFlagged
                                ? ", answered, flagged for review"
                                : isSkipped
                                  ? ", answered, marked as skipped"
                                  : ", answered"
                              : isFlagged
                                ? ", unanswered, flagged for review"
                                : isSkipped
                                  ? ", unanswered, marked as skipped"
                                  : ", unanswered"
                          }`;

                          return (
                            <button
                              key={q.id}
                              onClick={() => navigateToQuestion(idx)}
                              aria-label={buttonAriaLabel}
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
                },
              )}
            </div>
            <div className="mt-auto space-y-3 pt-4 border-t border-dashed border-border/40">
              {assessment?.instructions && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs font-semibold gap-1.5 border-border hover:bg-muted/50 rounded-lg"
                    >
                      <Info className="size-3.5" /> General Instructions
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md p-6 border-none shadow-xl rounded-xl bg-background text-left">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                        General Instructions
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-1">
                        Instructions set for this evaluation session.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="my-4 p-4 rounded-xl border border-border bg-muted/5 text-xs text-foreground/85 leading-relaxed max-h-[300px] overflow-y-auto whitespace-pre-line">
                      {assessment.instructions}
                    </div>
                    <div className="flex justify-end">
                      <DialogClose asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 px-4 text-xs font-semibold rounded-lg"
                        >
                          Close
                        </Button>
                      </DialogClose>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              <div
                className={cn(
                  "flex items-center gap-2 font-medium text-xs",
                  isOnline ? "text-muted-foreground/50" : "text-amber-600",
                )}
              >
                <div
                  className={cn(
                    "size-2 rounded-full",
                    isOnline ? "bg-primary animate-pulse" : "bg-amber-500",
                  )}
                />
                {isOnline ? "Secure Sync Live" : "Offline — Saving Locally"}
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={warningModalOpen} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md p-6 border-none shadow-2xl rounded-xl text-center bg-background"
          role="alertdialog"
          aria-describedby="warning-desc"
        >
          <AlertTriangle className="size-10 text-destructive mx-auto mb-3" />
          <DialogTitle className="text-lg font-semibold text-destructive tracking-tight">
            Integrity Protocols Alert
          </DialogTitle>
          <DialogDescription id="warning-desc" className="text-xs text-muted-foreground mt-1">
            An integrity warning has been flagged on your session. You must
            acknowledge this notice to return to the exam.
          </DialogDescription>
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
              if (currentWarning?.id) {
                try {
                  await integrityApi.acknowledgeWarning({
                    warning_id: currentWarning.id,
                    access_token: attemptToken!,
                  });
                  setWarningModalOpen(false);
                  setCurrentWarning(null);
                } catch (e) {
                  toast.error(
                    "Failed to acknowledge warning. Please try again.",
                  );
                }
              } else {
                setWarningModalOpen(false);
                setCurrentWarning(null);
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
                  {
                    questions.filter((q) =>
                      isQuestionAnswered(q, answers[q.id]),
                    ).length
                  }
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
                  {
                    questions.filter(
                      (q) =>
                        skippedQuestions[q.id] &&
                        !isQuestionAnswered(q, answers[q.id]),
                    ).length
                  }
                </span>
              </div>
            </div>

            {unansweredRequired.length > 0 && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-left">
                <AlertTriangle className="size-4 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 leading-relaxed">
                  <span className="font-semibold block">
                    Required Action Required
                  </span>
                  You have {unansweredRequired.length} unanswered required{" "}
                  {unansweredRequired.length === 1 ? "question" : "questions"}{" "}
                  that must be answered before submission.
                  <span className="block mt-1 font-bold">
                    Questions: {unansweredRequiredNums.join(", ")}
                  </span>
                </div>
              </div>
            )}

            {unansweredOptional.length > 0 && (
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/15 flex items-start gap-2.5 text-left">
                <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                <div className="text-xs text-destructive leading-relaxed">
                  <span className="font-semibold block">
                    Unanswered Optional Questions
                  </span>
                  You have {unansweredOptional.length} unanswered optional{" "}
                  {unansweredOptional.length === 1 ? "question" : "questions"}.
                  <span className="block mt-1 font-bold text-destructive/80">
                    Questions: {unansweredOptionalNums.join(", ")}
                  </span>
                </div>
              </div>
            )}

            {manualSubmitError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-left flex items-start gap-2.5">
                <AlertTriangle className="size-4 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 leading-relaxed">
                  <span className="font-semibold block mb-0.5">Submission Failed</span>
                  {manualSubmitError}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground/90 font-medium text-center pt-1 leading-relaxed">
              Are you sure you want to submit? This action is final and cannot
              be undone.
            </p>
          </div>

          <div className="space-y-2">
            {firstUnansweredIndex !== -1 && (
              <Button
                variant="outline"
                className="w-full h-10 text-xs font-semibold border-primary/20 hover:bg-primary/5 text-primary rounded-lg flex items-center justify-center gap-1.5"
                onClick={() => {
                  navigateToQuestion(firstUnansweredIndex);
                  setShowSubmitConfirm(false);
                }}
              >
                <ArrowRight className="size-3.5" /> Jump to First Unanswered
                (Question {firstUnansweredIndex + 1})
              </Button>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-10 text-xs font-medium rounded-lg"
                onClick={() => setShowSubmitConfirm(false)}
              >
                Cancel & Review
              </Button>
              <Button
                className="flex-1 h-10 text-xs font-semibold rounded-lg shadow-none bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={submitAssessment}
                disabled={submitting || unansweredRequired.length > 0}
              >
                Confirm Submission
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showTerminateConfirm}
        onOpenChange={setShowTerminateConfirm}
      >
        <DialogContent className="sm:max-w-sm p-6 border-none shadow-xl rounded-xl bg-background text-center">
          <AlertTriangle className="size-8 text-destructive mx-auto mb-3" />
          <DialogTitle className="text-base font-semibold text-destructive">
            Terminate Session?
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-2 mb-5 leading-relaxed font-normal">
            This will end your assessment attempt. Your saved answers will be
            preserved.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-9 text-xs rounded-lg"
              onClick={() => setShowTerminateConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-9 text-xs rounded-lg"
              onClick={() => {
                setShowTerminateConfirm(false);
                submitAssessment();
              }}
            >
              Terminate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
