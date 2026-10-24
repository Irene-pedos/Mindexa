// components/mindexa/assessment/question-bank-selector.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Database,
  FilterX,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { questionApi, type QuestionBankItem } from "@/lib/api/question";
import { cn } from "@/lib/utils";

interface QuestionBankSelectorProps {
  /** Called once per question to add. May be async; batches add one after another. */
  onSelect: (question: QuestionBankItem) => void | Promise<void>;
  /** Bank ids of questions already in the paper (shown as "In paper" and not selectable). */
  selectedIds: string[];
  courseId?: string;
  subjectId?: string;
  /** Where the questions will land, shown in the footer (e.g. "Section A"). */
  targetLabel?: string;
  trigger?: React.ReactNode;
  className?: string;
}

const PAGE_SIZE = 30;

const TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All types" },
  { value: "MCQ", label: "Multiple choice" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "SHORT_ANSWER", label: "Short answer" },
  { value: "ESSAY", label: "Essay" },
  { value: "MATCHING", label: "Matching" },
  { value: "FILL_BLANK", label: "Fill in the blank" },
  { value: "ORDERING", label: "Ordering" },
  { value: "COMPUTATIONAL", label: "Computational" },
  { value: "CASE_STUDY", label: "Case study" },
];

const DIFFICULTIES: Array<{ value: string; label: string }> = [
  { value: "all", label: "Any" },
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

type SortKey = "newest" | "marks_desc" | "marks_asc";

const typeLabel = (t: string) => TYPE_FILTERS.find((x) => x.value === t.toUpperCase())?.label ?? t.replace(/_/g, " ").toLowerCase();

function BankItem({
  q,
  selected,
  inPaper,
  adding,
  expanded,
  detail,
  onToggleSelect,
  onToggleExpand,
  onAdd,
}: {
  q: QuestionBankItem;
  selected: boolean;
  inPaper: boolean;
  adding: boolean;
  expanded: boolean;
  detail: QuestionBankItem | "loading" | undefined;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onAdd: () => void;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border bg-card p-3.5 transition-colors",
        selected && "border-primary/50 bg-primary/5 dark:bg-primary/10",
        inPaper && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          disabled={inPaper}
          onCheckedChange={onToggleSelect}
          aria-label={`Select question: ${q.content.slice(0, 60)}`}
          className="mt-1 shrink-0"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-semibold">
              {typeLabel(q.question_type)}
            </Badge>
            <Badge variant="secondary" className="text-[10px] font-semibold capitalize">
              {q.difficulty.toLowerCase()}
            </Badge>
            <span className="text-[11px] tabular-nums text-muted-foreground font-mono">
              {q.marks} mark{q.marks === 1 ? "" : "s"}
            </span>
            {q.topic && <span className="truncate text-[11px] italic text-muted-foreground">· {q.topic}</span>}
          </div>
          <p className={cn("text-xs sm:text-sm leading-snug text-foreground/90 font-medium", !expanded && "line-clamp-2")}>{q.content}</p>

          {expanded && (
            <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs border border-border/50">
              {detail === "loading" || detail === undefined ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Loading details…
                </p>
              ) : (
                <>
                  {detail.case_study_context && <p className="italic text-muted-foreground leading-relaxed">{detail.case_study_context}</p>}
                  {detail.options?.length > 0 && (
                    <ol className="space-y-1 pt-1">
                      {detail.options.map((o, i) => (
                        <li key={`${i}-${o.option_text}`} className="flex gap-2">
                          <span className={cn("mt-px shrink-0", o.is_correct ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40")}>
                            {o.is_correct ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                          </span>
                          <span>
                            {o.option_text}
                            {o.option_text_right ? <span className="text-muted-foreground"> → {o.option_text_right}</span> : null}
                            {o.match_key ? <span className="text-muted-foreground font-mono"> ({o.match_key}m)</span> : null}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {detail.explanation && <p className="text-muted-foreground pt-1 border-t border-border/40 leading-relaxed">Model answer: {detail.explanation}</p>}
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            aria-expanded={expanded}
          >
            <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide details" : "Preview answer & options"}
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          variant={inPaper ? "secondary" : "default"}
          disabled={inPaper || adding}
          onClick={onAdd}
          className="h-8 shrink-0 px-3 text-xs font-semibold rounded-lg"
        >
          {inPaper ? (
            "In paper"
          ) : adding ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <>
              <Plus className="mr-1 size-3.5" /> Add
            </>
          )}
        </Button>
      </div>
    </li>
  );
}

export function QuestionBankSelector({
  onSelect,
  selectedIds,
  courseId,
  subjectId,
  targetLabel,
  trigger,
  className,
}: QuestionBankSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, QuestionBankItem | "loading">>({});
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handler);
  }, [search]);

  const inPaper = useMemo(() => new Set(selectedIds), [selectedIds]);

  const fetchPage = useCallback(
    async (pageNumber: number) => {
      const first = pageNumber === 1;
      if (first) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const response = await questionApi.getQuestions({
          q: debouncedSearch,
          type: type === "all" ? undefined : type,
          difficulty: difficulty === "all" ? undefined : difficulty,
          course_id: courseId || undefined,
          subject: subjectId || undefined,
          page: pageNumber,
          page_size: PAGE_SIZE,
        });
        setItems((prev) => (first ? response.items : [...prev, ...response.items]));
        setTotal(response.total ?? response.items.length);
        setPage(pageNumber);
      } catch (error) {
        console.error("Failed to fetch questions", error);
        toast.error("Could not load the question bank");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, type, difficulty, courseId, subjectId],
  );

  // Auto-load next page when user scrolls near the bottom of the list
  useEffect(() => {
    if (!sentinelRef.current || loading || loadingMore || items.length >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && items.length < total) {
          void fetchPage(page + 1);
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading, loadingMore, items.length, total, page, fetchPage]);

  // Reload from the first page whenever the panel opens or a filter changes.
  useEffect(() => {
    if (isOpen) void fetchPage(1);
  }, [isOpen, fetchPage]);

  const sorted = useMemo(() => {
    const copy = [...items];
    if (sort === "marks_desc") copy.sort((a, b) => b.marks - a.marks);
    else if (sort === "marks_asc") copy.sort((a, b) => a.marks - b.marks);
    return copy; // "newest" keeps the server order (newest first)
  }, [items, sort]);

  const toggleExpand = async (q: QuestionBankItem) => {
    if (expandedId === q.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(q.id);
    if (!details[q.id]) {
      setDetails((prev) => ({ ...prev, [q.id]: "loading" }));
      try {
        const full = await questionApi.getQuestion(q.id);
        setDetails((prev) => ({ ...prev, [q.id]: full }));
      } catch {
        setDetails((prev) => ({ ...prev, [q.id]: q }));
      }
    }
  };

  const toggleSelect = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addOne = async (q: QuestionBankItem) => {
    setAddingIds((prev) => new Set(prev).add(q.id));
    try {
      await onSelect(q);
      setPicked((prev) => {
        const next = new Set(prev);
        next.delete(q.id);
        return next;
      });
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(q.id);
        return next;
      });
    }
  };

  const addPicked = async () => {
    const chosen = sorted.filter((q) => picked.has(q.id) && !inPaper.has(q.id));
    // One after another: each addition builds on the paper as the previous one left it.
    for (const q of chosen) await addOne(q);
  };

  const filtersActive = search !== "" || type !== "all" || difficulty !== "all";
  const clearFilters = () => {
    setSearch("");
    setType("all");
    setDifficulty("all");
  };
  const pickedCount = [...picked].filter((id) => !inPaper.has(id)).length;
  const anyAdding = addingIds.size > 0;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button
            variant="outline"
            className={cn(
              "flex h-16 flex-1 items-center justify-center gap-2.5 rounded-xl border border-dashed border-border/80 transition-all hover:border-primary/60 hover:bg-primary/[0.04] dark:hover:bg-primary/10",
              className,
            )}
          >
            <Database className="size-4 text-primary" />
            <span className="text-xs font-semibold tracking-wide">Import from Question Bank</span>
          </Button>
        )}
      </SheetTrigger>

      <SheetContent className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-xl md:max-w-2xl bg-background shadow-2xl">
        <SheetHeader className="space-y-1 border-b border-border/60 p-4 sm:p-5 pb-3 sm:pb-4 bg-muted/20 dark:bg-muted/10">
          <SheetTitle className="text-lg font-bold text-foreground">Institutional Question Bank</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {targetLabel ? `Pick approved questions to add to ${targetLabel}.` : "Pick approved questions to reuse in this assessment."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 border-b border-border/60 p-3.5 sm:p-4 bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search question text or topic…"
              className="h-9 sm:h-10 pl-9 pr-9 text-xs sm:text-sm bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search the question bank"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 sm:h-9 text-xs bg-background" aria-label="Question type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-8 sm:h-9 text-xs bg-background" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest" className="text-xs">Newest first</SelectItem>
                <SelectItem value="marks_desc" className="text-xs">Most marks first</SelectItem>
                <SelectItem value="marks_asc" className="text-xs">Fewest marks first</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Difficulty" className="flex flex-1 min-w-[200px] rounded-lg bg-muted/60 p-0.5 border border-border/40">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-xs font-semibold transition-all cursor-pointer",
                    difficulty === d.value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {filtersActive && (
              <Button type="button" variant="ghost" size="sm" className="h-7 sm:h-8 gap-1 px-2 text-xs" onClick={clearFilters}>
                <FilterX className="size-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 sm:px-5 py-2 text-xs text-muted-foreground border-b border-border/40 bg-muted/10">
          <span aria-live="polite" className="font-medium text-[11px] sm:text-xs">
            {loading ? "Searching…" : `${total} question${total === 1 ? "" : "s"}${filtersActive ? " match" : " in the bank"}`}
          </span>
          {pickedCount > 0 && (
            <button type="button" className="font-semibold text-primary hover:underline text-xs cursor-pointer" onClick={() => setPicked(new Set())}>
              Clear selection ({pickedCount})
            </button>
          )}
        </div>

        {/* Native scroll container: silky smooth, touch-friendly, overscroll contained */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-4">
          {loading ? (
            <ul className="space-y-3" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
              ))}
            </ul>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <Database className="size-10 opacity-20" />
              <p className="text-sm font-medium">{filtersActive ? "Nothing matches these filters." : "The bank has no questions yet."}</p>
              {filtersActive ? (
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <p className="max-w-xs text-xs">Use the database icon on a question, or tick “save to bank” when accepting AI questions, to build your library.</p>
              )}
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {sorted.map((q) => (
                  <BankItem
                    key={q.id}
                    q={q}
                    selected={picked.has(q.id)}
                    inPaper={inPaper.has(q.id)}
                    adding={addingIds.has(q.id)}
                    expanded={expandedId === q.id}
                    detail={details[q.id]}
                    onToggleSelect={() => toggleSelect(q.id)}
                    onToggleExpand={() => void toggleExpand(q)}
                    onAdd={() => void addOne(q)}
                  />
                ))}
              </ul>
              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-4 w-full" />
              {items.length < total && (
                <div className="flex justify-center pt-2 pb-4">
                  <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={() => void fetchPage(page + 1)} className="rounded-xl text-xs font-semibold">
                    {loadingMore ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
                    Load more ({total - items.length} left)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border/60 bg-muted/20 dark:bg-muted/10 p-3.5 sm:p-4">
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="rounded-xl text-xs sm:text-sm font-semibold">
            Done
          </Button>
          <Button type="button" disabled={pickedCount === 0 || anyAdding} onClick={() => void addPicked()} className="rounded-xl text-xs sm:text-sm font-semibold">
            {anyAdding ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-1.5 size-4" />}
            {pickedCount > 0 ? `Add ${pickedCount} selected` : "Select questions to add"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
