"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { QuestionIssue, QuestionStatus, ReadinessResult } from "@/lib/assessment-readiness";

export interface NavigatorQuestion {
  id: string;
  sectionId: string;
  text: string;
  type: string;
  marks: number;
  aiGenerated?: boolean;
  caseStudyContext?: string;
}

export interface NavigatorSection {
  id: string;
  section: string;
  marks: number;
  questions: number;
}

type Filter = "all" | "needs" | "ai";

const STATUS_STYLE: Record<QuestionStatus, { dot: string; label: string; chip: string }> = {
  ready: { dot: "bg-emerald-500", label: "Complete", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  review: { dot: "bg-amber-500", label: "Needs a look", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  needs_work: { dot: "bg-red-500", label: "Unfinished", chip: "bg-red-500/15 text-red-700 dark:text-red-300" },
};

function ProgressRing({ done, total, size = 40 }: { done: number; total: number; size?: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const fraction = total === 0 ? 0 : done / total;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" className="-rotate-90" width={size} height={size} aria-hidden="true">
        <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-emerald-500 transition-[stroke-dashoffset] duration-500"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums">
        {total === 0 ? 0 : Math.round(fraction * 100)}%
      </span>
    </span>
  );
}

/** One compact line per question: details live in the tooltip, not in the list. */
function NavItem({
  question,
  number,
  status,
  issues,
  active,
  aiUnreviewed,
  typeLabel,
  draggable,
  onSelect,
}: {
  question: NavigatorQuestion;
  number: number;
  status: QuestionStatus;
  issues: QuestionIssue[];
  active: boolean;
  aiUnreviewed: boolean;
  typeLabel: string;
  draggable: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
    disabled: !draggable,
  });
  const blocking = issues.filter((i) => i.severity === "blocking").length;
  const preview = (question.text || question.caseStudyContext || "").replace(/\s+/g, " ").trim();
  const tooltip = [
    `Q${number} · ${typeLabel} · ${question.marks} mark${question.marks === 1 ? "" : "s"}`,
    STATUS_STYLE[status].label,
    ...issues.filter((i) => i.severity !== "suggestion").map((i) => `• ${i.message}`),
  ].join("\n");

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("list-none", isDragging && "z-10 opacity-70")}
    >
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-1.5 transition-colors",
          active ? "bg-primary/10" : "hover:bg-muted/70",
        )}
      >
        {draggable ? (
          <button
            type="button"
            aria-label={`Reorder question ${number}`}
            className="cursor-grab touch-none px-0.5 py-1.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : (
          <span className="w-[18px]" />
        )}
        <button
          type="button"
          onClick={onSelect}
          title={tooltip}
          aria-current={active ? "true" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          <span className={cn("size-2 shrink-0 rounded-full", STATUS_STYLE[status].dot)} />
          <span className="w-6 shrink-0 text-xs font-semibold tabular-nums">Q{number}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{preview || "Empty question"}</span>
          {aiUnreviewed && <Sparkles className="size-3 shrink-0 text-violet-500" aria-label="AI draft not yet reviewed" />}
          {blocking > 0 ? (
            <span className="shrink-0 rounded bg-red-500/15 px-1 text-[10px] font-bold text-red-700 dark:text-red-300">{blocking}</span>
          ) : (
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{question.marks}m</span>
          )}
        </button>
      </div>
    </li>
  );
}

