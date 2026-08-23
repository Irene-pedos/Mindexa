// frontend/components/mindexa/study-reader/page-outline.tsx
"use client";

import React, { useState } from "react";
import { PdfOutlineItem } from "./types";
import { ChevronRight, ChevronDown, FileText, Bookmark, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface PageOutlineProps {
  outline: PdfOutlineItem[];
  numPages: number;
  currentPage: number;
  onSelectPage: (page: number) => void;
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

export function PageOutline({ outline, numPages, currentPage, onSelectPage }: PageOutlineProps) {
  const hasOutline = outline.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {hasOutline ? (
            <>
              <Bookmark className="size-3.5 text-primary" />
              <span>Table of Contents</span>
            </>
          ) : (
            <>
              <FileText className="size-3.5 text-primary" />
              <span>Pages ({numPages})</span>
            </>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          Page {currentPage} of {numPages || 1}
        </span>
      </div>

      <ScrollArea className="flex-1 p-2">
        {hasOutline ? (
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
        ) : (
          /* Fallback page grid/list */
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
                    "h-16 flex flex-col items-center justify-center gap-1 rounded-lg border text-xs font-medium transition-all",
                    isCurrent
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40 shadow-xs font-semibold"
                      : "border-border/50 hover:border-border hover:bg-muted/50 text-foreground/80"
                  )}
                >
                  <Hash className={cn("size-3.5", isCurrent ? "text-primary" : "text-muted-foreground/60")} />
                  <span className="tabular-nums">Page {pageNum}</span>
                </Button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
