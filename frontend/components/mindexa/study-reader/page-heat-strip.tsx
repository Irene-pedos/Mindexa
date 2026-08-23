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
  if (numPages <= 0) return null;

  const heatByPage = new Map<number, PageHeatItem>();
  for (const item of heatmap) {
    heatByPage.set(item.page_number, item);
  }

  // Create array for all pages
  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className="fixed right-3 top-20 bottom-8 w-6 z-30 flex flex-col items-center justify-between py-2 px-0.5 rounded-full bg-card/85 backdrop-blur-md border border-border/60 shadow-lg select-none hidden md:flex"
        title="Document Weakness Heatmap"
      >
        <Flame className="size-3 text-rose-500 shrink-0 mb-1" />

        <div className="flex-1 w-full flex flex-col justify-between items-center py-1 gap-px">
          {pages.map((p) => {
            const heatItem = heatByPage.get(p);
            const isCurrent = p === currentPage;
            const heatLevel = heatItem?.heat_level || "none";

            let tickColor = "bg-muted hover:bg-muted-foreground/40";
            if (heatLevel === "high") {
              tickColor = "bg-rose-500 ring-1 ring-rose-400/80 shadow-xs shadow-rose-500/50";
            } else if (heatLevel === "medium") {
              tickColor = "bg-amber-500 ring-1 ring-amber-400/80 shadow-xs shadow-amber-500/50";
            } else if (heatLevel === "low") {
              tickColor = "bg-sky-400/80";
            }

            return (
              <Tooltip key={p}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelectPage(p)}
                    className={cn(
                      "w-2.5 rounded-full transition-all flex items-center justify-center relative",
                      numPages > 50 ? "h-1" : "h-1.5",
                      tickColor,
                      isCurrent && "w-4 h-2 bg-primary ring-2 ring-primary ring-offset-1 ring-offset-background z-10"
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs p-2 max-w-56 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">Page {p}</span>
                    {heatItem && heatItem.heat > 0 && (
                      <span
                        className={cn(
                          "text-[10px] font-mono font-bold px-1 rounded",
                          heatLevel === "high"
                            ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                            : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
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
                      {isCurrent ? "Current reading position" : "Click to navigate"}
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
