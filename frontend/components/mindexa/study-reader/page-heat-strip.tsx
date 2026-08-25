// frontend/components/mindexa/study-reader/page-heat-strip.tsx
"use client";

import React from "react";
import { PageHeatItem } from "./types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeatStripProps {
  numPages: number;
  currentPage: number;
  heatmap: PageHeatItem[];
  onSelectPage: (page: number) => void;
}

export function PageHeatStrip({
  numPages,
  currentPage,
  heatmap,
  onSelectPage,
}: PageHeatStripProps) {
  // Hide heat strip on very short documents (< 5 pages) to avoid sparse/awkward display
  if (numPages < 5) return null;

  const heatByPage = new Map<number, PageHeatItem>();
  for (const item of heatmap) {
    heatByPage.set(item.page_number, item);
  }

  // Dynamic bucket scale: clamp ticks to avoid solid compression for large documents
  const maxBuckets = numPages > 120 ? 30 : numPages > 60 ? 35 : 40;
  const isBanded = numPages > maxBuckets;

  const pages = !isBanded
    ? Array.from({ length: numPages }, (_, i) => ({
        startPage: i + 1,
        endPage: i + 1,
      }))
    : Array.from({ length: maxBuckets }, (_, i) => {
        const startPage = Math.floor((i * numPages) / maxBuckets) + 1;
        const endPage = Math.min(
          numPages,
          Math.floor(((i + 1) * numPages) / maxBuckets),
        );
        return { startPage, endPage };
      });

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className="absolute right-2 top-4 bottom-20 w-3 hover:w-7 z-20 flex-col items-center justify-between py-2 px-0.5 rounded-full bg-card/70 hover:bg-card/95 backdrop-blur-md border border-border/40 hover:border-border/80 shadow-md hover:shadow-xl transition-all duration-200 select-none hidden md:flex opacity-50 hover:opacity-100 group"
        title="Document Weakness Heatmap (Hover to view)"
      >
        <Flame className="size-3 text-rose-500 shrink-0 mb-1 group-hover:scale-110 transition-transform" />

        <div className="flex-1 w-full flex flex-col justify-between items-center py-1 gap-px">
          {pages.map(({ startPage, endPage }) => {
            const bucketItems = Array.from(
              { length: endPage - startPage + 1 },
              (_, i) => heatByPage.get(startPage + i),
            ).filter(Boolean) as PageHeatItem[];
            const heatItem = bucketItems.reduce<PageHeatItem | undefined>(
              (highest, item) =>
                !highest || item.heat > highest.heat ? item : highest,
              undefined,
            );
            const isCurrent =
              currentPage >= startPage && currentPage <= endPage;
            const heatLevel = heatItem?.heat_level || "none";

            let tickColor = "bg-muted hover:bg-muted-foreground/40";
            if (heatLevel === "high") {
              tickColor =
                "bg-rose-500 ring-1 ring-rose-400/80 shadow-xs shadow-rose-500/50";
            } else if (heatLevel === "medium") {
              tickColor =
                "bg-amber-500 ring-1 ring-amber-400/80 shadow-xs shadow-amber-500/50";
            } else if (heatLevel === "low") {
              tickColor = "bg-sky-400/80";
            }

            return (
              <Tooltip key={startPage}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelectPage(startPage)}
                    className={cn(
                      "w-2.5 rounded-full transition-all flex items-center justify-center relative",
                      numPages > 50 ? "h-1" : "h-1.5",
                      tickColor,
                      isCurrent &&
                        "w-4 h-2 bg-primary ring-2 ring-primary ring-offset-1 ring-offset-background z-10",
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="left"
                  className="text-xs p-2 max-w-56 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {startPage === endPage
                        ? `Page ${startPage}`
                        : `Pages ${startPage}-${endPage}`}
                    </span>
                    {heatItem && heatItem.heat > 0 && (
                      <span
                        className={cn(
                          "text-[10px] font-mono font-bold px-1 rounded",
                          heatLevel === "high"
                            ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                            : "bg-amber-500/20 text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {Math.round(heatItem.heat * 100)}% Heat
                      </span>
                    )}
                  </div>
                  {heatItem?.summary_reason ? (
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {heatItem.summary_reason}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {isCurrent
                        ? "Current reading position"
                        : "Click to navigate"}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <span className="text-[8px] font-mono text-muted-foreground font-semibold mt-1">
          {currentPage}
        </span>
      </div>
    </TooltipProvider>
  );
}
