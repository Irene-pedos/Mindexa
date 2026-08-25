// frontend/components/mindexa/study-reader/reader-top-bar.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Search,
  BookOpen,
  Download,
  Maximize2,
  Minimize2,
  Eye,
  Columns2,
  Check,
  Bookmark,
  Sparkles,
  Flame,
  Target,
  Keyboard,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReaderSource, ZoomMode, ReaderSidebarTab } from "./types";
import { cn } from "@/lib/utils";

interface ReaderTopBarProps {
  source: ReaderSource;
  currentPage: number;
  numPages: number;
  zoom: number;
  zoomMode: ZoomMode;
  rotation: number;
  twoPageView: boolean;
  isFocusMode: boolean;
  isFullscreen: boolean;
  activeSidebarTab: ReaderSidebarTab | null;
  hasMatches: boolean;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number, mode?: ZoomMode) => void;
  onRotate: () => void;
  onToggleTwoPageView: () => void;
  onToggleFocusMode: () => void;
  onToggleFullscreen: () => void;
  onToggleSidebarTab: (tab: ReaderSidebarTab) => void;
  onDownload: () => void;
  onBack: () => void;
  onOpenShortcuts?: () => void;
}

const ZOOM_PRESETS = [
  { label: "Fit Width", mode: "fit-width" as ZoomMode, value: 100 },
  { label: "Fit Page", mode: "fit-page" as ZoomMode, value: 100 },
  { label: "50%", mode: "custom" as ZoomMode, value: 50 },
  { label: "75%", mode: "custom" as ZoomMode, value: 75 },
  { label: "100%", mode: "custom" as ZoomMode, value: 100 },
  { label: "125%", mode: "custom" as ZoomMode, value: 125 },
  { label: "150%", mode: "custom" as ZoomMode, value: 150 },
  { label: "200%", mode: "custom" as ZoomMode, value: 200 },
];

