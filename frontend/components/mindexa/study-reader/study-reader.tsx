"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  AnnotationColor,
  FocusResponse,
  KeyPointConfidence,
  KeyPointTag,
  ReaderProgress,
  ReaderSidebarTab,
  ReaderSource,
  ZoomMode,
} from "./types";
import { useReaderProgress } from "./hooks/use-reader-progress";
import { usePdfDocument } from "./hooks/use-pdf-document";
import { useAnnotations } from "./hooks/use-annotations";
import { ReaderTopBar } from "./reader-top-bar";
import { PdfCanvas } from "./pdf-canvas";
import { ImageCanvas } from "./image-canvas";
import { StudyRail } from "./study-rail";
import { PageHeatStrip } from "./page-heat-strip";
import { ReaderShortcutsDialog } from "./reader-shortcuts-dialog";
import { ReaderErrorBoundary } from "./reader-error-boundary";
import { Button } from "@/components/ui/button";
import { studentApi } from "@/lib/api/student";
import { studyReaderApi } from "@/lib/api/study-reader";
import {
  FileText,
  Download,
  AlertCircle,
  X,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StudyReaderProps {
  source: ReaderSource;
  onBack: () => void;
  initialPage?: number | null;
}

export function StudyReader({ source, onBack, initialPage }: StudyReaderProps) {
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);

  const {
    progress,
    updateProgress,
    isLoaded: isProgressLoaded,
  } = useReaderProgress(source.kind, source.id, initialPage);

  const {
    fileUrl,
    loading: isPdfLoading,
    error: pdfError,
    numPages,
    outline,
    searchMatches,
    currentMatchIndex,
    isSearching,
    searchQuery,
    onDocumentLoadSuccess,
    onDocumentLoadError,
    search,
    clearSearch,
    nextMatch,
    prevMatch,
    goToMatch,
    reloadFile,
  } = usePdfDocument(source);

  const {
    annotations,
    keyPoints,
    selectedRange,
    setSelectedRange,
    clearSelection,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    addKeyPoint,
    updateKeyPoint,
    deleteKeyPoint,
    exportRevisionSheet,
  } = useAnnotations(source);

  // Focus mode & chrome visibility
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHoveringTopEdge, setIsHoveringTopEdge] = useState(false);

  // Active right rail tab (null = closed)
  const [activeSidebarTab, setActiveSidebarTab] =
    useState<ReaderSidebarTab | null>(null);

  // Ask AI active highlighted excerpt
  const [selectedAiText, setSelectedAiText] = useState<string | null>(null);

  // Focus spotlight for weakness engine & key points
  const [focusSpotlight, setFocusSpotlight] = useState<{
    page: number;
    title: string;
    reason?: string;
    quote?: string;
  } | null>(null);

  // Bottom navigation page input state
  const [bottomPageInput, setBottomPageInput] = useState<string>(
    progress.page.toString(),
  );

  useEffect(() => {
    setBottomPageInput(progress.page.toString());
  }, [progress.page]);

  // Weakness focus data & heatmap
  const [focusData, setFocusData] = useState<FocusResponse | null>(null);
  const [isFocusLoading, setIsFocusLoading] = useState<boolean>(true);
  const [isFocusRefreshing, setIsFocusRefreshing] = useState<boolean>(false);

  const loadFocusData = useCallback(
    async (isSilent = false) => {
      try {
        if (!isSilent) setIsFocusLoading(true);
        else setIsFocusRefreshing(true);
        const data = await studyReaderApi.getFocus(source.kind, source.id);
        setFocusData(data);
      } catch {
        // Graceful fallback
      } finally {
        setIsFocusLoading(false);
        setIsFocusRefreshing(false);
      }
    },
    [source.kind, source.id],
  );

  useEffect(() => {
    loadFocusData();
  }, [loadFocusData]);

  const handleMarkKeyPointReviewed = useCallback(
    async (kpId: string) => {
      const updated = await updateKeyPoint(kpId, { confidence: "got_it" });
      if (updated) {
        toast.success("Marked as understood! Next review scheduled.");
        setFocusData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            spaced_reviews: prev.spaced_reviews.filter((k) => k.id !== kpId),
          };
        });
      }
    },
    [updateKeyPoint],
  );

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const serverProgressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper for debounced server progress sync
  const scheduleServerProgressSave = useCallback(
    (overrides: Partial<ReaderProgress> = {}) => {
      const merged = { ...progress, ...overrides };
      const validPage = Math.max(1, Math.min(merged.page, numPages || merged.numPages || 1));

      if (serverProgressTimerRef.current) {
        clearTimeout(serverProgressTimerRef.current);
      }
      serverProgressTimerRef.current = setTimeout(() => {
        studyReaderApi
          .saveProgress(source.kind, source.id, {
            last_page: validPage,
            last_scale: merged.zoom,
            rotation: merged.rotation,
            zoom_mode: merged.zoomMode,
            two_page_view: merged.twoPageView,
            furthest_page_reached: validPage,
            page_count_seen: validPage,
          })
          .catch(() => {});
      }, 1200);
    },
    [numPages, progress, source.id, source.kind],
  );

  // Determine file formats
  const isPdf =
    source.extension?.toLowerCase().includes("pdf") ||
    source.mimeType === "application/pdf";

  const extension =
    typeof source.extension === "string"
      ? source.extension.toLowerCase().replace(".", "")
      : "";
  const isImage =
    source.mimeType?.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(extension);

  // Synchronize numPages with progress once PDF loads, clamping restored page if necessary
  const handlePdfLoaded = useCallback(
    async (pdf: any) => {
      await onDocumentLoadSuccess(pdf);
      const totalPages = pdf?.numPages || 1;
      const clampedPage = Math.max(1, Math.min(progress.page, totalPages));
      updateProgress({
        numPages: totalPages,
        page: clampedPage,
      });
      if (clampedPage !== progress.page) {
        scheduleServerProgressSave({ page: clampedPage });
      }
    },
    [onDocumentLoadSuccess, progress.page, scheduleServerProgressSave, updateProgress],
  );

  // Clamp restored page whenever numPages resolves
  useEffect(() => {
    if (numPages > 0 && progress.page > numPages) {
      updateProgress({ page: numPages });
      scheduleServerProgressSave({ page: numPages });
    }
  }, [numPages, progress.page, scheduleServerProgressSave, updateProgress]);

  // Page navigation with debounced server progress sync and URL parameter sync
  const handlePageChange = useCallback(
    (
      page: number,
      focusInfo?: { title: string; reason?: string; quote?: string },
    ) => {
      const validPage = Math.max(
        1,
        Math.min(page, numPages || progress.numPages || 1),
      );
      updateProgress({ page: validPage });
      scheduleServerProgressSave({ page: validPage });

      if (focusInfo) {
        setFocusSpotlight({
          page: validPage,
          title: focusInfo.title,
          reason: focusInfo.reason,
          quote: focusInfo.quote,
        });
      }

      // Synchronize URL search params (?page=N) without full navigation
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.get("page") !== validPage.toString()) {
          url.searchParams.set("page", validPage.toString());
          window.history.replaceState(null, "", url.toString());
        }
      }
    },
    [numPages, progress.numPages, scheduleServerProgressSave, updateProgress],
  );

  // Zoom handlers
  const handleZoomChange = useCallback(
    (zoom: number, mode?: ZoomMode) => {
      const nextMode = mode || "custom";
      updateProgress({
        zoom,
        zoomMode: nextMode,
      });
      scheduleServerProgressSave({ zoom, zoomMode: nextMode });
    },
    [scheduleServerProgressSave, updateProgress],
  );

  // Rotate handler
  const handleRotate = useCallback(() => {
    const nextRotation = ((progress.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    updateProgress({ rotation: nextRotation });
    scheduleServerProgressSave({ rotation: nextRotation });
  }, [progress.rotation, scheduleServerProgressSave, updateProgress]);

  // Two-page view toggle
  const handleToggleTwoPageView = useCallback(() => {
    const nextTwoPage = !progress.twoPageView;
    updateProgress({ twoPageView: nextTwoPage });
    scheduleServerProgressSave({ twoPageView: nextTwoPage });
  }, [progress.twoPageView, scheduleServerProgressSave, updateProgress]);

  // Toggle fullscreen
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }, []);

  // Listen for native fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Toggle focus mode
  const handleToggleFocusMode = useCallback(() => {
    setIsFocusMode((prev) => {
      const next = !prev;
      if (!next) {
        setIsChromeVisible(true);
      }
      return next;
    });
  }, []);

  // Idle focus mode chrome auto-hide
  useEffect(() => {
    if (!isFocusMode) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    const resetTimer = () => {
      setIsChromeVisible(true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setIsChromeVisible(false);
      }, 3500);
    };

    idleTimerRef.current = setTimeout(() => {
      setIsChromeVisible(false);
    }, 3500);

    const handleActivity = () => {
      resetTimer();
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isFocusMode]);

  // Search match navigation helpers
  const handleSelectSearchMatch = useCallback(
    (index: number) => {
      const targetPage = goToMatch(index);
      if (targetPage) {
        handlePageChange(targetPage);
      }
    },
    [goToMatch, handlePageChange],
  );

  const handleNextMatch = useCallback(() => {
    const targetPage = nextMatch();
    if (targetPage) {
      handlePageChange(targetPage);
    }
  }, [nextMatch, handlePageChange]);

  const handlePrevMatch = useCallback(() => {
    const targetPage = prevMatch();
    if (targetPage) {
      handlePageChange(targetPage);
    }
  }, [prevMatch, handlePageChange]);

  // Highlight action from SelectionToolbar
  const handleHighlight = useCallback(
    (color: AnnotationColor, noteText?: string) => {
      if (!selectedRange) return;
      addAnnotation({
        page_number: selectedRange.pageNumber,
        color,
        selected_text: selectedRange.text,
        rects: selectedRange.rects,
        note_text: noteText,
      });
      clearSelection();
    },
    [selectedRange, addAnnotation, clearSelection],
  );

  // Add Key Point action from SelectionToolbar
  const handleAddKeyPointFromSelection = useCallback(
    (title: string, quote: string, pageNum: number) => {
      addKeyPoint({
        title,
        quote,
        page_number: pageNum,
        tag: "other",
        confidence: "got_it",
      });
      clearSelection();
    },
    [addKeyPoint, clearSelection],
  );

  // Ask AI action from SelectionToolbar
  const handleAskAiFromSelection = useCallback(
    (text: string, _pageNum: number) => {
      setSelectedAiText(text);
      setActiveSidebarTab("ask");
      clearSelection();
    },
    [clearSelection],
  );

  // Download handler
  const handleDownload = useCallback(async () => {
    const filename = source.downloadFilename || source.title || "document";
    try {
      if (source.kind === "student_resource") {
        await studentApi.downloadPersonalResource(source.id, filename);
      } else {
        await studentApi.downloadMaterial(source.id, filename);
      }
      toast.success("Download started");
    } catch {
      toast.error("Failed to download file");
    }
  }, [source]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isSearchShortcut =
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f";
      if ((e.ctrlKey || e.metaKey) && !isSearchShortcut) return;

      const step = progress.twoPageView ? 2 : 1;
      if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "h") {
        e.preventDefault();
        handlePageChange(progress.page - step);
      } else if (
        e.key === "ArrowRight" ||
        e.key === "PageDown" ||
        e.key === "l"
      ) {
        e.preventDefault();
        handlePageChange(progress.page + step);
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomChange(Math.min(300, progress.zoom + 15), "custom");
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomChange(Math.max(25, progress.zoom - 15), "custom");
      } else if (e.key === "0") {
        e.preventDefault();
        handleZoomChange(100, "fit-width");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleRotate();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleToggleFocusMode();
      } else if (
        e.key === "/" ||
        (e.ctrlKey && e.key === "f") ||
        (e.metaKey && e.key === "f")
      ) {
        e.preventDefault();
        setActiveSidebarTab("search");
      } else if (e.key === "w" || e.key === "W" || e.key === "1") {
        e.preventDefault();
        setActiveSidebarTab("focus");
      } else if (e.key === "q" || e.key === "Q" || e.key === "2") {
        e.preventDefault();
        setActiveSidebarTab("check");
      } else if (e.key === "k" || e.key === "K" || e.key === "3") {
        e.preventDefault();
        setActiveSidebarTab("keypoints");
      } else if (e.key === "a" || e.key === "A" || e.key === "4") {
        e.preventDefault();
        setActiveSidebarTab("ask");
      } else if (e.key === "5") {
        e.preventDefault();
        setActiveSidebarTab("outline");
      } else if (e.key === "6") {
        e.preventDefault();
        setActiveSidebarTab("search");
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcutsDialog((prev) => !prev);
      } else if (e.key === "Escape") {
        if (showShortcutsDialog) {
          setShowShortcutsDialog(false);
        } else if (selectedRange) {
          clearSelection();
        } else if (isFocusMode) {
          setIsFocusMode(false);
        } else if (activeSidebarTab !== null) {
          setActiveSidebarTab(null);
        } else {
          onBack();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    progress.page,
    progress.zoom,
    progress.twoPageView,
    isFocusMode,
    activeSidebarTab,
    selectedRange,
    showShortcutsDialog,
    handlePageChange,
    handleZoomChange,
    handleRotate,
    handleToggleFocusMode,
    clearSelection,
    onBack,
  ]);

  // Loading state
  if (!isProgressLoaded || isPdfLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-6 gap-4 animate-in fade-in duration-200">
        <Loader2 className="size-8 animate-spin text-primary" />
        <div className="space-y-1 text-center">
          <p className="text-sm font-semibold text-foreground">
            Preparing Revision Workspace…
          </p>
          <p className="text-xs text-muted-foreground">{source.title}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mt-2 text-xs"
        >
          Cancel
        </Button>
      </div>
    );
  }

  // Unsupported file type state
  if (pdfError === "unsupported_type" || (!isPdf && !isImage)) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="h-14 border-b px-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-2 text-xs"
          >
            <X className="size-4" /> Exit
          </Button>
          <span className="text-xs font-semibold text-foreground truncate max-w-sm">
            {source.title}
          </span>
          <Button
            size="sm"
            onClick={handleDownload}
            className="text-xs gap-1.5"
          >
            <Download className="size-3.5" /> Download
          </Button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6 bg-muted/20">
          <div className="max-w-md w-full bg-card p-8 rounded-2xl border border-border/60 shadow-lg text-center space-y-4">
            <FileText className="size-14 mx-auto text-muted-foreground/30" />
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">
                Preview Not Available
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Files with extension{" "}
                <code className="font-mono text-primary font-bold">
                  .{source.extension?.replace(".", "")}
                </code>{" "}
                cannot be rendered in the study reader. You can download the
                file directly to your device.
              </p>
            </div>
            <Button
              onClick={handleDownload}
              className="w-full text-xs font-semibold gap-2"
            >
              <Download className="size-4" /> Download File
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const showTopBar = !isFocusMode || isChromeVisible || isHoveringTopEdge;

  return (
    <ReaderErrorBoundary onBack={onBack} title={source.title}>
      <div className="fixed inset-0 z-50 bg-background flex flex-col select-none overflow-hidden">
        {/* Hover trigger zone at top edge in Focus Mode */}
        {isFocusMode && (
          <div
            className="fixed top-0 left-0 right-0 h-3 z-40 bg-transparent"
            onMouseEnter={() => setIsHoveringTopEdge(true)}
          />
        )}

        {/* Top Navigation Bar */}
        <div
          className={cn(
            "transition-all duration-300 transform z-40",
            isFocusMode
              ? showTopBar
                ? "fixed top-0 left-0 right-0 translate-y-0 opacity-100 shadow-2xl backdrop-blur-md bg-card/95 border-b border-border/70"
                : "fixed top-0 left-0 right-0 -translate-y-full opacity-0 pointer-events-none"
              : "relative translate-y-0 opacity-100",
          )}
          onMouseEnter={() => isFocusMode && setIsHoveringTopEdge(true)}
          onMouseLeave={() => isFocusMode && setIsHoveringTopEdge(false)}
        >
          <ReaderTopBar
            source={source}
            currentPage={progress.page}
            numPages={numPages || progress.numPages}
            zoom={progress.zoom}
            zoomMode={progress.zoomMode}
            rotation={progress.rotation}
            twoPageView={progress.twoPageView}
            isFocusMode={isFocusMode}
            isFullscreen={isFullscreen}
            activeSidebarTab={activeSidebarTab}
            hasMatches={searchMatches.length > 0}
            onPageChange={handlePageChange}
            onZoomChange={handleZoomChange}
            onRotate={handleRotate}
            onToggleTwoPageView={handleToggleTwoPageView}
            onToggleFocusMode={handleToggleFocusMode}
            onToggleFullscreen={handleToggleFullscreen}
            onToggleSidebarTab={(tab) =>
              setActiveSidebarTab((prev) => (prev === tab ? null : tab))
            }
            onDownload={handleDownload}
            onBack={onBack}
            onOpenShortcuts={() => setShowShortcutsDialog(true)}
          />
        </div>

        {/* Floating Exit Focus Button when Chrome is Hidden and not hovering */}
        {isFocusMode && !showTopBar && (
          <div className="fixed top-3 right-4 z-50 animate-in fade-in duration-200">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsFocusMode(false);
                setIsChromeVisible(true);
              }}
              className="h-8 px-3 text-xs font-medium rounded-full shadow-lg border border-border/60 gap-1.5 backdrop-blur-md bg-card/85 hover:bg-card text-foreground"
            >
              <Eye className="size-3.5 text-primary" />
              <span>Exit Focus (F)</span>
            </Button>
          </div>
        )}

        {/* Workspace Body */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Main Canvas Area */}
          <main className="flex-1 h-full overflow-hidden relative flex flex-col">
            {fileUrl ? (
              isPdf ? (
                <PdfCanvas
                  fileUrl={fileUrl}
                  currentPage={progress.page}
                  numPages={numPages || progress.numPages}
                  zoom={progress.zoom}
                  zoomMode={progress.zoomMode}
                  rotation={progress.rotation}
                  twoPageView={progress.twoPageView}
                  annotations={annotations}
                  selectedRange={selectedRange}
                  searchQuery={searchQuery}
                  focusSpotlight={focusSpotlight}
                  onDismissFocusSpotlight={() => setFocusSpotlight(null)}
                  onTextSelection={setSelectedRange}
                  onHighlight={handleHighlight}
                  onAddKeyPoint={handleAddKeyPointFromSelection}
                  onAskAi={handleAskAiFromSelection}
                  onUpdateAnnotation={updateAnnotation}
                  onDeleteAnnotation={deleteAnnotation}
                  onLoadSuccess={handlePdfLoaded}
                  onLoadError={onDocumentLoadError}
                  onPageChange={handlePageChange}
                  onRetry={reloadFile}
                />
              ) : isImage ? (
                <ImageCanvas url={fileUrl} title={source.title} />
              ) : null
            ) : (
              <div className="flex items-center justify-center h-full p-8 text-center">
                <AlertCircle className="size-8 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">
                  Unable to stream file source.
                </p>
              </div>
            )}

            {/* Floating Bottom Page Navigation Bar for PDFs */}
            {isPdf && (numPages || progress.numPages) > 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-card/90 dark:bg-card/95 backdrop-blur-md border border-border/70 shadow-lg rounded-full px-2 py-1 select-none animate-in fade-in slide-in-from-bottom-2 duration-200">
                {/* Step Back (1 or 2) */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full text-foreground/80 hover:text-foreground"
                  onClick={() =>
                    handlePageChange(
                      progress.page - (progress.twoPageView ? 2 : 1),
                    )
                  }
                  disabled={progress.page <= 1}
                  aria-label="Previous page"
                  title="Previous page (←)"
                >
                  <ChevronLeft className="size-4" />
                </Button>

                {/* Quick Skip -5 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-[11px] font-mono rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => handlePageChange(progress.page - 5)}
                  disabled={progress.page <= 1}
                  aria-label="Skip back 5 pages"
                  title="Skip back 5 pages"
                >
                  -5
                </Button>

                {/* Jump Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const p = parseInt(bottomPageInput, 10);
                    if (!isNaN(p)) handlePageChange(p);
                  }}
                  className="flex items-center gap-1 px-1 text-xs font-medium"
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Jump to page"
                    value={bottomPageInput}
                    onChange={(e) => setBottomPageInput(e.target.value)}
                    onBlur={() => setBottomPageInput(progress.page.toString())}
                    className="w-9 h-6 text-center text-xs font-semibold bg-background rounded-md border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                  />
                  <span className="text-muted-foreground text-[11px] font-mono select-none">
                    / {numPages || progress.numPages}
                  </span>
                </form>

                {/* Quick Skip +5 */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-[11px] font-mono rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => handlePageChange(progress.page + 5)}
                  disabled={progress.page >= (numPages || progress.numPages)}
                  aria-label="Skip forward 5 pages"
                  title="Skip forward 5 pages"
                >
                  +5
                </Button>

                {/* Step Next (1 or 2) */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full text-foreground/80 hover:text-foreground"
                  onClick={() =>
                    handlePageChange(
                      progress.page + (progress.twoPageView ? 2 : 1),
                    )
                  }
                  disabled={progress.page >= (numPages || progress.numPages)}
                  aria-label="Next page"
                  title="Next page (→)"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}

            {/* Minimap Page Heat Strip for PDFs */}
            {isPdf && (
              <PageHeatStrip
                numPages={numPages || progress.numPages}
                currentPage={progress.page}
                heatmap={focusData?.heatmap || []}
                onSelectPage={handlePageChange}
              />
            )}
          </main>

          {/* Study Rail (6 Tabs: Focus, Quiz, Key Points, Ask AI, Outline, Search) */}
          {activeSidebarTab !== null && (
            <StudyRail
              source={source}
              activeTab={activeSidebarTab}
              onTabChange={setActiveSidebarTab}
              onClose={() => setActiveSidebarTab(null)}
              outline={outline}
              numPages={numPages || progress.numPages}
              currentPage={progress.page}
              onSelectPage={handlePageChange}
              searchQuery={searchQuery}
              searchMatches={searchMatches}
              currentMatchIndex={currentMatchIndex}
              isSearching={isSearching}
              onSearch={search}
              onClearSearch={clearSearch}
              onNextMatch={handleNextMatch}
              onPrevMatch={handlePrevMatch}
              onSelectMatch={handleSelectSearchMatch}
              keyPoints={keyPoints}
              onAddKeyPoint={(p: {
                title: string;
                quote?: string;
                page_number: number;
                tag?: KeyPointTag;
                confidence?: KeyPointConfidence;
              }) => addKeyPoint(p)}
              onUpdateKeyPoint={updateKeyPoint}
              onDeleteKeyPoint={deleteKeyPoint}
              onExportRevisionSheet={exportRevisionSheet}
              selectedAiText={selectedAiText}
              onClearSelectedAiText={() => setSelectedAiText(null)}
              onPageCheckCompleted={loadFocusData}
              focusData={focusData}
              isFocusLoading={isFocusLoading}
              isFocusRefreshing={isFocusRefreshing}
              onRefreshFocus={() => loadFocusData(true)}
              onMarkKeyPointReviewed={handleMarkKeyPointReviewed}
            />
          )}
        </div>
      </div>

      <ReaderShortcutsDialog
        open={showShortcutsDialog}
        onOpenChange={setShowShortcutsDialog}
      />
    </ReaderErrorBoundary>
  );
}
