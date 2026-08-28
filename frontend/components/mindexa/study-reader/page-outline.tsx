// frontend/components/mindexa/study-reader/page-outline.tsx
"use client";

import React, { useState, useEffect } from "react";
import { PdfOutlineItem, ReaderLearningUnitItem, ReaderSource } from "./types";
import { ChevronRight, ChevronDown, FileText, Bookmark, Hash, Layers, CheckCircle2, Sparkles, BookOpen, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { studyReaderApi } from "@/lib/api/study-reader";

interface PageOutlineProps {
  outline: PdfOutlineItem[];
  numPages: number;
  currentPage: number;
  onSelectPage: (page: number) => void;
  source?: ReaderSource;
}

interface OutlineNodeProps {
  item: PdfOutlineItem;
  currentPage: number;
  onSelectPage: (page: number) => void;
  depth?: number;
}

function OutlineNode({ item, currentPage, onSelectPage, depth = 0 }: OutlineNodeProps) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = item.items && item.items.length > 0;
  const isCurrent = item.pageNumber === currentPage;

  const handleClick = () => {
    if (item.pageNumber) {
      onSelectPage(item.pageNumber);
    }
  };

  return (
    <div className="flex flex-col select-none">
      <div
        className={cn(
          "group flex items-center justify-between gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium cursor-pointer transition-colors",
          isCurrent
            ? "bg-primary/10 text-primary font-semibold"
            : "text-foreground/80 hover:bg-muted/60 hover:text-foreground"
        )}
        style={{ paddingLeft: `${Math.max(8, depth * 14 + 8)}px` }}
        onClick={handleClick}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {hasChildren ? (
            <button
              type="button"
              className="p-0.5 -ml-1 text-muted-foreground hover:text-foreground rounded"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
            >
              {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          ) : (
            <Bookmark className={cn("size-3 shrink-0", isCurrent ? "text-primary" : "text-muted-foreground/60")} />
          )}
          <span className="truncate" title={item.title}>
            {item.title}
          </span>
        </div>

        {item.pageNumber && (
          <span
            className={cn(
              "text-[10px] tabular-nums px-1.5 py-0.5 rounded font-mono shrink-0",
              isCurrent ? "bg-primary/20 text-primary" : "text-muted-foreground group-hover:text-foreground"
            )}
          >
            p. {item.pageNumber}
          </span>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="flex flex-col">
          {item.items!.map((child, idx) => (
            <OutlineNode
              key={`${child.title}-${idx}-${depth + 1}`}
              item={child}
              currentPage={currentPage}
              onSelectPage={onSelectPage}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PageOutline({ outline, numPages, currentPage, onSelectPage, source }: PageOutlineProps) {
  const [learningUnits, setLearningUnits] = useState<ReaderLearningUnitItem[]>([]);
  const [loadingLUs, setLoadingLUs] = useState(false);
  const [outlineMode, setOutlineMode] = useState<"curriculum" | "embedded" | "pages">("curriculum");

  const hasEmbeddedOutline = outline && outline.length > 0;

  const sourceId = source?.id;
  const sourceKind = source?.kind;

  // Load canonical Learning Units for this material
  useEffect(() => {
    if (!sourceId || sourceKind !== "lecturer_material") {
      setLearningUnits([]);
      return;
    }

    async function loadLUs() {
      try {
        setLoadingLUs(true);
        const units = await studyReaderApi.getLearningUnits(sourceKind!, sourceId!);
        setLearningUnits(units || []);
        if (units && units.length > 0) {
          setOutlineMode("curriculum");
        } else if (hasEmbeddedOutline) {
          setOutlineMode("embedded");
        } else {
          setOutlineMode("pages");
        }
      } catch (err) {
        console.error("Failed to load reader learning units", err);
      } finally {
        setLoadingLUs(false);
      }
    }

    loadLUs();
  }, [sourceId, sourceKind, hasEmbeddedOutline]);

  const hasCurriculum = learningUnits && learningUnits.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with Mode Switching */}
      <div className="p-2.5 border-b border-border/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Bookmark className="size-3.5 text-primary" />
            <span>Document Outline</span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            Page {currentPage} of {numPages || 1}
          </span>
        </div>

        {/* View switcher tabs if multiple outline modes available */}
        {(hasCurriculum || hasEmbeddedOutline) && (
          <div className="flex items-center p-0.5 bg-muted/60 rounded-lg border border-border/50 text-[11px]">
            {hasCurriculum && (
              <button
                type="button"
                onClick={() => setOutlineMode("curriculum")}
                className={cn(
                  "flex-1 py-1 px-2 rounded-md font-medium text-center transition-all flex items-center justify-center gap-1",
                  outlineMode === "curriculum"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Layers className="size-3 text-primary" />
                <span>Curriculum ({learningUnits.length})</span>
              </button>
            )}
            {hasEmbeddedOutline && (
              <button
                type="button"
                onClick={() => setOutlineMode("embedded")}
                className={cn(
                  "flex-1 py-1 px-2 rounded-md font-medium text-center transition-all flex items-center justify-center gap-1",
                  outlineMode === "embedded"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="size-3 text-primary" />
                <span>Bookmarks</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setOutlineMode("pages")}
              className={cn(
                "py-1 px-2 rounded-md font-medium text-center transition-all flex items-center justify-center gap-1",
                outlineMode === "pages"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Hash className="size-3 text-muted-foreground" />
              <span>Pages</span>
            </button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0 p-2">
        {outlineMode === "curriculum" && hasCurriculum ? (
          /* Canonical Curriculum Learning Units View */
          <div className="space-y-2 pb-4">
            {learningUnits.map((lu) => {
              const inRange =
                lu.start_page &&
                lu.end_page &&
                currentPage >= lu.start_page &&
                currentPage <= lu.end_page;
              const isStart = lu.start_page === currentPage;

              return (
                <div
                  key={lu.id}
                  onClick={() => lu.start_page && onSelectPage(lu.start_page)}
                  className={cn(
                    "p-2.5 rounded-xl border text-xs cursor-pointer transition-all space-y-1.5 select-none",
                    inRange
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/50 bg-card hover:border-border hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge
                        variant={inRange ? "default" : "secondary"}
                        className="text-[9px] px-1.5 py-0 shrink-0 font-mono font-semibold"
                      >
                        Unit {lu.order_index}
                      </Badge>
                      <span className="font-semibold text-foreground text-xs truncate" title={lu.title}>
                        {lu.title}
                      </span>
                    </div>

                    {lu.start_page && (
                      <span
                        className={cn(
                          "text-[10px] tabular-nums px-1.5 py-0.5 rounded font-mono shrink-0 font-semibold",
                          inRange
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        p. {lu.start_page}{lu.end_page && lu.end_page !== lu.start_page ? `–${lu.end_page}` : ""}
                      </span>
                    )}
                  </div>

                  {lu.summary && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {lu.summary}
                    </p>
                  )}

                  {lu.learning_outcomes && lu.learning_outcomes.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/30">
                      <p className="text-[10px] font-medium text-foreground/80">Outcomes:</p>
                      <ul className="space-y-0.5 pl-1">
                        {lu.learning_outcomes.map((lo, oIdx) => (
                          <li key={oIdx} className="text-[10px] text-muted-foreground flex items-start gap-1 leading-tight">
                            <span className="text-primary shrink-0 mt-0.5">•</span>
                            <span className="line-clamp-2">{lo}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="size-2.5 text-primary" /> ~{lu.estimated_study_minutes}m study
                    </span>
                    {inRange && (
                      <span className="text-[10px] text-primary font-semibold flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                        Current Focus
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : outlineMode === "embedded" && hasEmbeddedOutline ? (
          /* Native Embedded Bookmarks View */
          <div className="space-y-0.5 pb-4">
            {outline.map((item, idx) => (
              <OutlineNode
                key={`${item.title}-${idx}`}
                item={item}
                currentPage={currentPage}
                onSelectPage={onSelectPage}
                depth={0}
              />
            ))}
          </div>
        ) : numPages <= 30 || outlineMode === "pages" ? (
          /* Page grid */
          <div className="grid grid-cols-2 gap-2 p-1 pb-4">
            {Array.from({ length: numPages || 1 }, (_, i) => i + 1).map((pageNum) => {
              const isCurrent = pageNum === currentPage;
              return (
                <Button
                  key={pageNum}
                  variant={isCurrent ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => onSelectPage(pageNum)}
                  className={cn(
                    "h-14 flex flex-col items-center justify-center gap-0.5 rounded-lg border text-xs font-medium transition-all",
                    isCurrent
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40 shadow-xs font-semibold"
                      : "border-border/50 hover:border-border hover:bg-muted/50 text-foreground/80"
                  )}
                >
                  <Hash className={cn("size-3", isCurrent ? "text-primary" : "text-muted-foreground/60")} />
                  <span className="tabular-nums">Page {pageNum}</span>
                </Button>
              );
            })}
          </div>
        ) : (
          /* Notice for longer documents */
          <div className="py-12 px-4 text-center space-y-3">
            <div className="size-10 rounded-full bg-muted/60 mx-auto flex items-center justify-center border border-border/50 text-muted-foreground">
              <Bookmark className="size-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-foreground">Document Outline</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[240px] mx-auto">
                Use the page input in the top bar or document search (<kbd className="font-mono font-semibold">Ctrl+F</kbd>) to navigate all {numPages} pages.
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
