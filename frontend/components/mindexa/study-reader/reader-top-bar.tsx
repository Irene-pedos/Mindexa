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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
      {/* Left: Back + Title + Info */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 max-w-[35%]">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0 rounded-lg gap-1.5"
          title="Back (Esc)"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden md:inline">
            {source.courseCode || "Back"}
          </span>
        </Button>

        <div className="w-px h-4 bg-border/60 shrink-0 hidden sm:block" />

        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 text-primary shrink-0" />
          <div className="flex flex-col min-w-0">
            <span
              className="text-xs font-semibold text-foreground truncate"
              title={source.title}
            >
              {source.title}
            </span>
          </div>
          <Badge
            variant="outline"
            className="text-[9px] uppercase font-mono px-1 py-0 h-4 shrink-0 hidden lg:inline-flex border-border/60"
          >
            {source.extension?.replace(".", "") || "FILE"}
          </Badge>
        </div>
      </div>

      {/* Center: Page Navigation (for PDFs) */}
      {isPdf && numPages > 0 && (
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5 border border-border/40 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            title="Previous page (←)"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <form
            onSubmit={handlePageInputSubmit}
            className="flex items-center gap-1 px-1 text-xs font-medium"
          >
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => setPageInput(currentPage.toString())}
              className="w-8 h-6 text-center text-xs font-semibold bg-card rounded border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
            />
            <span className="text-muted-foreground text-[11px] font-mono select-none">
              / {numPages}
            </span>
          </form>

          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md"
            onClick={() => onPageChange(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
            title="Next page (→)"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Right: Zoom, Layout, Search, Outline, Focus, Download */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {isPdf && (
          <>
            {/* Zoom Controls Popover */}
            <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/40">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-md"
                onClick={() => onZoomChange(Math.max(25, zoom - 15), "custom")}
                title="Zoom out (-)"
              >
                <ZoomOut className="size-3.5" />
              </Button>

              <Popover open={isZoomOpen} onOpenChange={setIsZoomOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] font-semibold tabular-nums text-foreground hover:text-primary min-w-14"
                  >
                    {zoomMode === "fit-width"
                      ? "Width"
                      : zoomMode === "fit-page"
                      ? "Page"
                      : `${zoom}%`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-36 p-1 bg-card/95 backdrop-blur-md" align="center">
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
                              : "hover:bg-muted text-foreground/80"
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
                title="Zoom in (+)"
              >
                <ZoomIn className="size-3.5" />
              </Button>
            </div>

            {/* Two Page View Toggle */}
            <Button
              variant={twoPageView ? "secondary" : "ghost"}
              size="icon"
              className="size-8 rounded-lg hidden md:flex"
              onClick={onToggleTwoPageView}
              title="Toggle two-page spread"
            >
              <Columns2 className={cn("size-4", twoPageView && "text-primary")} />
            </Button>

            {/* Rotation */}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg hidden sm:flex"
              onClick={onRotate}
              title="Rotate clockwise (R)"
            >
              <RotateCw className="size-4" />
            </Button>

            <div className="w-px h-4 bg-border/60 mx-0.5 hidden sm:block" />

            {/* Weakness Focus Engine */}
            <Button
              variant={activeSidebarTab === "focus" ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "size-8 rounded-lg",
                activeSidebarTab === "focus"
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  : "text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
              )}
              onClick={() => onToggleSidebarTab("focus")}
              title="Weakness Engine & Focus Next"
            >
              <Flame className="size-4" />
            </Button>

            {/* Page Recall Quiz */}
            <Button
              variant={activeSidebarTab === "check" ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "size-8 rounded-lg",
                activeSidebarTab === "check" && "bg-primary/10 text-primary"
              )}
              onClick={() => onToggleSidebarTab("check")}
              title="Page Comprehension Quiz"
            >
              <Target className="size-4" />
            </Button>

            <div className="w-px h-4 bg-border/60 mx-0.5 hidden sm:block" />

            {/* In-Document Search */}
            <Button
              variant={activeSidebarTab === "search" ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "size-8 rounded-lg relative",
                activeSidebarTab === "search" && "bg-primary/10 text-primary"
              )}
              onClick={() => onToggleSidebarTab("search")}
              title="Search in document (/ or Ctrl+F)"
            >
              <Search className="size-4" />
              {hasMatches && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary animate-pulse" />
              )}
            </Button>

            {/* Table of Contents / Outline */}
            <Button
              variant={activeSidebarTab === "outline" ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "size-8 rounded-lg",
                activeSidebarTab === "outline" && "bg-primary/10 text-primary"
              )}
              onClick={() => onToggleSidebarTab("outline")}
              title="Table of Contents"
            >
              <BookOpen className="size-4" />
            </Button>

            {/* Key Points */}
            <Button
              variant={activeSidebarTab === "keypoints" ? "secondary" : "ghost"}
              size="icon"
              className={cn(
                "size-8 rounded-lg",
                activeSidebarTab === "keypoints" && "bg-primary/10 text-primary"
              )}
              onClick={() => onToggleSidebarTab("keypoints")}
              title="Key Points & Takeaways"
            >
              <Bookmark className="size-4" />
            </Button>

            {/* Ask AI Tutor */}
            <Button
              variant={activeSidebarTab === "ask" ? "default" : "secondary"}
              size="sm"
              className={cn(
                "h-8 px-2.5 text-xs font-semibold rounded-lg gap-1.5 shadow-xs",
                activeSidebarTab === "ask"
                  ? "bg-primary text-primary-foreground"
                  : "text-primary bg-primary/10 hover:bg-primary/20"
              )}
              onClick={() => onToggleSidebarTab("ask")}
              title="Ask AI Study Tutor"
            >
              <Sparkles className="size-3.5" />
              <span className="hidden md:inline">Ask AI</span>
            </Button>
          </>
        )}

        {/* Focus Mode */}
        <Button
          variant={isFocusMode ? "secondary" : "ghost"}
          size="icon"
          className="size-8 rounded-lg"
          onClick={onToggleFocusMode}
          title="Focus mode (F)"
        >
          <Eye className={cn("size-4", isFocusMode && "text-primary")} />
        </Button>

        {/* Fullscreen */}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg hidden lg:flex"
          onClick={onToggleFullscreen}
          title="Toggle browser fullscreen"
        >
          {isFullscreen ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
        </Button>

        {/* Download */}
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          className="h-8 px-2.5 text-xs font-semibold rounded-lg border-border/60 gap-1.5 shadow-none"
          title="Download file"
        >
          <Download className="size-3.5" />
          <span className="hidden xl:inline">Download</span>
        </Button>
      </div>
    </header>
  );
}
