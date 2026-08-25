// frontend/components/mindexa/study-reader/focus-panel.tsx
"use client";

import React from "react";
import {
  FocusResponse,
  ReaderSource,
} from "./types";
import {
  Flame,
  Target,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Info,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Bookmark,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface FocusPanelProps {
  source: ReaderSource;
  currentPage: number;
  focusData: FocusResponse | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSelectPage: (
    page: number,
    focusInfo?: { title: string; reason?: string; quote?: string },
  ) => void;
  onMarkReviewed: (kpId: string) => Promise<void>;
  onOpenPageCheck: (pageNumber: number) => void;
}

export function FocusPanel({
  source,
  currentPage,
  focusData,
  loading,
  refreshing,
  onRefresh,
  onSelectPage,
  onMarkReviewed,
  onOpenPageCheck,
}: FocusPanelProps) {
  return (
    <div className="flex flex-col h-full min-h-0 select-none">
      {/* Top Header */}
      <div className="p-3 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Flame className="size-4 text-rose-500 shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">
            Weakness Engine
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh weakness analysis"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin text-primary")} />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-xs font-semibold rounded-lg gap-1 text-primary bg-primary/10 hover:bg-primary/20"
            onClick={() => onOpenPageCheck(currentPage)}
          >
            <Target className="size-3.5" />
            <span>Quiz p. {currentPage}</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 p-3">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <Flame className="size-8 text-rose-500 animate-pulse" />
            <p className="text-xs text-muted-foreground">Mapping assessment weakness & study heat…</p>
          </div>
        ) : focusData ? (
          <div className="space-y-4 pb-6">
            {/* Personal PDF Notice */}
            {!focusData.exam_mapping && (
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex items-start gap-2.5">
                <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">Personal Study Resource</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Weakness heat is generated from your self-ratings and page quizzes. Assessment exam mapping is enabled on enrolled course materials.
                  </p>
                </div>
              </div>
            )}

            {/* 1. FOCUS NEXT (Top Recommendations) */}
            {focusData.focus_next.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1">
                    <Target className="size-3" />
                    <span>Focus Next</span>
                  </span>
                  <Badge variant="outline" className="text-[9px] font-mono h-4 px-1 border-rose-500/30 text-rose-600 dark:text-rose-400">
                    {focusData.focus_next.length} priorities
                  </Badge>
                </div>

                <div className="space-y-2">
                  {focusData.focus_next.map((fn, idx) => (
                    <div
                      key={idx}
                      onClick={() =>
                        onSelectPage(fn.start_page, {
                          title: fn.title,
                          reason: fn.reason,
                        })
                      }
                      className={cn(
                        "p-3 rounded-xl border bg-card/70 hover:bg-card transition-all cursor-pointer group shadow-xs space-y-2",
                        fn.heat_level === "high"
                          ? "border-rose-500/40 hover:border-rose-500/80 hover:shadow-rose-500/5"
                          : "border-amber-500/40 hover:border-amber-500/80"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                          {fn.title}
                        </span>

                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono font-bold shrink-0 h-5 px-1.5 gap-1",
                            fn.heat_level === "high"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          )}
                        >
                          <span>p. {fn.start_page}</span>
                          <ArrowRight className="size-2.5 group-hover:translate-x-0.5 transition-transform" />
                        </Badge>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                        {fn.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-1.5">
                <CheckCircle2 className="size-6 text-emerald-500 mx-auto" />
                <h4 className="text-xs font-semibold text-foreground">No Critical Weaknesses Flagged</h4>
                <p className="text-[11px] text-muted-foreground">
                  You&apos;re performing well across this material. Test yourself with a Page Quiz!
                </p>
              </div>
            )}

            {/* 2. SPACED REVISIT QUEUE */}
            {focusData.spaced_reviews.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>Review Queue ({focusData.spaced_reviews.length})</span>
                  </span>
                </div>

                <div className="space-y-2">
                  {focusData.spaced_reviews.map((kp) => (
                    <div
                      key={kp.id}
                      className="p-2.5 rounded-xl border border-border/50 bg-card/60 hover:bg-card transition-colors space-y-2 shadow-2xs cursor-pointer"
                      onClick={() =>
                        onSelectPage(kp.page_number, {
                          title: kp.title,
                          quote: kp.quote || undefined,
                        })
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {kp.title}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPage(kp.page_number, {
                              title: kp.title,
                              quote: kp.quote || undefined,
                            });
                          }}
                          className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
                          title={`Jump to Page ${kp.page_number}`}
                        >
                          p. {kp.page_number}
                        </button>
                      </div>

                      {kp.quote && (
                        <p className="text-[10px] text-muted-foreground font-serif italic line-clamp-1 border-l border-primary/40 pl-1.5">
                          &ldquo;{kp.quote}&rdquo;
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-border/30">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-semibold h-4 px-1.5",
                            kp.confidence === "lost"
                              ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                          )}
                        >
                          {kp.confidence === "lost" ? "Need review" : "Fuzzy"}
                        </Badge>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] px-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-md gap-1"
                          onClick={() => onMarkReviewed(kp.id)}
                        >
                          <Check className="size-3" />
                          <span>Got it now</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. HEATMAP SUMMARY LEGEND */}
            <div className="p-3 rounded-xl bg-card/60 border border-border/40 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Heatmap Legend
              </span>
              <div className="space-y-1.5 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-rose-500 ring-2 ring-rose-400/30 shrink-0" />
                  <span className="font-medium text-foreground">High Heat:</span>
                  <span>Exam marks lost / flagged lost</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-amber-500 ring-2 ring-amber-400/30 shrink-0" />
                  <span className="font-medium text-foreground">Medium Heat:</span>
                  <span>Fuzzy confidence / confused notes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-sky-400 shrink-0" />
                  <span className="font-medium text-foreground">Low / Active:</span>
                  <span>Study highlights & key points</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
}