export function ReaderTopBar({
  source,
  currentPage,
  numPages,
  zoom,
  zoomMode,
  rotation,
  twoPageView,
  isFocusMode,
  isFullscreen,
  activeSidebarTab,
  hasMatches,
  onPageChange,
  onZoomChange,
  onRotate,
  onToggleTwoPageView,
  onToggleFocusMode,
  onToggleFullscreen,
  onToggleSidebarTab,
  onDownload,
  onBack,
  onOpenShortcuts,
}: ReaderTopBarProps) {
  const [pageInput, setPageInput] = useState(currentPage.toString());
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= numPages) {
      onPageChange(parsed);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const isPdf =
    source.extension?.toLowerCase().includes("pdf") ||
    source.mimeType === "application/pdf";

  return (
    <header className="h-13 bg-card/95 backdrop-blur-md border-b border-border/60 px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 z-30 transition-all">
      {/* Left: Back + Document Info */}
      <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[32%] sm:max-w-[36%]">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Return to course or dashboard"
          className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0 rounded-lg gap-1.5"
          title="Back (Esc)"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline font-semibold">
            {source.courseCode || "Back"}
          </span>
        </Button>

        <div className="w-px h-4 bg-border/60 shrink-0 hidden sm:block" />

        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 text-primary shrink-0" />
          <span
            className="text-xs font-semibold text-foreground truncate"
            title={source.title}
          >
            {source.title}
          </span>
          <Badge
            variant="outline"
            className="text-[9px] uppercase font-mono px-1 py-0 h-4 shrink-0 hidden lg:inline-flex border-border/60"
          >
            {source.extension?.replace(".", "") || "FILE"}
          </Badge>
        </div>
      </div>

      {/* Center: Page Navigation & Zoom (PDFs) */}
      {isPdf && numPages > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Stepper */}
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 border border-border/40 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-md"
              onClick={() =>
                onPageChange(Math.max(1, currentPage - (twoPageView ? 2 : 1)))
              }
              disabled={currentPage <= 1}
              aria-label={twoPageView ? "Previous spread" : "Previous page"}
              title={twoPageView ? "Previous spread (←)" : "Previous page (←)"}
            >
              <ChevronLeft className="size-3.5" />
            </Button>

            <form
              onSubmit={handlePageInputSubmit}
              className="flex items-center gap-1 px-1 text-xs font-medium"
            >
              <input
                aria-label="Current page number"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => setPageInput(currentPage.toString())}
                className="w-8 h-6 text-center text-xs font-semibold bg-card rounded border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
              />
              <span className="text-muted-foreground text-[11px] font-mono select-none">
                {twoPageView && currentPage < numPages
                  ? `-${currentPage + 1} / ${numPages}`
                  : `/ ${numPages}`}
              </span>
            </form>

            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-md"
              onClick={() =>
                onPageChange(Math.min(numPages, currentPage + (twoPageView ? 2 : 1)))
              }
              disabled={
                twoPageView ? currentPage + 1 >= numPages : currentPage >= numPages
              }
              aria-label={twoPageView ? "Next spread" : "Next page"}
              title={twoPageView ? "Next spread (→)" : "Next page (→)"}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>

          {/* Zoom Popover */}
          <div className="hidden sm:flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/40">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-md"
              onClick={() => onZoomChange(Math.max(25, zoom - 15), "custom")}
              aria-label="Zoom out"
              title="Zoom out (-)"
            >
              <ZoomOut className="size-3.5" />
            </Button>

            <Popover open={isZoomOpen} onOpenChange={setIsZoomOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Zoom preset menu"
                  className="h-7 px-2 text-[11px] font-semibold tabular-nums text-foreground hover:text-primary min-w-13"
                >
                  {zoomMode === "fit-width"
                    ? "Width"
                    : zoomMode === "fit-page"
                      ? "Page"
                      : `${zoom}%`}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-36 p-1 bg-card/95 backdrop-blur-md"
                align="center"
              >
                <div className="space-y-0.5">
                  {ZOOM_PRESETS.map((preset) => {
                    const isActive =
                      zoomMode === preset.mode &&
                      (preset.mode !== "custom" || zoom === preset.value);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          onZoomChange(preset.value, preset.mode);
                          setIsZoomOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-colors text-left",
                          isActive
                            ? "bg-primary/10 text-primary font-semibold"
                            : "hover:bg-muted text-foreground/80",
                        )}
                      >
                        <span>{preset.label}</span>
                        {isActive && <Check className="size-3 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-md"
              onClick={() => onZoomChange(Math.min(300, zoom + 15), "custom")}
              aria-label="Zoom in"
              title="Zoom in (+)"
            >
              <ZoomIn className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Right: Core Study Actions + Unified "Tools" Menu */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {isPdf && (
          <>
            {/* 1. Ask AI Tutor (Primary Highlight Button) */}
            <Button
              variant={activeSidebarTab === "ask" ? "default" : "secondary"}
              size="sm"
              className={cn(
                "h-8 px-2.5 text-xs font-semibold rounded-lg gap-1.5 shadow-xs transition-colors",
                activeSidebarTab === "ask"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "text-primary bg-primary/10 hover:bg-primary/20",
              )}
              onClick={() => onToggleSidebarTab("ask")}
              aria-label="Open Ask AI study tutor"
              title="Ask AI Study Tutor"
            >
              <Sparkles className="size-3.5" />
              <span className="hidden sm:inline">Ask AI</span>
            </Button>

            {/* 2. Weakness Focus Engine */}
            <Button
              variant={activeSidebarTab === "focus" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-8 px-2 text-xs font-semibold rounded-lg gap-1",
                activeSidebarTab === "focus"
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold"
                  : "text-rose-500 hover:text-rose-600 hover:bg-rose-500/10",
              )}
              onClick={() => onToggleSidebarTab("focus")}
              aria-label="Open weakness engine and focus queue"
              title="Weakness Engine & Focus Next"
            >
              <Flame className="size-3.5" />
              <span className="hidden xl:inline">Focus</span>
            </Button>

            {/* 3. Page Comprehension Quiz */}
            <Button
              variant={activeSidebarTab === "check" ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "size-8 rounded-lg",
                activeSidebarTab === "check" && "bg-primary/10 text-primary",
              )}
              onClick={() => onToggleSidebarTab("check")}
              aria-label="Open page comprehension quiz"
              title="Page Comprehension Quiz"
            >
              <Target className="size-4" />
            </Button>

            {/* 4. In-Document Search */}
            <Button
              variant={activeSidebarTab === "search" ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "size-8 rounded-lg relative",
                activeSidebarTab === "search" && "bg-primary/10 text-primary",
              )}
              onClick={() => onToggleSidebarTab("search")}
              aria-label="Search within document"
              title="Search in document (/ or Ctrl+F)"
            >
              <Search className="size-4" />
              {hasMatches && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary animate-pulse" />
              )}
            </Button>

            <div className="w-px h-4 bg-border/60 mx-0.5" />
          </>
        )}

        {/* 5. Unified Tools Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label="Open reader tools and options menu"
              className="h-8 px-2.5 text-xs font-semibold rounded-lg gap-1.5 border-border/60 hover:bg-muted"
              title="More reader tools & view options"
            >
              <SlidersHorizontal className="size-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Tools</span>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-xl">
            {isPdf && (
              <>
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                  Study Navigation
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => onToggleSidebarTab("outline")}
                    className="cursor-pointer"
                  >
                    <BookOpen className="size-4 text-muted-foreground mr-1.5" />
                    <span>Table of Contents</span>
                    {activeSidebarTab === "outline" && (
                      <Check className="size-3.5 text-primary ml-auto" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => onToggleSidebarTab("keypoints")}
                    className="cursor-pointer"
                  >
                    <Bookmark className="size-4 text-muted-foreground mr-1.5" />
                    <span>Key Points & Notes</span>
                    {activeSidebarTab === "keypoints" && (
                      <Check className="size-3.5 text-primary ml-auto" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                  View & Layout
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={onToggleTwoPageView}
                    className="cursor-pointer"
                  >
                    <Columns2 className="size-4 text-muted-foreground mr-1.5" />
                    <span>Two-Page Spread</span>
                    {twoPageView && (
                      <Check className="size-3.5 text-primary ml-auto" />
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={onRotate} className="cursor-pointer">
                    <RotateCw className="size-4 text-muted-foreground mr-1.5" />
                    <span>Rotate Clockwise 90°</span>
                    <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                      {rotation}°
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
              Display & Shortcuts
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={onToggleFocusMode}
                className="cursor-pointer"
              >
                <Eye className="size-4 text-muted-foreground mr-1.5" />
                <span>Focus Mode</span>
                <span className="text-[10px] font-mono text-muted-foreground ml-auto bg-muted px-1 rounded">
                  F
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={onToggleFullscreen}
                className="cursor-pointer hidden sm:flex"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="size-4 text-muted-foreground mr-1.5" />
                    <span>Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="size-4 text-muted-foreground mr-1.5" />
                    <span>Fullscreen View</span>
                  </>
                )}
              </DropdownMenuItem>

              {onOpenShortcuts && (
                <DropdownMenuItem
                  onClick={onOpenShortcuts}
                  className="cursor-pointer"
                >
                  <Keyboard className="size-4 text-muted-foreground mr-1.5" />
                  <span>Keyboard Shortcuts</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto bg-muted px-1 rounded">
                    ?
                  </span>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={onDownload} className="cursor-pointer">
              <Download className="size-4 text-muted-foreground mr-1.5" />
              <span>Download File</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