export function QuestionNavigator({
  sections,
  questions,
  status,
  issuesByQuestion,
  reviewedIds,
  activeId,
  typeLabels,
  summary,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onNextUnfinished,
  onReorder,
  className,
}: {
  sections: NavigatorSection[];
  questions: NavigatorQuestion[];
  status: ReadinessResult["status"];
  issuesByQuestion: ReadinessResult["perQuestion"];
  reviewedIds: ReadonlySet<string>;
  activeId: string | null;
  typeLabels: Record<string, string>;
  summary: ReadinessResult["summary"];
  /** Collapsed = a thin rail with progress and numbered dots. Omit on mobile (always full). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onSelect: (id: string) => void;
  onNextUnfinished: () => void;
  onReorder: (sectionId: string, fromId: string, toId: string) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const numbering = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sections) {
      questions.filter((q) => q.sectionId === s.id).forEach((q, i) => map.set(q.id, i + 1));
    }
    return map;
  }, [sections, questions]);

  const unfinished = summary.needsWork + summary.review;

  if (collapsed) {
    return (
      <div className={cn("flex min-h-0 flex-col items-center gap-2 rounded-xl border bg-card py-2", className)}>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onToggleCollapsed} aria-label="Expand question list" title="Expand question list">
          <PanelLeftOpen className="size-4" />
        </Button>
        <ProgressRing done={summary.ready} total={summary.total} size={36} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={unfinished === 0}
          onClick={onNextUnfinished}
          aria-label="Next unfinished question"
          title="Next unfinished question"
        >
          <ArrowDown className="size-4" />
        </Button>
        <ScrollArea className="min-h-0 w-full flex-1">
          <div className="flex flex-col items-center gap-1 px-1 pb-1">
            {sections.map((s, si) => {
              const inSection = questions.filter((q) => q.sectionId === s.id);
              return (
                <div key={s.id} className="flex w-full flex-col items-center gap-1">
                  {si > 0 && inSection.length > 0 && <span className="my-0.5 h-px w-5 bg-border" />}
                  {inSection.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => onSelect(q.id)}
                      title={`${s.section} · Q${numbering.get(q.id)} · ${STATUS_STYLE[status[q.id] ?? "ready"].label}`}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition-colors",
                        STATUS_STYLE[status[q.id] ?? "ready"].chip,
                        q.id === activeId && "ring-2 ring-primary",
                      )}
                    >
                      {numbering.get(q.id)}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }

  const visible = (q: NavigatorQuestion): boolean => {
    if (filter === "needs") return status[q.id] !== "ready";
    if (filter === "ai") return !!q.aiGenerated && !reviewedIds.has(q.id);
    return true;
  };

  const handleDragEnd = (sectionId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(sectionId, String(active.id), String(over.id));
  };

  const filters: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: "All", count: summary.total },
    { id: "needs", label: "To do", count: unfinished },
    { id: "ai", label: "AI drafts", count: summary.aiUnreviewed },
  ];

  return (
    <div className={cn("flex min-h-0 flex-col rounded-xl border bg-card", className)}>
      <div className="flex items-center gap-3 border-b px-3 py-2.5">
        <ProgressRing done={summary.ready} total={summary.total} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {summary.ready}/{summary.total} complete
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {unfinished === 0 ? "All finished" : `${unfinished} to go`}
          </p>
        </div>
        {onToggleCollapsed && (
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={onToggleCollapsed} aria-label="Collapse question list" title="Collapse question list">
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b px-2 py-2">
        <div role="tablist" aria-label="Filter questions" className="flex flex-1 rounded-lg bg-muted/60 p-0.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
                filter === f.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          disabled={unfinished === 0}
          onClick={onNextUnfinished}
          aria-label="Next unfinished question"
          title="Next unfinished question"
        >
          <ArrowDown className="size-3.5" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-2">
          {sections.map((s) => {
            const inSection = questions.filter((q) => q.sectionId === s.id);
            const shown = inSection.filter(visible);
            if (inSection.length === 0 && filter !== "all") return null;
            return (
              <section key={s.id}>
                <h4 className="mb-1 flex items-center justify-between px-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="truncate">{s.section}</span>
                  <span className={cn("tabular-nums", inSection.length < s.questions && "text-amber-600")}>
                    {inSection.length}/{s.questions}
                  </span>
                </h4>
                {inSection.length === 0 ? (
                  <p className="flex items-center gap-1.5 px-1.5 text-[11px] text-amber-600">
                    <AlertTriangle className="size-3" /> No questions yet
                  </p>
                ) : shown.length === 0 ? (
                  <p className="flex items-center gap-1.5 px-1.5 text-[11px] text-emerald-600">
                    <CheckCircle2 className="size-3" /> Nothing here
                  </p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(s.id)}>
                    <SortableContext items={shown.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                      <ul>
                        {shown.map((q) => (
                          <NavItem
                            key={q.id}
                            question={q}
                            number={numbering.get(q.id) ?? 0}
                            status={status[q.id] ?? "ready"}
                            issues={issuesByQuestion[q.id] ?? []}
                            active={q.id === activeId}
                            aiUnreviewed={!!q.aiGenerated && !reviewedIds.has(q.id)}
                            typeLabel={typeLabels[q.type] ?? q.type}
                            draggable={filter === "all"}
                            onSelect={() => onSelect(q.id)}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
              </section>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
