// frontend/components/mindexa/study-reader/reader-search.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { SearchMatch } from "./types";
import { Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ReaderSearchProps {
  searchQuery: string;
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
  isSearching: boolean;
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onSelectMatch: (index: number) => void;
  currentPage: number;
}

export function ReaderSearch({
  searchQuery,
  searchMatches,
  currentMatchIndex,
  isSearching,
  onSearch,
  onClearSearch,
  onNextMatch,
  onPrevMatch,
  onSelectMatch,
  currentPage,
}: ReaderSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        onPrevMatch();
      } else {
        onNextMatch();
      }
    } else if (e.key === "Escape") {
      onClearSearch();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search Input Bar */}
      <div className="p-3 border-b border-border/40 space-y-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search document… (Enter for next)"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-8 pr-16 h-8 text-xs bg-muted/40 rounded-lg"
          />
          <div className="absolute right-1 flex items-center gap-0.5">
            {isSearching ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground mr-1.5" />
            ) : searchQuery ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={onClearSearch}
                title="Clear search"
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        {/* Counter and Prev/Next Navigation */}
        {searchQuery.trim().length > 0 && (
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-muted-foreground text-[11px] font-medium">
              {isSearching
                ? "Searching pages…"
                : searchMatches.length === 0
                ? "No matches found"
                : `${currentMatchIndex + 1} of ${searchMatches.length} matches`}
            </span>

            {searchMatches.length > 0 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-6 rounded-md border-border/60"
                  onClick={onPrevMatch}
                  title="Previous match (Shift+Enter)"
                >
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-6 rounded-md border-border/60"
                  onClick={onNextMatch}
                  title="Next match (Enter)"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results List */}
      <ScrollArea className="flex-1 p-2">
        {searchMatches.length > 0 ? (
          <div className="space-y-1.5 pb-4">
            {searchMatches.map((match, idx) => {
              const isSelected = idx === currentMatchIndex;
              const isCurrentPage = match.pageNumber === currentPage;

              return (
                <div
                  key={`${match.pageNumber}-${idx}`}
                  onClick={() => onSelectMatch(idx)}
                  className={cn(
                    "p-2.5 rounded-lg text-xs cursor-pointer border transition-all",
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                      : "border-border/40 hover:border-border hover:bg-muted/40 text-muted-foreground"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        "text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded",
                        isSelected || isCurrentPage
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      Page {match.pageNumber}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      #{idx + 1}
                    </span>
                  </div>

                  <p className="text-[11px] leading-relaxed text-foreground/90 font-mono line-clamp-2">
                    {match.snippet}
                  </p>
                </div>
              );
            })}
          </div>
        ) : searchQuery.trim().length > 0 && !isSearching ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            <p>No results matching &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-muted-foreground">
            <Search className="size-8 mx-auto mb-2 text-muted-foreground/30" />
            <p>Type keywords to search across all pages</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
