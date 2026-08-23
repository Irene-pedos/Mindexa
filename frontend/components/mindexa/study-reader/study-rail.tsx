// frontend/components/mindexa/study-reader/study-rail.tsx
"use client";

import React from "react";
import {
  KeyPointConfidence,
  KeyPointTag,
  PdfOutlineItem,
  ReaderSidebarTab,
  ReaderSource,
  SearchMatch,
  StudentKeyPoint,
} from "./types";
import { PageOutline } from "./page-outline";
import { ReaderSearch } from "./reader-search";
import { KeyPointsPanel } from "./key-points-panel";
import { ReaderAskAiPanel } from "./reader-ask-ai-panel";
import { FocusPanel } from "./focus-panel";
import { PageCheckPanel } from "./page-check-panel";
import {
  Bookmark,
  Search,
  Sparkles,
  BookOpen,
  Flame,
  Target,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StudyRailProps {
  source: ReaderSource;
  activeTab: ReaderSidebarTab;
  onTabChange: (tab: ReaderSidebarTab) => void;
  onClose: () => void;
  // Outline props
  outline: PdfOutlineItem[];
  numPages: number;
  currentPage: number;
  onSelectPage: (page: number) => void;
  // Search props
  searchQuery: string;
  searchMatches: SearchMatch[];
  currentMatchIndex: number;
  isSearching: boolean;
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onSelectMatch: (index: number) => void;
  // Key points props
  keyPoints: StudentKeyPoint[];
  onAddKeyPoint: (payload: {
    title: string;
    quote?: string;
    page_number: number;
    tag?: KeyPointTag;
    confidence?: KeyPointConfidence;
  }) => void;
  onUpdateKeyPoint: (id: string, updates: { tag?: KeyPointTag; confidence?: KeyPointConfidence }) => void;
  onDeleteKeyPoint: (id: string) => void;
  onExportRevisionSheet: () => Promise<any>;
  // Ask AI props
  selectedAiText: string | null;
  onClearSelectedAiText: () => void;
  // Page check props
  onPageCheckCompleted: () => void;
}

export function StudyRail({
  source,
  activeTab,
  onTabChange,
  onClose,
  outline,
  numPages,
  currentPage,
  onSelectPage,
  searchQuery,
  searchMatches,
  currentMatchIndex,
  isSearching,
  onSearch,
  onClearSearch,
  onNextMatch,
  onPrevMatch,
  onSelectMatch,
  keyPoints,
  onAddKeyPoint,
  onUpdateKeyPoint,
  onDeleteKeyPoint,
  onExportRevisionSheet,
  selectedAiText,
  onClearSelectedAiText,
  onPageCheckCompleted,
}: StudyRailProps) {
  return (
    <aside className="w-80 sm:w-96 border-l border-border/60 bg-card/95 backdrop-blur-md flex flex-col h-full z-20 shadow-xl animate-in slide-in-from-right duration-200">
      {/* Tab Switcher Header */}
      <div className="h-12 border-b border-border/40 px-2 flex items-center justify-between shrink-0 gap-1">
        <div className="flex items-center gap-0.5 bg-muted/50 p-0.5 rounded-lg overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => onTabChange("focus")}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 shrink-0",
              activeTab === "focus"
                ? "bg-rose-500 text-white font-semibold shadow-xs"
                : "text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            )}
            title="Weakness Engine & Focus Next"
          >
            <Flame className="size-3.5" />
            <span>Focus</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("check")}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 shrink-0",
              activeTab === "check"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Page Comprehension Quiz"
          >
            <Target className="size-3.5" />
            <span className="hidden sm:inline">Quiz</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("keypoints")}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 shrink-0",
              activeTab === "keypoints"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Key Takeaways"
          >
            <Bookmark className="size-3.5" />
            <span className="hidden sm:inline">Key Points</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("ask")}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 shrink-0",
              activeTab === "ask"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-primary hover:bg-primary/10"
            )}
            title="Ask AI Study Tutor"
          >
            <Sparkles className="size-3.5" />
            <span>AI</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("outline")}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 shrink-0",
              activeTab === "outline"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Table of Contents"
          >
            <BookOpen className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onTabChange("search")}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 shrink-0",
              activeTab === "search"
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Search in Document"
          >
            <Search className="size-3.5" />
          </button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground rounded-lg shrink-0"
          onClick={onClose}
          title="Close rail (Esc)"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Rail Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "focus" && (
          <FocusPanel
            source={source}
            currentPage={currentPage}
            onSelectPage={onSelectPage}
            onUpdateKeyPoint={(id, u) => onUpdateKeyPoint(id, u)}
            onOpenPageCheck={() => onTabChange("check")}
          />
        )}

        {activeTab === "check" && (
          <PageCheckPanel
            source={source}
            currentPage={currentPage}
            selectedText={selectedAiText}
            onPageCheckCompleted={onPageCheckCompleted}
            onSelectPage={onSelectPage}
          />
        )}

        {activeTab === "outline" && (
          <PageOutline
            outline={outline}
            numPages={numPages}
            currentPage={currentPage}
            onSelectPage={onSelectPage}
          />
        )}

        {activeTab === "search" && (
          <ReaderSearch
            searchQuery={searchQuery}
            searchMatches={searchMatches}
            currentMatchIndex={currentMatchIndex}
            isSearching={isSearching}
            onSearch={onSearch}
            onClearSearch={onClearSearch}
            onNextMatch={onNextMatch}
            onPrevMatch={onPrevMatch}
            onSelectMatch={onSelectMatch}
            currentPage={currentPage}
          />
        )}

        {activeTab === "keypoints" && (
          <KeyPointsPanel
            keyPoints={keyPoints}
            currentPage={currentPage}
            onSelectPage={onSelectPage}
            onAddKeyPoint={onAddKeyPoint}
            onUpdateKeyPoint={onUpdateKeyPoint}
            onDeleteKeyPoint={onDeleteKeyPoint}
            onExportRevisionSheet={onExportRevisionSheet}
          />
        )}

        {activeTab === "ask" && (
          <ReaderAskAiPanel
            source={source}
            currentPage={currentPage}
            selectedText={selectedAiText}
            onClearSelectedText={onClearSelectedAiText}
            onSelectPage={onSelectPage}
          />
        )}
      </div>
    </aside>
  );
}
